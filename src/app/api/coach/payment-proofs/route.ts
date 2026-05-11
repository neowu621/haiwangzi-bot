import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/coach/payment-proofs - 待核對的截圖
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const proofs = await prisma.paymentProof.findMany({
    where: { verifiedAt: null },
    orderBy: { uploadedAt: "asc" },
    include: {
      booking: {
        include: { user: { select: { displayName: true, realName: true } } },
      },
    },
  });

  return NextResponse.json({
    proofs: proofs.map((p) => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      uploadedAt: p.uploadedAt,
      imageKey: p.imageKey, // base64 dataUrl,Phase 1 直接顯示
      booking: {
        id: p.bookingId,
        type: p.booking.type,
        userName: p.booking.user.realName ?? p.booking.user.displayName,
        totalAmount: p.booking.totalAmount,
        depositAmount: p.booking.depositAmount,
        paidAmount: p.booking.paidAmount,
      },
    })),
  });
}

const VerifySchema = z.object({
  proofId: z.string().uuid(),
  approve: z.boolean(),
});

// POST /api/coach/payment-proofs - 核對 (approve/reject)
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const data = VerifySchema.parse(await req.json());

  const proof = await prisma.paymentProof.findUnique({
    where: { id: data.proofId },
    include: { booking: true },
  });
  if (!proof) return NextResponse.json({ error: "proof not found" }, { status: 404 });

  if (!data.approve) {
    // 拒絕: 直接刪掉 proof
    await prisma.paymentProof.delete({ where: { id: data.proofId } });
    return NextResponse.json({ ok: true, action: "rejected" });
  }

  // 核可: 更新 booking paidAmount + paymentStatus
  const newPaid = proof.booking.paidAmount + proof.amount;
  let newPaymentStatus = proof.booking.paymentStatus;
  let newBookingStatus = proof.booking.status;
  if (proof.booking.type === "tour") {
    if (newPaid >= proof.booking.totalAmount) newPaymentStatus = "fully_paid";
    else if (newPaid >= proof.booking.depositAmount) {
      newPaymentStatus = "deposit_paid";
      newBookingStatus = "confirmed"; // 訂金確認後 booking confirmed
    }
  } else {
    if (newPaid >= proof.booking.totalAmount) newPaymentStatus = "fully_paid";
  }

  await prisma.$transaction([
    prisma.paymentProof.update({
      where: { id: data.proofId },
      data: { verifiedAt: new Date(), verifiedBy: auth.user.lineUserId },
    }),
    prisma.booking.update({
      where: { id: proof.bookingId },
      data: {
        paidAmount: newPaid,
        paymentStatus: newPaymentStatus,
        status: newBookingStatus,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, action: "approved" });
}
