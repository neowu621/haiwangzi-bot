// v297：客戶刪除自己的未審核 paymentProof
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/bookings/:id/payment-proofs/:proofId
//   - 必須是該 booking 的擁有者
//   - 只能刪未審核（verifiedAt === null）且未駁回（rejectedAt === null）的
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; proofId: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id, proofId } = await ctx.params;

  const proof = await prisma.paymentProof.findUnique({
    where: { id: proofId },
    include: { booking: { select: { id: true, userId: true } } },
  });
  if (!proof || proof.bookingId !== id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (proof.booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your proof" }, { status: 403 });
  }
  if (proof.verifiedAt) {
    return NextResponse.json(
      { error: "已核可的付款證明無法刪除" },
      { status: 400 },
    );
  }
  if (proof.rejectedAt) {
    return NextResponse.json(
      { error: "已駁回的付款證明保留作為紀錄，無法刪除。如有疑問請聯絡老闆" },
      { status: 400 },
    );
  }

  await prisma.paymentProof.delete({ where: { id: proofId } });
  return NextResponse.json({ ok: true });
}
