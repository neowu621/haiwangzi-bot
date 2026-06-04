// v297：公開連結客戶刪除自己未審核的 paymentProof
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/pay/:id/proofs/:proofId?t=<token>
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; proofId: string }> },
) {
  const { id, proofId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";

  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  // 同時 match booking.id + payLinkToken
  const booking = await prisma.booking.findFirst({
    where: { id, payLinkToken: token },
    select: { id: true, payLinkVerifiedAt: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  if (booking.payLinkVerifiedAt) {
    return NextResponse.json({ error: "already_verified" }, { status: 410 });
  }

  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    select: { bookingId: true, verifiedAt: true, rejectedAt: true },
  });
  if (!proof || proof.bookingId !== id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (proof.verifiedAt) {
    return NextResponse.json(
      { error: "已核可的付款證明無法刪除" },
      { status: 400 },
    );
  }
  if (proof.rejectedAt) {
    return NextResponse.json(
      { error: "已駁回的紀錄不可刪除（保留作為紀錄，如有疑問請聯絡老闆）" },
      { status: 400 },
    );
  }

  await prisma.paymentProof.delete({ where: { id: proofId } });
  return NextResponse.json({ ok: true });
}
