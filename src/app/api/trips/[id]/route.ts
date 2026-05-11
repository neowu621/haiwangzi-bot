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

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: trip.diveSiteIds } },
  });
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
    available: trip.capacity - (booked._sum.participants ?? 0),
    sites,
    coaches,
  });
}
