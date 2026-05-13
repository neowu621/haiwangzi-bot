import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// /api/cron/reminders
// ─────────────────────────────────────────────────────────────
//
// 由 Cronicle (https://neowu-cron-hub.zeabur.app) 觸發。
// 推薦頻率：每 15~30 分鐘一次（dedup 透過 ReminderLog 表保證不重發）。
//
// 認證：Authorization: Bearer <CRON_SECRET>  (header)
//   - CRON_SECRET 設在 Zeabur haiwangzi-bot 環境變數
//   - Cronicle 端設環境變數 HAIWANGZI_CRON_SECRET 並在 curl --header 帶入
//
// 參數：?pollWindowMinutes=30  (選填，預設 30)
//   - 紀錄用，方便 log 對齊 cron 頻率
//   - 真實 dedup 由 ReminderLog 表負責 (一筆 booking + type 只發一次)
//
// 邏輯：
//   1. D-1 日潛行前提醒：明日所有 open 的 daily trip 之 confirmed bookings
//   2. 潛水團尾款提醒：3 天後出發、deposit_paid 但尾款未清的 booking
//   3. (未來可擴充：D-1 行前手冊、D-3 訂金到期...)
//
// 支援 GET (瀏覽器手動測試) 與 POST (Cronicle 標準呼叫)。
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
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── 2. parse params ─────────────────────────────────────────
  const url = new URL(req.url);
  const pollWindowMinutes = Math.max(
    1,
    Math.min(1440, Number(url.searchParams.get("pollWindowMinutes") ?? 30)),
  );
  const startedAt = new Date();

  // ── 3. LINE client (dry-run if not configured) ──────────────
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

  const client = getLineClient();
  const sent: Array<{ type: string; userId: string; bookingId: string }> = [];
  const errors: Array<{ type: string; bookingId: string; error: string }> = [];

  // ── 4. 計算明日 00:00 與 24:00 ───────────────────────────────
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow.getTime() + 86400000);

  // ── 5. D-1 日潛行前提醒 ─────────────────────────────────────
  const dailyTrips = await prisma.divingTrip.findMany({
    where: {
      date: { gte: tomorrow, lt: dayAfter },
      status: "open",
    },
  });
  for (const trip of dailyTrips) {
    const bookings = await prisma.booking.findMany({
      where: {
        refId: trip.id,
        type: "daily",
        status: "confirmed",
      },
      include: { user: true },
    });
    for (const b of bookings) {
      const dup = await prisma.reminderLog.findFirst({
        where: { bookingId: b.id, type: "d1_reminder" },
      });
      if (dup) continue;
      try {
        const msg = buildFlexByKey(
          "d1_reminder",
          {
            date: trip.date.toISOString().slice(0, 10),
            time: trip.startTime,
            site: "東北角",
            weather: "晴",
            wave: "1m",
            water: "24°C",
            vis: "8-12m",
            gather: "集合時間：" + trip.startTime,
          },
          `明日 ${trip.startTime} 行前提醒`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: b.userId, messages: [msg as any] });
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "d1_reminder", channel: "line" },
        });
        sent.push({ type: "d1_reminder", userId: b.userId, bookingId: b.id });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await prisma.reminderLog.create({
          data: {
            bookingId: b.id,
            type: "d1_reminder",
            channel: "line",
            error: errMsg,
          },
        });
        errors.push({ type: "d1_reminder", bookingId: b.id, error: errMsg });
      }
    }
  }

  // ── 6. 潛水團尾款提醒（依各團 finalReminderDays 動態決定 D-N） ─────
  // 把所有未過期的潛水團拿出來，根據 finalReminderDays 計算它應該在「今天」推
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
      const dup = await prisma.reminderLog.findFirst({
        where: { bookingId: b.id, type: "final_reminder" },
      });
      if (dup) continue;
      const remaining = b.totalAmount - b.paidAmount;
      if (remaining <= 0) continue;
      try {
        const msg = buildFlexByKey(
          "final_reminder",
          {
            tourTitle: tour.title,
            remaining,
            deadline: tour.finalDeadline
              ? tour.finalDeadline.toISOString().slice(0, 10)
              : "—",
            daysLeft: tour.finalReminderDays ?? 3,
            bankAccount: process.env.BANK_ACCOUNT ?? "—",
            url: process.env.NEXT_PUBLIC_BASE_URL
              ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/payment/${b.id}?type=final`
              : "https://line.me/",
          },
          `${tour.title} 尾款提醒`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: b.userId, messages: [msg as any] });
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "final_reminder", channel: "line" },
        });
        sent.push({
          type: "final_reminder",
          userId: b.userId,
          bookingId: b.id,
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await prisma.reminderLog.create({
          data: {
            bookingId: b.id,
            type: "final_reminder",
            channel: "line",
            error: errMsg,
          },
        });
        errors.push({
          type: "final_reminder",
          bookingId: b.id,
          error: errMsg,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pollWindowMinutes,
    sent,
    errors,
    counts: { sent: sent.length, errors: errors.length },
    tookMs: Date.now() - startedAt.getTime(),
  });
}
