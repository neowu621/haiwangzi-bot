import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/daily-settlement-reminder
 *
 * 每天早上跑（建議 09:00 Asia/Taipei），檢查有沒有「場次已過但訂單還沒結算」的單。
 * 若有 → 推 LINE 訊息給 ADMIN_LINE_USER_IDS 列出的所有 admin/boss。
 * 若無 → 不發送（不打擾）。
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 1. 找出「狀態仍為 pending 或 confirmed」且場次日期 < 今天的日潛訂單
  const dailyTrips = await prisma.divingTrip.findMany({
    where: { date: { lt: todayStart } },
    select: { id: true, date: true, startTime: true, diveSiteIds: true },
  });
  const dailyTripMap = new Map(dailyTrips.map((t) => [t.id, t]));
  const dailyTripIds = dailyTrips.map((t) => t.id);

  const dailyPending = dailyTripIds.length === 0
    ? []
    : await prisma.booking.findMany({
        where: {
          type: "daily",
          refId: { in: dailyTripIds },
          status: { in: ["pending", "confirmed"] },
        },
        include: { user: { select: { realName: true, displayName: true } } },
      });

  // 2. tour 同理
  const tours = await prisma.tourPackage.findMany({
    where: { dateEnd: { lt: todayStart } },
    select: { id: true, title: true, dateStart: true, dateEnd: true },
  });
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const tourIds = tours.map((t) => t.id);

  const tourPending = tourIds.length === 0
    ? []
    : await prisma.booking.findMany({
        where: {
          type: "tour",
          refId: { in: tourIds },
          status: { in: ["pending", "confirmed"] },
        },
        include: { user: { select: { realName: true, displayName: true } } },
      });

  const totalPending = dailyPending.length + tourPending.length;

  if (totalPending === 0) {
    return NextResponse.json({ ok: true, pending: 0, notified: 0, note: "no pending settlements" });
  }

  // 3. 組訊息
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "潛水團";

  let body = `⚠️ ${appName} 待結算提醒\n\n你有 ${totalPending} 筆訂單需要結算：\n`;

  // 日潛 (取前 10 筆避免訊息超長)
  for (const b of dailyPending.slice(0, 10)) {
    const trip = dailyTripMap.get(b.refId);
    const name = b.user.realName ?? b.user.displayName;
    const code = b.code ?? b.id.slice(0, 8);
    const dateStr = trip?.date.toISOString().slice(0, 10) ?? "";
    body += `• ${name} (${code}) — ${dateStr} ${trip?.startTime ?? ""} NT$${b.totalAmount.toLocaleString()}\n`;
  }
  if (dailyPending.length > 10) {
    body += `…（還有 ${dailyPending.length - 10} 筆日潛）\n`;
  }
  // 潛水團
  for (const b of tourPending.slice(0, 5)) {
    const tour = tourMap.get(b.refId);
    const name = b.user.realName ?? b.user.displayName;
    const code = b.code ?? b.id.slice(0, 8);
    body += `• ${name} (${code}) — ${tour?.title ?? "潛水團"} NT$${b.totalAmount.toLocaleString()}\n`;
  }
  if (tourPending.length > 5) {
    body += `…（還有 ${tourPending.length - 5} 筆潛水團）\n`;
  }

  if (baseUrl) {
    body += `\n👉 前往結算：${baseUrl}/admin/bookings`;
  }

  // 4. 發送給 ADMIN_LINE_USER_IDS
  const adminIds = (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminIds.length === 0 || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      pending: totalPending,
      notified: 0,
      note: "no ADMIN_LINE_USER_IDS or LINE_CHANNEL_ACCESS_TOKEN configured",
    });
  }

  const client = getLineClient();
  let notified = 0;
  for (const uid of adminIds) {
    try {
      await client.pushMessage({
        to: uid,
        messages: [{ type: "text", text: body }],
      });
      notified += 1;
    } catch (e) {
      console.error(`[daily-settlement] push to ${uid} failed`, e);
    }
  }

  return NextResponse.json({ ok: true, pending: totalPending, notified });
}
