// v738：老闆帳務調整 —— 手動加/減「訂單收費項目」(例 共乘 +300、補上次沒潛水 −600)。
//   改的是 Booking.totalAmount（收費），不是 paidAmount（已收的錢，那走 payment-entry）。
//   調整項存進 priceBreakdown.bossAdjustments，下單明細會列出;每次變動寫 audit 留痕。
//   權限：admin / boss / it（coach/assistant 不可改收費）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Adjustment { label: string; amount: number; at: string; by: string }

const Body = z.object({
  label: z.string().trim().min(1, "請填項目名稱").max(40),
  amount: z.number().int().refine((n) => n !== 0, "金額不可為 0").refine((n) => Math.abs(n) <= 100000, "金額過大"),
});

// 只在 pending/deposit_paid/fully_paid 之間重算;awaiting_verify/refunding/refunded 不動
function recomputeStatus(current: string, paid: number, total: number): string {
  if (!["pending", "deposit_paid", "fully_paid"].includes(current)) return current;
  if (total > 0 && paid >= total) return "fully_paid";
  if (paid > 0) return "deposit_paid";
  return "pending";
}

function readAdjustments(pb: unknown): Adjustment[] {
  const obj = (pb ?? {}) as Record<string, unknown>;
  const arr = obj.bossAdjustments;
  return Array.isArray(arr) ? (arr as Adjustment[]) : [];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]); // admin/boss/it
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "validation failed" }, { status: 400 });
  }
  const label = parsed.data.label.trim();
  const { amount } = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, code: true, totalAmount: true, paidAmount: true, paymentStatus: true, priceBreakdown: true },
  });
  if (!booking) return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.paymentStatus === "refunded" || booking.paymentStatus === "refunding") {
    return NextResponse.json({ error: "此訂單已退款／退款中，無法調整收費" }, { status: 400 });
  }

  const newTotal = booking.totalAmount + amount;
  if (newTotal < 0) {
    return NextResponse.json({ error: `調整後總額會變負數（目前總額 NT$${booking.totalAmount.toLocaleString()}）` }, { status: 400 });
  }

  const operatorName = auth.user.realName ?? auth.user.displayName ?? "管理員";
  const adjustments = readAdjustments(booking.priceBreakdown);
  const item: Adjustment = { label, amount, at: new Date().toISOString(), by: operatorName };
  const pbObj = (booking.priceBreakdown ?? {}) as Record<string, unknown>;
  const newPb = { ...pbObj, bossAdjustments: [...adjustments, item] };
  const newStatus = recomputeStatus(booking.paymentStatus, booking.paidAmount, newTotal);

  const updated = await prisma.booking.update({
    where: { id },
    data: { totalAmount: newTotal, priceBreakdown: newPb as unknown as Prisma.InputJsonValue, paymentStatus: newStatus as never },
    select: { totalAmount: true, paidAmount: true, paymentStatus: true, priceBreakdown: true },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: operatorName,
    action: "booking.adjustment_add",
    targetType: "booking",
    targetId: id,
    targetLabel: booking.code ?? id,
    metadata: { label, amount, newTotal, newStatus },
  });

  return NextResponse.json({
    ok: true,
    booking: { totalAmount: updated.totalAmount, paidAmount: updated.paidAmount, paymentStatus: updated.paymentStatus },
    adjustments: readAdjustments(updated.priceBreakdown),
  });
}

// DELETE /api/admin/bookings/[id]/adjustment?index=N — 移除第 N 筆調整，倒回總額
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const index = Number(new URL(req.url).searchParams.get("index"));
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "invalid index" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, code: true, totalAmount: true, paidAmount: true, paymentStatus: true, priceBreakdown: true },
  });
  if (!booking) return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.paymentStatus === "refunded" || booking.paymentStatus === "refunding") {
    return NextResponse.json({ error: "此訂單已退款／退款中，無法調整收費" }, { status: 400 });
  }

  const adjustments = readAdjustments(booking.priceBreakdown);
  const removed = adjustments[index];
  if (!removed) return NextResponse.json({ error: "找不到該調整項" }, { status: 404 });

  const newTotal = Math.max(0, booking.totalAmount - removed.amount);
  const next = adjustments.filter((_, i) => i !== index);
  const pbObj = (booking.priceBreakdown ?? {}) as Record<string, unknown>;
  const newPb = { ...pbObj, bossAdjustments: next };
  const newStatus = recomputeStatus(booking.paymentStatus, booking.paidAmount, newTotal);

  const updated = await prisma.booking.update({
    where: { id },
    data: { totalAmount: newTotal, priceBreakdown: newPb as unknown as Prisma.InputJsonValue, paymentStatus: newStatus as never },
    select: { totalAmount: true, paidAmount: true, paymentStatus: true, priceBreakdown: true },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: auth.user.realName ?? auth.user.displayName ?? "管理員",
    action: "booking.adjustment_remove",
    targetType: "booking",
    targetId: id,
    targetLabel: booking.code ?? id,
    metadata: { removed, newTotal, newStatus },
  });

  return NextResponse.json({
    ok: true,
    booking: { totalAmount: updated.totalAmount, paidAmount: updated.paidAmount, paymentStatus: updated.paymentStatus },
    adjustments: readAdjustments(updated.priceBreakdown),
  });
}
