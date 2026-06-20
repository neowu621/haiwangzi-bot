import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { notifyCustomer } from "@/lib/notify-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────────────────────
// /api/cron/reminders
// ─────────────────────────────────────────────────────────────
//
// 由 Cronicle 觸發。推薦頻率：每 15~30 分鐘一次（dedup 透過 ReminderLog 表保證不重發）。
//
// 認證：Authorization: Bearer <CRON_SECRET>  (header)
//
// v480：四種提醒全部改走 notifyCustomer —
//   LINE / Email / 站內通知 內容由 /admin/templates 模板組稿（後台填什麼發什麼），
//   各通道結果記入 MessageLog（發送紀錄頁可查）。
//   ReminderLog 僅作「同一 booking + type 只發一次」去重（channel=all；舊資料 line/email 也算已發）。
//
// 邏輯：
//   1. D-1 日潛行前提醒（d1_reminder）
//   2. 潛水團訂金催繳（deposit_notice）— 下訂後第 dueDays-2 天
//   3. 潛水團尾款預告（final_reminder）— 出發前 33 天
//   4. 潛水團尾款提醒（final_reminder）— 依各團 finalReminderDays
//
export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  // ── 1. Bearer auth ──────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "server_misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. parse params ─────────────────────────────────────────
  const url = new URL(req.url);
  const pollWindowMinutes = Math.max(
    1,
    Math.min(1440, Number(url.searchParams.get("pollWindowMinutes") ?? 30)),
  );
  const startedAt = new Date();

  // ── 3. LINE 未設定 → dry-run ─────────────────────────────────
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      sent: [],
      skipped: 0,
      pollWindowMinutes,
      note: "LINE_CHANNEL_ACCESS_TOKEN 未設定，dry-run",
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  const sent: Array<{ type: string; userId: string; bookingId: string }> = [];

  // 去重 helper：同一 booking + type 任一通道發過就跳過（相容舊 channel=line/email 紀錄）
  async function alreadySent(bookingId: string, type: string): Promise<boolean> {
    const dup = await prisma.reminderLog.findFirst({ where: { bookingId, type } });
    return !!dup;
  }
  async function markSent(bookingId: string, type: string): Promise<void> {
    // channel 用 enum 預設值（line）；去重查詢不分 channel，僅作「此 booking+type 已發」標記
    await prisma.reminderLog.create({ data: { bookingId, type } });
  }

  // ── 4. 計算明日 00:00 與 24:00 ───────────────────────────────
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  // v519：提前天數設定由訊息模板頁可調（site_config），讀不到時用原本寫死的預設
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  const d1LeadDays = (cfg as unknown as { d1ReminderLeadDays?: number })?.d1ReminderLeadDays ?? 1;
  const finalEarlyLeadDays = (cfg as unknown as { finalEarlyLeadDays?: number })?.finalEarlyLeadDays ?? 33;
  const depositRemindBeforeDays = (cfg as unknown as { depositRemindBeforeDays?: number })?.depositRemindBeforeDays ?? 2;

  // ── 5. 日潛行前提醒（d1_reminder）— 場次前 d1LeadDays 天 ──────
  const d1Target = new Date();
  d1Target.setDate(d1Target.getDate() + d1LeadDays);
  d1Target.setHours(0, 0, 0, 0);
  const d1TargetEnd = new Date(d1Target.getTime() + 86400000);
  const dailyTrips = await prisma.divingTrip.findMany({
    where: {
      date: { gte: d1Target, lt: d1TargetEnd },
      status: "open",
    },
  });
  for (const trip of dailyTrips) {
    const bookings = await prisma.booking.findMany({
      where: { refId: trip.id, type: "daily", status: "confirmed" },
    });
    const sites = trip.diveSiteIds.length
      ? await prisma.diveSite.findMany({
          where: { id: { in: trip.diveSiteIds } },
          select: { name: true },
        })
      : [];
    const siteName =
      sites.map((s) => s.name).join("、") || process.env.APP_DEFAULT_REGION || "東北角";
    const dateStr = trip.date.toISOString().slice(0, 10);
    const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";

    for (const b of bookings) {
      if (await alreadySent(b.id, "d1_reminder")) continue;
      notifyCustomer({
        userId: b.userId,
        templateKey: "d1_reminder",
        params: {
          date: dateStr,
          time: trip.startTime,
          site: siteName,
          gather: [trip.meetingPoint, trip.startTime].filter(Boolean).join(" ") || `集合時間：${trip.startTime}`,
          liffUrl,
        },
      });
      await markSent(b.id, "d1_reminder");
      sent.push({ type: "d1_reminder", userId: b.userId, bookingId: b.id });
    }
  }

  // ── 5b. 潛水團「訂金催繳」（deposit_notice）──────────────────
  // 規則：每位客人下訂後 depositDueDays(預設7) 天內繳訂金；
  //       於「截止前 2 天」(＝下訂後第5天) 催繳一次
  {
    const DEPOSIT_REMIND_BEFORE = depositRemindBeforeDays;
    const dStart = new Date();
    dStart.setHours(0, 0, 0, 0);
    const dEnd = new Date(dStart.getTime() + 86400000);
    const pend = await prisma.booking.findMany({
      where: {
        type: "tour",
        paymentStatus: "pending", // 訂金尚未付
        status: {
          notIn: [
            "cancelled_by_user",
            "cancelled_by_weather",
            "cancelled_unpaid",
            "awaiting_verify", // 已上傳匯款待審，不催
            "completed",
            "no_show",
          ],
        },
      },
    });
    for (const b of pend) {
      const tour = await prisma.tourPackage.findUnique({ where: { id: b.refId } });
      if (!tour || tour.dateStart < dStart) continue; // 找不到團 / 已出發 → 跳過
      const dueDays = tour.depositDueDays ?? 7;
      const remindDay = new Date(b.createdAt);
      remindDay.setHours(0, 0, 0, 0);
      remindDay.setDate(remindDay.getDate() + Math.max(1, dueDays - DEPOSIT_REMIND_BEFORE));
      if (!(remindDay >= dStart && remindDay < dEnd)) continue;
      if (await alreadySent(b.id, "deposit_reminder")) continue;

      const depositAmt = b.depositAmount > 0 ? b.depositAmount : tour.deposit;
      const dueDate = new Date(b.createdAt);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const deadlineStr = dueDate.toISOString().slice(0, 10);
      const payUrl = process.env.NEXT_PUBLIC_BASE_URL
        ? (b.payLinkToken
            ? `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${b.id}?t=${b.payLinkToken}`
            : `${process.env.NEXT_PUBLIC_BASE_URL}/liff/payment/${b.id}?type=deposit`)
        : "https://line.me/";

      notifyCustomer({
        userId: b.userId,
        templateKey: "deposit_notice",
        params: {
          tourTitle: tour.title,
          deposit: depositAmt,
          deadline: deadlineStr,
          bankName: process.env.BANK_NAME ?? "—",
          holder: process.env.BANK_HOLDER ?? "—",
          bankAccount: process.env.BANK_ACCOUNT ?? "—",
          refCode: b.code ?? "",
          url: payUrl,
        },
      });
      await markSent(b.id, "deposit_reminder");
      sent.push({ type: "deposit_reminder", userId: b.userId, bookingId: b.id });
    }
  }

  // ── 6a. 潛水團「尾款預告」（出發前 finalEarlyLeadDays 天，預設 33）──
  {
    const FINAL_EARLY_OFFSET = finalEarlyLeadDays;
    const dStart = new Date();
    dStart.setHours(0, 0, 0, 0);
    const dEnd = new Date(dStart.getTime() + 86400000);
    const upcoming = await prisma.tourPackage.findMany({ where: { dateStart: { gte: tomorrow } } });
    const earlyTours = upcoming.filter((t) => {
      const rd = new Date(t.dateStart);
      rd.setDate(rd.getDate() - FINAL_EARLY_OFFSET);
      rd.setHours(0, 0, 0, 0);
      return rd >= dStart && rd < dEnd;
    });
    for (const tour of earlyTours) {
      const bookings = await prisma.booking.findMany({
        where: { refId: tour.id, type: "tour", status: "confirmed", paymentStatus: "deposit_paid" },
      });
      for (const b of bookings) {
        const remaining = b.totalAmount - b.paidAmount;
        if (remaining <= 0) continue;
        if (await alreadySent(b.id, "final_reminder_early")) continue;
        const payUrl = process.env.NEXT_PUBLIC_BASE_URL
          ? (b.payLinkToken
              ? `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${b.id}?t=${b.payLinkToken}`
              : `${process.env.NEXT_PUBLIC_BASE_URL}/liff/payment/${b.id}?type=final`)
          : "https://line.me/";
        const deadline = tour.finalDeadline
          ? tour.finalDeadline.toISOString().slice(0, 10)
          : (() => { const d = new Date(tour.dateStart); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();

        notifyCustomer({
          userId: b.userId,
          templateKey: "final_reminder",
          params: {
            tourTitle: tour.title,
            remaining,
            deadline,
            daysLeft: 3,
            bankAccount: process.env.BANK_ACCOUNT ?? "—",
            url: payUrl,
          },
        });
        await markSent(b.id, "final_reminder_early");
        sent.push({ type: "final_reminder_early", userId: b.userId, bookingId: b.id });
      }
    }
  }

  // ── 6. 潛水團尾款提醒（依各團 finalReminderDays 動態決定 D-N）─
  const allTours = await prisma.tourPackage.findMany({
    where: { dateStart: { gte: tomorrow } },
  });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const toursIn3 = allTours.filter((t) => {
    const days = t.finalReminderDays ?? 3; // null 視為預設 3
    const reminderDate = new Date(t.dateStart);
    reminderDate.setDate(reminderDate.getDate() - days);
    reminderDate.setHours(0, 0, 0, 0);
    return reminderDate >= todayStart && reminderDate < todayEnd;
  });
  for (const tour of toursIn3) {
    const bookings = await prisma.booking.findMany({
      where: {
        refId: tour.id,
        type: "tour",
        status: "confirmed",
        paymentStatus: "deposit_paid",
      },
    });
    for (const b of bookings) {
      const remaining = b.totalAmount - b.paidAmount;
      if (remaining <= 0) continue;
      if (await alreadySent(b.id, "final_reminder")) continue;
      // v296：優先用公開付款連結（無需 LINE 登入）
      const bookingUrl = process.env.NEXT_PUBLIC_BASE_URL
        ? (b.payLinkToken
            ? `${process.env.NEXT_PUBLIC_BASE_URL}/pay/${b.id}?t=${b.payLinkToken}`
            : `${process.env.NEXT_PUBLIC_BASE_URL}/liff/payment/${b.id}?type=final`)
        : "https://line.me/";
      const daysLeft = tour.finalReminderDays ?? 30;
      const deadline = tour.finalDeadline
        ? tour.finalDeadline.toISOString().slice(0, 10)
        : "—";

      notifyCustomer({
        userId: b.userId,
        templateKey: "final_reminder",
        params: {
          tourTitle: tour.title,
          remaining,
          deadline,
          daysLeft,
          bankAccount: process.env.BANK_ACCOUNT ?? "—",
          url: bookingUrl,
        },
      });
      await markSent(b.id, "final_reminder");
      sent.push({ type: "final_reminder", userId: b.userId, bookingId: b.id });
    }
  }

  return NextResponse.json({
    ok: true,
    pollWindowMinutes,
    sent,
    counts: { sent: sent.length },
    note: "各通道發送結果見 MessageLog（後台發送紀錄）",
    tookMs: Date.now() - startedAt.getTime(),
  });
}
