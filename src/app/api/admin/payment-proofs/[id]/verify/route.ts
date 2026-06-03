import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { grantVipUpgradeRewards } from "@/lib/vip-upgrade-rewards";
import {
  computeVipLevel,
  normalizeVipTiers,
  VIP_TIERS,
} from "@/lib/vip-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payment-proofs/[id]/verify
 *   核可某張付款憑證：
 *     1. PaymentProof.verifiedAt = now, verifiedBy = 操作者
 *     2. Booking.paidAmount += proof.amount
 *     3. 根據 paidAmount vs totalAmount 自動更新 paymentStatus
 *        (paidAmount >= totalAmount → fully_paid，否則 deposit_paid)
 *     4. booking.status 從 pending → confirmed（若還沒確認）
 *     5. user.totalSpend += proof.amount，重算 vipLevel，可能發升等獎勵
 *
 *   權限：admin + boss
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;

  const proof = await prisma.paymentProof.findUnique({
    where: { id },
    include: { booking: { include: { user: true } } },
  });
  if (!proof)
    return NextResponse.json({ error: "proof not found" }, { status: 404 });
  if (proof.verifiedAt) {
    return NextResponse.json(
      { error: "此憑證已被審核過", verifiedAt: proof.verifiedAt },
      { status: 400 },
    );
  }

  try {
    const newPaid = proof.booking.paidAmount + proof.amount;
    const newPayStatus =
      newPaid >= proof.booking.totalAmount ? "fully_paid" : "deposit_paid";
    const newBookingStatus =
      proof.booking.status === "pending" ? "confirmed" : proof.booking.status;

    await prisma.$transaction([
      prisma.paymentProof.update({
        where: { id },
        data: { verifiedAt: new Date(), verifiedBy: auth.user.lineUserId },
      }),
      prisma.booking.update({
        where: { id: proof.bookingId },
        data: {
          paidAmount: newPaid,
          paymentStatus: newPayStatus,
          status: newBookingStatus,
        },
      }),
    ]);

    // 累計 + VIP 重算（fire-and-forget，失敗只 log）
    void promoteVipIfNeeded(proof.booking.userId, proof.amount).catch((e) =>
      console.error("[promote vip after verify]", e),
    );

    // v270：首單獎勵改在 attendance=completed 時觸發（教練/老闆勾選到場），
    //   不在這裡（付款驗證）觸發了。原本付完款就發 → 客戶取消未到場可能拿不回來。

    await logAudit({
      actorId: auth.user.lineUserId,
      action: "payment_proof.verify",
      targetType: "payment_proof",
      targetId: id,
      targetLabel: proof.booking.code ?? proof.booking.id.slice(0, 8),
      metadata: { amount: proof.amount, bookingId: proof.bookingId, newPaid },
    });

    return NextResponse.json({
      ok: true,
      verified: true,
      newPaid,
      newPaymentStatus: newPayStatus,
      newBookingStatus,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST verify payment proof]", e);
    return NextResponse.json(
      { error: `審核失敗：${msg}` },
      { status: 500 },
    );
  }
}

async function promoteVipIfNeeded(lineUserId: string, addAmount: number) {
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) return;
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;

  const newSpend = (user.totalSpend ?? 0) + addAmount;
  const newLevel = computeVipLevel(
    user.haiwangziLogCount ?? 0,
    newSpend,
    tiers,
  );
  const updates: Record<string, unknown> = { totalSpend: newSpend };
  const isUpgrade = newLevel > (user.vipLevel ?? 1);
  if (newLevel !== user.vipLevel) {
    updates.vipLevel = newLevel;
  }
  await prisma.user.update({ where: { lineUserId }, data: updates });

  if (isUpgrade) {
    await grantVipUpgradeRewards(
      lineUserId,
      user.vipLevel ?? 1,
      newLevel,
      tiers,
    );
  }
}
