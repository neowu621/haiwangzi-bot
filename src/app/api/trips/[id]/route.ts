import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/trips/:id
// 單一日潛場次詳細
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const trip = await prisma.divingTrip.findUnique({ where: { id } });
  if (!trip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const foundSites = await prisma.diveSite.findMany({
    where: { id: { in: trip.diveSiteIds } },
  });
  const siteMap = new Map(foundSites.map((s) => [s.id, s]));
  // v153 起：diveSiteIds 可能直接存中文名，DiveSite 表內找不到時用名稱本身
  const sites = trip.diveSiteIds.map((id) =>
    siteMap.get(id) ?? { id, name: id, region: null, description: "", difficulty: null, maxDepth: "", features: [], images: [], youtubeUrl: null, locationUrl: null, cautions: null },
  );

  const coaches = await prisma.coach.findMany({
    where: { id: { in: trip.coachIds } },
  });
  const booked = await prisma.booking.aggregate({
    where: { refId: id, type: "daily", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });

  return NextResponse.json({
    ...trip,
    date: trip.date.toISOString().slice(0, 10),
    booked: booked._sum.participants ?? 0,
    // capacity null = 無上限（available 也給 null，UI 顯示「可預約」）
    available:
      trip.capacity == null
        ? null
        : Math.max(0, trip.capacity - (booked._sum.participants ?? 0)),
    sites,
    coaches,
  });
}
