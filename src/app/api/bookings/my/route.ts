import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bookings/my - 我的所有訂單 (含展開的場次/旅行團詳情)
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const bookings = await prisma.booking.findMany({
    where: { userId: auth.user.lineUserId },
    orderBy: { createdAt: "desc" },
    include: { paymentProofs: true },
  });

  // 補完 ref 詳情
  const tripIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    prisma.divingTrip.findMany({ where: { id: { in: tripIds } } }),
    prisma.tourPackage.findMany({ where: { id: { in: tourIds } } }),
  ]);
  const allSiteIds = Array.from(new Set([
    ...trips.flatMap((t) => t.diveSiteIds),
    ...tours.flatMap((t) => t.diveSiteIds),
  ]));
  const sites = await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } } });
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));

  return NextResponse.json({
    bookings: bookings.map((b) => {
      const ref = b.type === "daily" ? tripMap.get(b.refId) : tourMap.get(b.refId);
      const refSites = ref ? ref.diveSiteIds.map((id) => siteMap.get(id)?.name).filter(Boolean) : [];
      return {
        id: b.id,
        type: b.type,
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalAmount: b.totalAmount,
        depositAmount: b.depositAmount,
        paidAmount: b.paidAmount,
        participants: b.participants,
        rentalGear: b.rentalGear,
        notes: b.notes,
        createdAt: b.createdAt,
        ref: ref
          ? b.type === "daily"
            ? {
                date: (ref as typeof trips[number]).date.toISOString().slice(0, 10),
                startTime: (ref as typeof trips[number]).startTime,
                sites: refSites,
              }
            : {
                title: (ref as typeof tours[number]).title,
                dateStart: (ref as typeof tours[number]).dateStart.toISOString().slice(0, 10),
                dateEnd: (ref as typeof tours[number]).dateEnd.toISOString().slice(0, 10),
                sites: refSites,
              }
          : null,
        paymentProofs: b.paymentProofs.map((p) => ({
          id: p.id,
          type: p.type,
          amount: p.amount,
          uploadedAt: p.uploadedAt,
          verifiedAt: p.verifiedAt,
        })),
      };
    }),
  });
}
