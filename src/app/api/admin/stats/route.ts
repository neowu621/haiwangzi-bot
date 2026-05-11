import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/stats
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const [users, customers, coaches, admins, trips, openTrips, tours, openTours, bookings, pendingProofs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "coach" } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.divingTrip.count(),
    prisma.divingTrip.count({ where: { status: "open" } }),
    prisma.tourPackage.count(),
    prisma.tourPackage.count({ where: { status: "open" } }),
    prisma.booking.count(),
    prisma.paymentProof.count({ where: { verifiedAt: null } }),
  ]);

  const revenueAgg = await prisma.booking.aggregate({
    where: { status: { in: ["confirmed", "completed"] } },
    _sum: { paidAmount: true, totalAmount: true },
  });

  return NextResponse.json({
    users: { total: users, customers, coaches, admins },
    trips: { total: trips, open: openTrips },
    tours: { total: tours, open: openTours },
    bookings: { total: bookings },
    revenue: {
      paid: revenueAgg._sum.paidAmount ?? 0,
      booked: revenueAgg._sum.totalAmount ?? 0,
    },
    pendingProofs,
  });
}
