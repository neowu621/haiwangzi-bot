import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v272: /api/cron/payment-reminders
 *
 * 每天跑（建議 09:00 Asia/Taipei）。三段式催繳：
 *   D+3 提醒：訂單 createdAt > 3 天，paymentStatus 還是 pending → 推 LINE + Email
 *   D+7 警告：> 7 天還沒付 → 推「最後通知」訊息
 *   D+10 自動取消：> 10 天還沒付 → status=cancelled_by_user + 通知
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
  const d3 = new Date(now); d3.setDate(d3.getDate() - 3);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d10 = new Date(now); d10.setDate(d10.getDate() - 10);

  // 撈所有未付款訂單（含 pending + deposit_paid 但尾款未付的也可考慮，這版先只看 pending）
  const pendingBookings = await prisma.booking.findMany({
    where: {
      paymentStatus: "pending",
      status: { in: ["pending", "confirmed"] },
      createdAt: { lt: d3 }, // 至少 3 天以上才需要管
    },
    include: { user: true, reminderLogs: true },
  });

  const results = { d3_sent: 0, d7_sent: 0, d10_cancelled: 0, errors: [] as string[] };
  const lineClient = getLineClient();

  for (const b of pendingBookings) {
    const reminderTypes = new Set(b.reminderLogs.map((r) => r.type));
    // D+10：自動取消
    if (b.createdAt < d10 && !reminderTypes.has("payment_d10_cancel")) {
      try {
        await prisma.booking.update({
          where: { id: b.id },
          data: {
            status: "cancelled_by_user",
            cancellationReason: "v272: 超過 10 天未付款自動取消",
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
    // D+3：友善提醒
    if (b.createdAt < d3 && !reminderTypes.has("payment_d3")) {
      try {
        const text = `📋 付款提醒\n\n您的訂單 #${b.id.slice(0, 8)} 已預約成功 3 天，目前尚未收到付款。\n\n金額 NT$ ${b.totalAmount.toLocaleString()}\n請上 LIFF App 完成付款並上傳轉帳截圖，\n以保留您的名額。\n\n— 海王子潛水`;
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
    rule: "D+3 提醒 / D+7 警告 / D+10 自動取消",
  });
}
