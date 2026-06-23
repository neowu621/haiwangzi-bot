// v619：單筆付款證明核對資料 — 給「獨立核對頁」用（手機 LIFF + 瀏覽器共用）。
//   authFromRequest 統一驗證：LINE idToken / 後台 admin-web JWT 都吃；限 admin/boss。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const proof = await prisma.paymentProof.findUnique({
    where: { id },
    include: { booking: { include: { user: { select: { displayName: true, realName: true } } } } },
  });
  if (!proof) return NextResponse.json({ error: "proof not found" }, { status: 404 });

  const b = proof.booking;

  // 場次資訊（日潛）
  let activity = "";
  if (b.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({
      where: { id: b.refId },
      select: { date: true, startTime: true, diveSiteIds: true },
    });
    if (trip) {
      const sites = trip.diveSiteIds.length
        ? await prisma.diveSite.findMany({ where: { id: { in: trip.diveSiteIds } }, select: { id: true, name: true } })
        : [];
      const siteMap = new Map(sites.map((s) => [s.id, s.name]));
      const siteName = trip.diveSiteIds.map((sid) => siteMap.get(sid) ?? sid).join("、");
      activity = `${trip.date.toISOString().slice(0, 10)} ${trip.startTime}${siteName ? ` ・ ${siteName}` : ""}`;
    }
  } else {
    const tour = await prisma.tourPackage.findUnique({ where: { id: b.refId }, select: { title: true } });
    if (tour) activity = tour.title;
  }

  // 圖片：優先 R2 presigned，沒有就回 base64（舊資料）
  let imageUrl: string | null = null;
  if (proof.imageKey) {
    if (proof.imageKey.startsWith("data:")) {
      imageUrl = proof.imageKey;
    } else {
      try {
        const { previewUrl, r2Configured } = await import("@/lib/r2");
        if (r2Configured()) {
          const prefix = proof.imageKey.split("/")[0] as never;
          imageUrl = await previewUrl(prefix, proof.imageKey);
        }
      } catch (e) {
        console.error("[payment-proof preview]", e);
      }
    }
  }

  return NextResponse.json({
    proof: {
      id: proof.id,
      type: proof.type,
      amount: proof.amount,
      last5: proof.last5 ?? null,
      uploadedAt: proof.uploadedAt,
      verifiedAt: proof.verifiedAt,
      rejectedAt: proof.rejectedAt,
      imageUrl,
      hasImage: Boolean(proof.imageKey),
    },
    booking: {
      id: b.id,
      code: b.code ?? b.id.slice(0, 8),
      type: b.type,
      status: b.status,
      customer: b.user.realName ?? b.user.displayName ?? "",
      activity,
      totalAmount: b.totalAmount,
      depositAmount: b.depositAmount,
      paidAmount: b.paidAmount,
    },
  });
}
