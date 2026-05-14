import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { previewUrl, r2Configured, type R2Prefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bookings/my - 我的所有訂單 (含展開的場次/潛水團詳情)
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
    bookings: await Promise.all(bookings.map(async (b) => {
      const ref = b.type === "daily" ? tripMap.get(b.refId) : tourMap.get(b.refId);
      const refSites = ref ? ref.diveSiteIds.map((id) => siteMap.get(id)?.name).filter(Boolean) : [];
      return {
        id: b.id,
        type: b.type,
        refId: b.refId, // 給 client 拼 photo gallery URL 用
        status: b.status,
        paymentStatus: b.paymentStatus,
        totalAmount: b.totalAmount,
        depositAmount: b.depositAmount,
        paidAmount: b.paidAmount,
        participants: b.participants,
        rentalGear: b.rentalGear,
        participantDetails: b.participantDetails,
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
        paymentProofs: await Promise.all(
          b.paymentProofs.map(async (p) => {
            // 為 client 產 presigned GET URL（10 分鐘 TTL）讓客戶可以看自己上傳的截圖
            // 若 imageKey 是 base64 data URL (legacy) 直接回；R2 key 則 sign
            let url: string | null = null;
            if (p.imageKey?.startsWith("data:")) {
              url = p.imageKey;
            } else if (p.imageKey && r2Configured()) {
              try {
                const prefix = p.imageKey.split("/")[0] as R2Prefix;
                url = await previewUrl(prefix, p.imageKey);
              } catch {
                url = null;
              }
            }
            return {
              id: p.id,
              type: p.type,
              amount: p.amount,
              uploadedAt: p.uploadedAt,
              verifiedAt: p.verifiedAt,
              url,
            };
          }),
        ),
      };
    })),
  });
}
