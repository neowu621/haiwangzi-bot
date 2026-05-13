import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const tour = await prisma.tourPackage.findUnique({ where: { id } });
  if (!tour) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: tour.diveSiteIds } },
  });
  const booked = await prisma.booking.aggregate({
    where: { refId: id, type: "tour", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });

  return NextResponse.json({
    ...tour,
    dateStart: tour.dateStart.toISOString().slice(0, 10),
    dateEnd: tour.dateEnd.toISOString().slice(0, 10),
    depositDeadline: tour.depositDeadline?.toISOString() ?? null,
    finalDeadline: tour.finalDeadline?.toISOString() ?? null,
    sites,
    booked: booked._sum.participants ?? 0,
    available:
      tour.capacity == null
        ? 999
        : Math.max(0, tour.capacity - (booked._sum.participants ?? 0)),
  });
}
