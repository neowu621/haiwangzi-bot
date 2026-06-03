import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { previewUrl, r2Configured, type R2Prefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/bookings/my - 我的所有訂單 (含展開的場次/潛水團詳情)
export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const timing: Record<string, number> = {};

  const auth = await authFromRequest(req);
  timing.auth_ms = Date.now() - t0;
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const t1 = Date.now();
  const bookings = await prisma.booking.findMany({
    where: { userId: auth.user.lineUserId },
    orderBy: { createdAt: "desc" },
    include: { paymentProofs: true },
  });
  timing.bookings_query_ms = Date.now() - t1;
  timing.bookings_count = bookings.length;
  timing.proofs_count = bookings.reduce((s, b) => s + b.paymentProofs.length, 0);

  // 補完 ref 詳情
  const t2 = Date.now();
  const tripIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    prisma.divingTrip.findMany({ where: { id: { in: tripIds } } }),
    prisma.tourPackage.findMany({ where: { id: { in: tourIds } } }),
  ]);
  timing.trips_tours_ms = Date.now() - t2;

  const t3 = Date.now();
  const allSiteIds = Array.from(new Set([
    ...trips.flatMap((t) => t.diveSiteIds),
    ...tours.flatMap((t) => t.diveSiteIds),
  ]));
  const sites = await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } } });
  timing.sites_ms = Date.now() - t3;
  const siteMap = new Map(sites.map((s) => [s.id, s]));
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));

  const t4 = Date.now();
  const result = {
    bookings: await Promise.all(bookings.map(async (b) => {
      const ref = b.type === "daily" ? tripMap.get(b.refId) : tourMap.get(b.refId);
      // v153 起：diveSiteIds 可能直接存中文名稱，DiveSite 表內找不到時 fallback 用 id 本身
      const refSites = ref
        ? ref.diveSiteIds.map((id) => siteMap.get(id)?.name ?? id).filter(Boolean)
        : [];
      // v289：簽名圖 presigned URL（給「同意聲明」彈窗顯示用）
      let signatureUrl: string | null = null;
      if (b.signatureImageKey && r2Configured()) {
        try {
          const prefix = b.signatureImageKey.split("/")[0] as R2Prefix;
          signatureUrl = await previewUrl(prefix, b.signatureImageKey);
        } catch { /* ignore */ }
      }
      return {
        id: b.id,
        type: b.type,
        refId: b.refId, // 給 client 拼 photo gallery URL 用
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod,  // v289
        totalAmount: b.totalAmount,
        depositAmount: b.depositAmount,
        paidAmount: b.paidAmount,
        participants: b.participants,
        rentalGear: b.rentalGear,
        participantDetails: b.participantDetails,
        notes: b.notes,
        createdAt: b.createdAt,
        // v289：同意聲明資料
        signatureUrl,
        signedAt: b.signedAt,
        agreedToTermsAt: b.agreedToTermsAt,
        ref: ref
          ? b.type === "daily"
            ? {
                date: (ref as typeof trips[number]).date.toISOString().slice(0, 10),
                startTime: (ref as typeof trips[number]).startTime,
                sites: refSites,
                tankCount: (ref as typeof trips[number]).tankCount,
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
  };
  timing.transform_and_presign_ms = Date.now() - t4;
  timing.total_ms = Date.now() - t0;

  // v250：把計時放 response header 方便 client devtools 看，也 log 一筆讓 Zeabur 看得到
  console.log(`[bookings/my] timing=${JSON.stringify(timing)} user=${auth.user.lineUserId}`);

  const res = NextResponse.json(result);
  res.headers.set("x-timing", JSON.stringify(timing));
  return res;
}
