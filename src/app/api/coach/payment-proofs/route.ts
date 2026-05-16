import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { paymentReceivedEmail } from "@/lib/email/templates";
import { computeVipLevel, normalizeVipTiers, VIP_TIERS } from "@/lib/vip-tier";
import { grantCredit, vipUpgradeCreditAmount } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/coach/payment-proofs - 待核對的截圖
// 收款核對是「老闆」職責，coach 不應碰款項
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
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

// POST /api/coach/payment-proofs - 核對 (approve/reject) — 只有老闆/admin 可以
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
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

  // 累計消費 + 重算 VIP 等級（這次核可的金額計入）
  void promoteVipIfNeeded(proof.booking.userId, proof.amount).catch((e) =>
    console.error("[promote vip]", e),
  );

  // 寄收款確認 email (fire-and-forget)
  void sendPaymentReceivedEmail({
    bookingId: proof.bookingId,
    type: proof.type,
    amount: proof.amount,
    newPaid,
    totalAmount: proof.booking.totalAmount,
  }).catch((e) => console.error("[payment confirm email]", e));

  return NextResponse.json({ ok: true, action: "approved" });
}

/**
 * 核可款項時更新 user.totalSpend + 重算 vipLevel
 * 不阻擋主流程，失敗只 log
 */
async function promoteVipIfNeeded(lineUserId: string, addAmount: number) {
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) return;
  // 從 SiteConfig 讀 admin 自訂的等級設定（沒設用內建）
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;

  const newSpend = (user.totalSpend ?? 0) + addAmount;
  // 用海王子累積次數（user.haiwangziLogCount）算等級，避免自填 logCount 灌水
  const newLevel = computeVipLevel(
    user.haiwangziLogCount ?? 0,
    newSpend,
    tiers,
  );
  const updates: Record<string, unknown> = { totalSpend: newSpend };
  const isUpgrade = newLevel > (user.vipLevel ?? 1);
  if (newLevel !== user.vipLevel) {
    updates.vipLevel = newLevel;
    console.log(
      `[vip] ${lineUserId} 升等 ${user.vipLevel} → ${newLevel} (hwLogs=${user.haiwangziLogCount}, spend=${newSpend})`,
    );
  }
  await prisma.user.update({ where: { lineUserId }, data: updates });

  // 升等獎勵 — 對「跨等級」的每一階都發一次（避免一次升 1→3 漏發）
  if (isUpgrade) {
    for (let lv = (user.vipLevel ?? 1) + 1; lv <= newLevel; lv++) {
      const amount = vipUpgradeCreditAmount(cfg?.vipUpgradeCredits, lv);
      if (amount > 0) {
        try {
          await grantCredit({
            userId: lineUserId,
            amount,
            reason: "vip_upgrade",
            refType: "vip",
            refId: String(lv),
            note: `升等 LV${lv} 獎勵`,
          });
          console.log(`[credit] ${lineUserId} 升 LV${lv} 獲 NT$${amount}`);
        } catch (e) {
          console.error("[grant vip credit]", e);
        }
      }
    }
  }
}

async function sendPaymentReceivedEmail(args: {
  bookingId: string;
  type: string;
  amount: number;
  newPaid: number;
  totalAmount: number;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: { user: true },
  });
  if (!booking) return;
  if (!booking.user.notifyByEmail || !booking.user.email) return;

  // 取 booking 對應的 title（trip date 或 tour title）
  let bookingTitle = `預約 #${booking.id.slice(0, 8)}`;
  if (booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({
      where: { id: booking.refId },
    });
    if (trip) {
      bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
    }
  } else if (booking.type === "tour") {
    const tour = await prisma.tourPackage.findUnique({
      where: { id: booking.refId },
    });
    if (tour) bookingTitle = tour.title;
  }

  const emailType =
    args.type === "deposit"
      ? "deposit"
      : args.newPaid >= args.totalAmount
        ? "full"
        : "final";

  const tpl = paymentReceivedEmail({
    name: booking.user.realName ?? booking.user.displayName,
    type: emailType,
    amount: args.amount,
    totalPaid: args.newPaid,
    totalAmount: args.totalAmount,
    bookingTitle,
    bookingId: booking.id,
  });

  await sendEmail({
    to: booking.user.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });
}
