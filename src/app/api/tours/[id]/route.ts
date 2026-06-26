import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached, TTL_LISTING } from "@/lib/cache"; // v693：版本號快取

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // v693：命中快取時零 DB；潛旅/預約寫入版本即 +1 自動失效（含空位數）
  const payload = await cached(`tour:${id}`, "tours", TTL_LISTING, async () => {
  const tour = await prisma.tourPackage.findUnique({ where: { id } });
  if (!tour) return null;

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: tour.diveSiteIds } },
  });
  const booked = await prisma.booking.aggregate({
    where: { refId: id, type: "tour", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });

  return {
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
  };
  });
  if (!payload) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(payload);
}
