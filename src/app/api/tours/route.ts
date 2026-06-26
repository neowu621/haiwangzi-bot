import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_LIST_CACHE_HEADERS } from "@/lib/http-cache";
import { cached, TTL_LISTING } from "@/lib/cache"; // v693：版本號快取

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tours - 列出開放中的潛水團（v658：只顯示尚未結束的，過期不顯示）
export async function GET() {
  // 今天起算（Asia/Taipei 當日 00:00）；dateEnd >= 今天 → 仍進行中/未來才列出
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`);
  // v693：命中快取時零 DB（key 含當日，跨日自動換鍵）；潛旅/預約寫入版本即 +1 自動失效
  const payload = await cached(`tours:${todayStr}`, "tours", TTL_LISTING, async () => {
  const tours = await prisma.tourPackage.findMany({
    where: { status: { in: ["open", "full"] }, dateEnd: { gte: todayStart } },
    orderBy: { dateStart: "asc" },
  });

  // 算每個 tour 的 booked count
  const ids = tours.map((t) => t.id);
  const bookings = await prisma.booking.groupBy({
    by: ["refId"],
    where: { refId: { in: ids }, type: "tour", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });
  const bookedMap = new Map(bookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  return {
    tours: tours.map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      dateStart: t.dateStart.toISOString().slice(0, 10),
      dateEnd: t.dateEnd.toISOString().slice(0, 10),
      basePrice: t.basePrice,
      deposit: t.deposit,
      capacity: t.capacity,
      booked: bookedMap.get(t.id) ?? 0,
      available:
        t.capacity == null
          ? null
          : Math.max(0, t.capacity - (bookedMap.get(t.id) ?? 0)),
      status: t.status,
      // v186 行銷欄位
      subtitle: t.subtitle,
      durationLabel: t.durationLabel,
      diveStyles: t.diveStyles,
      beginnerFriendly: t.beginnerFriendly,
      tanksCount: t.tanksCount,
      extraNote: t.extraNote,
    })),
  };
  });
  return NextResponse.json(payload, { headers: PUBLIC_LIST_CACHE_HEADERS });
}
