import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { deriveBookingDisplay } from "@/lib/booking-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/m/users/[userId]
//   手機後台「會員詳細彈窗」：聯繫方式(LINE/電話) + 進行中(未結束/未取消)訂單。
//   訂單金額顯示應付(總額−已付，已含抵用金折抵)。
const DONE_OR_CANCELLED = new Set([
  "completed",
  "cancelled_by_user",
  "cancelled_by_weather",
  "cancelled_unpaid",
  "no_show",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { userId } = await params;
  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: userId },
      select: { lineUserId: true, displayName: true, realName: true, phone: true, code: true },
    });
    if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const bookings = await prisma.booking.findMany({
      where: { userId, status: { notIn: [...DONE_OR_CANCELLED] } },
      select: {
        id: true, code: true, type: true, refId: true, participants: true,
        totalAmount: true, paidAmount: true, paymentStatus: true, status: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
    const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
    const [trips, tours] = await Promise.all([
      dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true, diveSiteIds: true } }) : Promise.resolve([]),
      tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true, dateStart: true } }) : Promise.resolve([]),
    ]);
    const tripMap = new Map(trips.map((t) => [t.id, t]));
    const tourMap = new Map(tours.map((t) => [t.id, t]));
    const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
    const sites = siteIds.length ? await prisma.diveSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } }) : [];
    const siteMap = new Map(sites.map((s) => [s.id, s.name]));

    const orders = bookings.map((b) => {
      let date: string | null = null;
      let title = "";
      if (b.type === "daily") {
        const t = tripMap.get(b.refId);
        if (t) { date = t.date.toISOString().slice(0, 10); title = t.diveSiteIds.map((x) => siteMap.get(x) ?? x).join("、") || "日潛"; } else title = "日潛";
      } else {
        const t = tourMap.get(b.refId);
        if (t) { date = t.dateStart.toISOString().slice(0, 10); title = t.title; } else title = "潛水團";
      }
      const display = deriveBookingDisplay({ status: b.status, paymentStatus: b.paymentStatus, createdAt: b.createdAt, activityDate: date });
      return {
        id: b.id,
        code: b.code,
        type: b.type,
        participants: b.participants,
        date,
        title,
        totalAmount: b.totalAmount,
        payable: Math.max(0, b.totalAmount - b.paidAmount),
        paymentStatus: b.paymentStatus,
        status: b.status,
        statusLabel: display.label,
      };
    });

    return NextResponse.json({
      user: {
        lineUserId: user.lineUserId,
        name: user.realName ?? user.displayName,
        phone: user.phone,
        code: user.code,
        hasLine: Boolean(user.lineUserId) && !user.lineUserId.startsWith("mock"),
      },
      orders,
    });
  } catch (e) {
    return NextResponse.json({ error: `會員載入失敗：${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
}
