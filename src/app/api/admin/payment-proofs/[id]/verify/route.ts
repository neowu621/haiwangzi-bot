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
  // v305-B：擋已取消訂單，避免「取消後又核可付款」造成資料衝突
  if (proof.booking.status.startsWith("cancelled")) {
    return NextResponse.json(
      {
        error: `訂單已${proof.booking.status === "cancelled_by_user" ? "被客戶取消" : proof.booking.status === "cancelled_by_weather" ? "因天候取消" : "不成立"}，無法核可付款證明。如需處理請改用退款流程。`,
      },
      { status: 400 },
    );
  }
  // v723：completed（已到場/已結束）仍允許核可——尾款常在潛水當天/事後才匯，
  //   而「到場點名」也會把訂單轉 completed；若擋 completed 會導致「已到場的尾款無法核可」。
  //   核可只會累加 paidAmount + 記一筆金流，狀態維持 completed（下方 newBookingStatus 不動 completed）。
  //   no_show（未到場）仍擋下：未到場不應再收款，需要時走退款/補收流程。
  if (proof.booking.status === "no_show") {
    return NextResponse.json(
      { error: "訂單為「未到場」，無法核可付款證明。如需處理請改用退款/補收流程。" },
      { status: 400 },
    );
  }

  try {
    const newPaid = proof.booking.paidAmount + proof.amount;
    const newPayStatus =
      newPaid >= proof.booking.totalAmount ? "fully_paid" : "deposit_paid";
    // v276：pending 或 awaiting_verify 都轉 confirmed
    const newBookingStatus =
      proof.booking.status === "pending" || proof.booking.status === "awaiting_verify"
        ? "confirmed"
        : proof.booking.status;

    // v373：核可付款證明時，同步寫一筆「付款紀錄」明細（PaymentEntry），
    //   修正先前「核可後已付款增加、但付款紀錄空白」的不一致。實收金流，isCash=true。
    const entryKind =
      proof.booking.paymentMethod === "linepay" ? "linepay" : "transfer";
    const typeLabel =
      proof.type === "deposit" ? "訂金" : proof.type === "final" ? "尾款" : "";
    const entryNote =
      `客戶證明核可${typeLabel ? `（${typeLabel}）` : ""}` +
      (proof.last5 ? `・末5碼 ${proof.last5}` : "");
    const operatorName = auth.user.realName ?? auth.user.displayName ?? "管理員";

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
          // v296：fully_paid 時失效公開付款連結（客戶開連結會看到「已確認」）
          ...(newPayStatus === "fully_paid" ? { payLinkVerifiedAt: new Date() } : {}),
        },
      }),
      prisma.paymentEntry.create({
        data: {
          bookingId: proof.bookingId,
          amount: proof.amount,
          kind: entryKind,
          isCash: true,
          note: entryNote,
          createdById: auth.user.lineUserId,
          createdByName: operatorName,
        },
      }),
    ]);

    // v278：log status 變化
    if (newBookingStatus !== proof.booking.status) {
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: proof.bookingId,
          fromStatus: proof.booking.status,
          toStatus: newBookingStatus,
          actorId: auth.user.lineUserId,
          actorRole: "admin",
          note: `審核通過付款 NT$${proof.amount}`,
        }),
      );
    }

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
