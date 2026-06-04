import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/lv1-prepay-reminder
 *
 * 每天凌晨跑（建議 00:30 Asia/Taipei）。
 *
 * LV1 會員規則：必須在出發前 3 天付清，不能用「現場支付」。
 * 此 cron 找出：
 *   - LV1 客戶
 *   - 場次日期 距今 ≤ 3 天 且 > 0 天（場次還沒到）
 *   - paymentStatus 不是 fully_paid
 * → 推 LINE 提醒客戶儘快付款，否則訂單會被自動取消（policy）
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const threeDaysLater = new Date(todayStart);
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);

  // 找出 3 天內的日潛場次
  const upcomingTrips = await prisma.divingTrip.findMany({
    where: { date: { gte: todayStart, lte: threeDaysLater }, status: "open" },
    select: { id: true, date: true, startTime: true },
  });
  const tripMap = new Map(upcomingTrips.map((t) => [t.id, t]));

  const tripIds = upcomingTrips.map((t) => t.id);
  if (tripIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, note: "no upcoming trips in 3 days" });
  }

  // 找這些場次的 pending 訂單，再過濾 LV1 + 未付清
  const bookings = await prisma.booking.findMany({
    where: {
      type: "daily",
      refId: { in: tripIds },
      status: { in: ["pending", "confirmed"] },
      paymentStatus: { not: "fully_paid" },
    },
    include: { user: true },
  });

  const lv1Bookings = bookings.filter((b) => (b.user.vipLevel ?? 1) === 1);

  if (lv1Bookings.length === 0) {
    return NextResponse.json({ ok: true, notified: 0, note: "no LV1 unpaid bookings" });
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      notified: 0,
      candidates: lv1Bookings.length,
      note: "LINE_CHANNEL_ACCESS_TOKEN not set, dry-run",
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const client = getLineClient();
  let notified = 0;

  for (const b of lv1Bookings) {
    if (!b.user.notifyByLine) continue;
    const trip = tripMap.get(b.refId);
    if (!trip) continue;
    const dateStr = trip.date.toISOString().slice(0, 10);
    const remain = b.totalAmount - b.paidAmount;

    const message =
      `💳 ${process.env.NEXT_PUBLIC_APP_NAME ?? "海王子"} 繳費提醒\n\n` +
      `您的潛水訂單 ${b.code ?? b.id.slice(0, 8)} 即將出發：\n` +
      `📅 場次：${dateStr} ${trip.startTime}\n` +
      `💰 待繳餘額：NT$ ${remain.toLocaleString()}\n\n` +
      `⚠️ LV1 會員需在出發前 3 天付清。請儘速完成匯款並上傳憑證，否則訂單可能被自動取消。\n` +
      // v296：改用公開付款連結（無需 LINE 登入），含 token
      (baseUrl && b.payLinkToken
        ? `\n👉 ${baseUrl}/pay/${b.id}?t=${b.payLinkToken}`
        : (baseUrl ? `\n👉 ${baseUrl}/liff/payment/${b.id}` : ""));

    try {
      await client.pushMessage({
        to: b.userId,
        messages: [{ type: "text", text: message }],
      });
      notified += 1;
    } catch (e) {
      console.error(`[lv1-prepay] push to ${b.userId} failed`, e);
    }
  }

  return NextResponse.json({ ok: true, notified, candidates: lv1Bookings.length });
}
