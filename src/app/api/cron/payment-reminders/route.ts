import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";
import { computePaymentDeadline, activityStartFromTaipei } from "@/lib/payment-deadline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v272: /api/cron/payment-reminders
 *
 * 每天跑（建議 09:00 Asia/Taipei）。三段式催繳（v349：僅【日潛 daily】，潛旅走 /api/cron/reminders）：
 *   D+2 提醒：訂單 createdAt > 2 天，paymentStatus 還是 pending → 推 LINE + Email
 *   D+7 警告：> 7 天還沒付 → 推「最後通知」訊息
 *   自動取消（v367）：逾「付款截止日 = min(下訂+10天, 出發前48h)」未付 → status=cancelled_unpaid + 通知
 *
 * 用 ReminderLog 去重（type=payment_d3 / payment_d7 / payment_d10_cancel）
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // v349：第一段提醒改「下訂後 2 天」(D+2)；本 cron 只管【日潛 daily】，
  //        潛旅 (tour) 的訂金/尾款催繳走 /api/cron/reminders，避免重複催繳
  const d2 = new Date(now); d2.setDate(d2.getDate() - 2);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);

  // v367：移除 createdAt < d2 的硬篩選 —— 否則「下訂沒幾天但活動很快」的訂單
  //        會來不及在出發前自動取消。改為抓全部日潛 pending，再逐筆用
  //        computePaymentDeadline（min(下訂+10天, 出發前48h)）判斷是否該取消。
  //        D+2 / D+7 提醒仍各自用 createdAt 門檻 gate，不受影響。
  const pendingBookings = await prisma.booking.findMany({
    where: {
      type: "daily", // v349：只催日潛
      paymentStatus: "pending",
      status: { in: ["pending", "confirmed"] },
    },
    include: { user: true, reminderLogs: true },
  });

  // v367：取場次出發時間，付款截止日 cap 在出發前 48 小時
  const tripIds = [...new Set(pendingBookings.map((b) => b.refId))];
  const trips = tripIds.length
    ? await prisma.divingTrip.findMany({
        where: { id: { in: tripIds } },
        select: { id: true, date: true, startTime: true },
      })
    : [];
  const tripMap = new Map(trips.map((t) => [t.id, t]));

  const results = { d3_sent: 0, d7_sent: 0, d10_cancelled: 0, errors: [] as string[] };
  const lineClient = getLineClient();

  for (const b of pendingBookings) {
    const reminderTypes = new Set(b.reminderLogs.map((r) => r.type));
    // v367：付款截止日 = min(下訂+10天, 出發前48h)。逾期即自動取消。
    const trip = tripMap.get(b.refId);
    const activityStart = trip
      ? activityStartFromTaipei(trip.date.toISOString().slice(0, 10), trip.startTime)
      : null;
    const deadline = computePaymentDeadline(b.createdAt, activityStart);
    // 自動取消（逾付款截止日）
    if (now >= deadline && !reminderTypes.has("payment_d10_cancel")) {
      try {
        await prisma.booking.update({
          where: { id: b.id },
          data: {
            status: "cancelled_unpaid",
            cancellationReason: "v367: 逾付款截止日（下訂+10天 與 出發前48h 取較早者）未付款，自動取消",
          },
        });
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "payment_d10_cancel", channel: "line" },
        });
        // 通知客戶
        const text = `⚠️ 訂單已自動取消\n\n您的訂單 #${b.id.slice(0, 8)} 因超過 10 天未完成付款，系統已自動取消。\n名額已釋出給其他客戶。\n\n如需重新預約請至 LIFF 預約 App。\n— 海王子潛水`;
        if ((b.user.notifyByLine ?? true) && lineClient) {
          try { await lineClient.pushMessage({ to: b.userId, messages: [{ type: "text", text }] }); } catch (e) { results.errors.push(`LINE ${b.id}: ${e}`); }
        }
        if ((b.user.notifyByEmail ?? true) && b.user.email) {
          void sendEmail({ to: b.user.email, subject: "訂單已自動取消 — 海王子潛水", text }).catch((e) => results.errors.push(`Email ${b.id}: ${e}`));
        }
        results.d10_cancelled += 1;
        continue;
      } catch (e) {
        results.errors.push(`D+10 ${b.id}: ${e}`);
        continue;
      }
    }
    // D+7：最後通知
    if (b.createdAt < d7 && !reminderTypes.has("payment_d7")) {
      try {
        const text = `🚨 付款最後通知\n\n您的訂單 #${b.id.slice(0, 8)} 已超過 7 天未付款。\n若 3 天內仍未完成，系統將自動取消訂單。\n\n金額 NT$ ${b.totalAmount.toLocaleString()}\n請上 LIFF App 完成付款並上傳轉帳截圖。\n— 海王子潛水`;
        if ((b.user.notifyByLine ?? true) && lineClient) {
          await lineClient.pushMessage({ to: b.userId, messages: [{ type: "text", text }] });
        }
        if ((b.user.notifyByEmail ?? true) && b.user.email) {
          void sendEmail({ to: b.user.email, subject: "🚨 付款最後通知 — 海王子潛水", text });
        }
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "payment_d7", channel: "line" },
        });
        results.d7_sent += 1;
        continue;
      } catch (e) {
        results.errors.push(`D+7 ${b.id}: ${e}`);
        continue;
      }
    }
    // D+2：友善提醒（v349：下訂 2 天未付款）
    if (b.createdAt < d2 && !reminderTypes.has("payment_d3")) {
      try {
        const text = `📋 付款提醒\n\n您的訂單 #${b.id.slice(0, 8)} 已預約成功 2 天，目前尚未收到付款。\n\n金額 NT$ ${b.totalAmount.toLocaleString()}\n請上 LIFF App 完成付款並上傳轉帳截圖，\n以保留您的名額。\n\n— 海王子潛水`;
        if ((b.user.notifyByLine ?? true) && lineClient) {
          await lineClient.pushMessage({ to: b.userId, messages: [{ type: "text", text }] });
        }
        if ((b.user.notifyByEmail ?? true) && b.user.email) {
          void sendEmail({ to: b.user.email, subject: "📋 付款提醒 — 海王子潛水", text });
        }
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "payment_d3", channel: "line" },
        });
        results.d3_sent += 1;
      } catch (e) {
        results.errors.push(`D+3 ${b.id}: ${e}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    pendingBookingsScanned: pendingBookings.length,
    ...results,
    rule: "（僅日潛）D+2 提醒 / D+7 警告 / 自動取消＝min(下訂+10天, 出發前48h) 逾期",
  });
}
