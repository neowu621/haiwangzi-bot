import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/cleanup-old-payment-proofs
 *
 * 每天跑（建議 03:00 Asia/Taipei）。
 *
 * v238：規則改為「活動結束日 + 30 天」後才清除（不再用 uploadedAt + 30）
 * - 日潛：活動結束日 = trip.date
 * - 潛旅：活動結束日 = tour.dateEnd
 * - 達標的 PaymentProof 把 imageKey 從 R2 刪除 + 設成 null（標示已清理）
 * - DB 紀錄保留（last5 / note / amount 用來查帳）
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // v238：撈所有 imageKey 還存在的 verified proofs，後續判斷活動是否已結束 >30 天
  const candidates = await prisma.paymentProof.findMany({
    where: {
      verifiedAt: { not: null },
      imageKey: { not: null },
      NOT: { imageKey: "" },
    },
    select: { id: true, imageKey: true, bookingId: true },
    take: 1000,
  });

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0 });
  }

  // 撈對應 bookings + trip/tour 結束日
  const bookings = await prisma.booking.findMany({
    where: { id: { in: candidates.map((p) => p.bookingId) } },
    select: { id: true, type: true, refId: true },
  });
  const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true } }) : [],
    tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, dateEnd: true } }) : [],
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t.date]));
  const tourMap = new Map(tours.map((t) => [t.id, t.dateEnd]));
  const bookingEndDate = new Map<string, Date>();
  for (const b of bookings) {
    const end = b.type === "daily" ? tripMap.get(b.refId) : tourMap.get(b.refId);
    if (end) bookingEndDate.set(b.id, end);
  }

  // 篩出「活動結束 + 30 天」已過的
  const toClean = candidates.filter((p) => {
    const end = bookingEndDate.get(p.bookingId);
    return end && end <= thirtyDaysAgo;
  });

  let cleaned = 0;
  let failed = 0;

  for (const p of toClean) {
    try {
      // 只有 R2 key（非 base64 data URL）才刪 R2 物件
      const isR2Key = p.imageKey && !p.imageKey.startsWith("data:");
      if (isR2Key && r2Configured()) {
        await deleteObject("payments", p.imageKey!);
      }
      await prisma.paymentProof.update({
        where: { id: p.id },
        data: { imageKey: null },
      });
      cleaned += 1;
    } catch (e) {
      console.error(`[cleanup-proofs] failed ${p.id}`, e);
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    cleaned,
    failed,
    candidates: candidates.length,
    eligible: toClean.length,
    rule: "活動結束日 + 30 天",
  });
}
