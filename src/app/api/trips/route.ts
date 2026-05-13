import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      // capacity null = 無上限
      const available = t.capacity == null ? 999 : Math.max(0, t.capacity - booked);
      return {
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        startTime: t.startTime,
        isNightDive: t.isNightDive,
        isScooter: t.isScooter,
        tankCount: t.tankCount,
        capacity: t.capacity, // null = 無上限
        booked,
        available,
        pricing: t.pricing,
        sites: t.diveSiteIds.map((id) => siteMap.get(id)).filter(Boolean),
        coachIds: t.coachIds,
        status: t.status,
      };
    }),
  });
}
