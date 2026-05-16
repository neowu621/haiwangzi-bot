import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/coach/today - 今日場次 + 報名清單
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const trips = await prisma.divingTrip.findMany({
    where: { date: { gte: today, lt: tomorrow } },
    orderBy: { startTime: "asc" },
  });

  const tripIds = trips.map((t) => t.id);
  const bookings = await prisma.booking.findMany({
    where: {
      refId: { in: tripIds },
      type: "daily",
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    include: {
      user: {
        select: {
          displayName: true,
          realName: true,
          phone: true,
          cert: true,
          logCount: true,
          blacklisted: true,
          vipLevel: true,
        },
      },
    },
  });

  const allSiteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } } });
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  return NextResponse.json({
    trips: trips.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      startTime: t.startTime,
      isNightDive: t.isNightDive,
      tankCount: t.tankCount,
      capacity: t.capacity,
      status: t.status,
      sites: t.diveSiteIds.map((id) => siteMap.get(id)).filter(Boolean),
      bookings: bookings
        .filter((b) => b.refId === t.id)
        .map((b) => ({
          id: b.id,
          name: b.user.realName ?? b.user.displayName,
          phone: b.user.phone,
          cert: b.user.cert,
          logCount: b.user.logCount,
          rentalGear: b.rentalGear,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          paymentStatus: b.paymentStatus,
          notes: b.notes,
          participants: b.participants,
          participantDetails: b.participantDetails, // 潛伴明細
          status: b.status, // confirmed / completed / no_show 等
          overCapacity: b.overCapacity,
          blacklisted: b.user.blacklisted,
          vipLevel: b.user.vipLevel,
        })),
    })),
  });
}
