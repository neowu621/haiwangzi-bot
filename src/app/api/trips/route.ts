import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_LIST_CACHE_HEADERS } from "@/lib/http-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/trips?from=YYYY-MM-DD&to=YYYY-MM-DD
// 列出某段時間的日潛場次,含 booked count + dive site info
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const where: Parameters<typeof prisma.divingTrip.findMany>[0] = {
    where: { status: { in: ["open", "full"] } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  };
  if (from || to) {
    where.where = {
      ...where.where,
      date: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
  }

  const trips = await prisma.divingTrip.findMany(where);

  // 算每個 trip 的 booked count + site info
  // 排除所有 cancelled / no_show（這些不應該佔位置）
  const tripIds = trips.map((t) => t.id);
  const bookings = await prisma.booking.groupBy({
    by: ["refId"],
    where: {
      refId: { in: tripIds },
      type: "daily",
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    _sum: { participants: true },
  });
  const bookingMap = new Map(bookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  const allSiteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } } });
  const siteMap = new Map(sites.map((s) => [s.id, s]));

  return NextResponse.json({
    trips: trips.map((t) => {
      const booked = bookingMap.get(t.id) ?? 0;
      // capacity null = 無上限（available 給 null，UI 顯示「可預約」不顯示數字）
      const available = t.capacity == null ? null : Math.max(0, t.capacity - booked);
      // v153 起：diveSiteIds 可能是直接存的中文名稱，DiveSite 表內找不到時用名稱本身當顯示
      const sites = t.diveSiteIds.map((id) => {
        const found = siteMap.get(id);
        return found ?? { id, name: id }; // fallback：id 本身就是潛點名
      });
      return {
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        startTime: t.startTime,
        isNightDive: t.isNightDive,
        isScooter: t.isScooter,
        tankCount: t.tankCount,
        capacity: t.capacity, // null = 無上限
        booked,
        available, // null = 無上限
        pricing: t.pricing,
        sites,
        coachIds: t.coachIds,
        status: t.status,
      };
    }),
  }, { headers: PUBLIC_LIST_CACHE_HEADERS });
}
