import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bookings/by-trip
//   把訂單依「日潛場次」或「潛水團」聚合，回每個 trip/tour 的：
//   - bookingCount: 訂單數（未取消的）
//   - participantSum: 總參加人數
//   - tankSum: 總潛水支數 (人數 × tankCount)
//   - paidSum / totalSum
//   - 訂單明細陣列（每筆 user + paymentStatus + paymentMethod）
//
//   用途：「訂單管理」列出開團 + 點下去看明細
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  // 撈所有未取消的 bookings
  const bookings = await prisma.booking.findMany({
    where: {
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    include: {
      user: { select: { displayName: true, realName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // 拿全部相關 trip/tour
  const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours, sites] = await Promise.all([
    prisma.divingTrip.findMany({
      where: { id: { in: dailyIds } },
      select: {
        id: true,
        date: true,
        startTime: true,
        diveSiteIds: true,
        tankCount: true,
        capacity: true,
        status: true,
      },
    }),
    prisma.tourPackage.findMany({
      where: { id: { in: tourIds } },
      select: {
        id: true,
        title: true,
        dateStart: true,
        dateEnd: true,
        capacity: true,
        status: true,
      },
    }),
    prisma.diveSite.findMany({ select: { id: true, name: true } }),
  ]);
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  // group
  const tripGroups = trips.map((t) => {
    const refBookings = bookings.filter(
      (b) => b.type === "daily" && b.refId === t.id,
    );
    const participantSum = refBookings.reduce(
      (s, b) => s + b.participants,
      0,
    );
    const tankSum = participantSum * t.tankCount;
    const paidSum = refBookings.reduce((s, b) => s + b.paidAmount, 0);
    const totalSum = refBookings.reduce((s, b) => s + b.totalAmount, 0);
    return {
      kind: "daily" as const,
      id: t.id,
      title: `${t.date.toISOString().slice(0, 10)} ${t.startTime}`,
      sites: t.diveSiteIds.map((id) => siteMap.get(id) ?? "—"),
      tankCount: t.tankCount,
      capacity: t.capacity,
      status: t.status,
      bookingCount: refBookings.length,
      participantSum,
      tankSum,
      paidSum,
      totalSum,
      bookings: refBookings.map((b) => ({
        id: b.id,
        userName: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        participants: b.participants,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod,
        status: b.status,
        createdAt: b.createdAt,
      })),
    };
  });

  const tourGroups = tours.map((t) => {
    const refBookings = bookings.filter(
      (b) => b.type === "tour" && b.refId === t.id,
    );
    const participantSum = refBookings.reduce(
      (s, b) => s + b.participants,
      0,
    );
    const paidSum = refBookings.reduce((s, b) => s + b.paidAmount, 0);
    const totalSum = refBookings.reduce((s, b) => s + b.totalAmount, 0);
    return {
      kind: "tour" as const,
      id: t.id,
      title: t.title,
      dateStart: t.dateStart.toISOString().slice(0, 10),
      dateEnd: t.dateEnd.toISOString().slice(0, 10),
      capacity: t.capacity,
      status: t.status,
      bookingCount: refBookings.length,
      participantSum,
      paidSum,
      totalSum,
      bookings: refBookings.map((b) => ({
        id: b.id,
        userName: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        participants: b.participants,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod,
        status: b.status,
        createdAt: b.createdAt,
      })),
    };
  });

  return NextResponse.json({
    daily: tripGroups,
    tour: tourGroups,
  });
}
