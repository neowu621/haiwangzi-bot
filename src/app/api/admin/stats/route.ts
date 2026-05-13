import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/stats
//
// 主控台顯示用，重點是 "operational" 數字：
//   - trips:   bookable = open 且 date >= today（未來可預約的場次）
//   - tours:   bookable = open 且 dateStart >= today
//   - bookings: active = 還沒執行完的訂單（status in pending/confirmed/deposit_paid，且對應 event 未過）
// 同時保留 total（含過去取消的）方便追蹤。
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    users,
    customers,
    coaches,
    admins,
    trips,
    openTrips,
    bookableTrips,
    tours,
    openTours,
    bookableTours,
    bookings,
    pendingProofs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "coach" } }),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.divingTrip.count(),
    prisma.divingTrip.count({ where: { status: "open" } }),
    // 可預約：open + 未來日期
    prisma.divingTrip.count({
      where: { status: "open", date: { gte: todayStart } },
    }),
    prisma.tourPackage.count(),
    prisma.tourPackage.count({ where: { status: "open" } }),
    // 可預約：open + 未來出發日
    prisma.tourPackage.count({
      where: { status: "open", dateStart: { gte: todayStart } },
    }),
    prisma.booking.count(),
    prisma.paymentProof.count({ where: { verifiedAt: null } }),
  ]);

  // 算「尚未執行」訂單：status 為 pending / confirmed（含 deposit_paid 已是 confirmed status）
  // 並且關聯的 trip.date / tour.dateStart >= today
  // 因為 booking.refId 多型（指向 trip 或 tour），分兩段查
  const activeDailyBookings = await prisma.booking.count({
    where: {
      type: "daily",
      status: { in: ["pending", "confirmed"] },
      refId: {
        in: (
          await prisma.divingTrip.findMany({
            where: { date: { gte: todayStart } },
            select: { id: true },
          })
        ).map((t) => t.id),
      },
    },
  });
  const activeTourBookings = await prisma.booking.count({
    where: {
      type: "tour",
      status: { in: ["pending", "confirmed"] },
      refId: {
        in: (
          await prisma.tourPackage.findMany({
            where: { dateStart: { gte: todayStart } },
            select: { id: true },
          })
        ).map((t) => t.id),
      },
    },
  });
  const activeBookings = activeDailyBookings + activeTourBookings;

  const revenueAgg = await prisma.booking.aggregate({
    where: { status: { in: ["confirmed", "completed"] } },
    _sum: { paidAmount: true, totalAmount: true },
  });

  return NextResponse.json({
    users: { total: users, customers, coaches, admins },
    trips: { total: trips, open: openTrips, bookable: bookableTrips },
    tours: { total: tours, open: openTours, bookable: bookableTours },
    bookings: { total: bookings, active: activeBookings },
    revenue: {
      paid: revenueAgg._sum.paidAmount ?? 0,
      booked: revenueAgg._sum.totalAmount ?? 0,
    },
    pendingProofs,
  });
}
