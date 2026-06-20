/**
 * v606：一次性盤點/補退「v603 自動退款上線前，已取消但抵用金沒退回」的訂單。
 *
 * GET  = 乾跑（dry-run）：列出所有「已取消 + creditUsed>0」訂單，標出是否已退過。
 * POST { confirm: "REFUND-CANCELLED" } = 實際補退（只退「完全沒退過」的，冪等）。
 *
 * 「已退過」判定：該訂單已存在任一 reason="refund" 的 CreditTx（涵蓋 v603 自動退 refType=booking_cancel
 *   與 admin 手動退款 refType=booking）→ 不再重複退。
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";
import { logAudit } from "@/lib/audit";
import type { BookingStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCELLED: BookingStatus[] = ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"];

async function buildReport() {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: CANCELLED }, creditUsed: { gt: 0 } },
    select: { id: true, code: true, userId: true, creditUsed: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = [];
  for (const b of bookings) {
    const refunds = await prisma.creditTx.findMany({
      where: { reason: "refund", refId: b.id },
      select: { amount: true, refType: true, createdAt: true },
    });
    const refundedTotal = refunds.reduce((s, r) => s + r.amount, 0);
    const user = await prisma.user.findUnique({
      where: { lineUserId: b.userId },
      select: { realName: true, displayName: true },
    });
    rows.push({
      bookingId: b.id,
      code: b.code,
      customer: user?.realName ?? user?.displayName ?? b.userId,
      status: b.status,
      creditUsed: b.creditUsed,
      alreadyRefunded: refunds.length > 0,
      refundedTotal,
      refundTypes: refunds.map((r) => r.refType),
      cancelledAt: b.createdAt,
    });
  }
  return rows;
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const rows = await buildReport();
  const pending = rows.filter((r) => !r.alreadyRefunded);
  return NextResponse.json({
    mode: "dry-run",
    total: rows.length,
    pendingRefund: pending.length,
    pendingAmount: pending.reduce((s, r) => s + r.creditUsed, 0),
    rows,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "REFUND-CANCELLED") {
    return NextResponse.json(
      { error: 'confirm 欄位必須是 "REFUND-CANCELLED"' },
      { status: 400 },
    );
  }

  const rows = await buildReport();
  const pending = rows.filter((r) => !r.alreadyRefunded && r.creditUsed > 0);
  const done = [];
  for (const r of pending) {
    try {
      await grantCredit({
        userId: (await prisma.booking.findUnique({ where: { id: r.bookingId }, select: { userId: true } }))!.userId,
        amount: r.creditUsed,
        reason: "refund",
        refType: "booking_cancel",
        refId: r.bookingId,
        note: `訂單 ${r.code ?? r.bookingId.slice(0, 8)} 取消補退抵用金（v606 補件）`,
        createdBy: auth.user.lineUserId,
        expiresAt: null,
      });
      done.push({ bookingId: r.bookingId, code: r.code, customer: r.customer, refunded: r.creditUsed });
    } catch (e) {
      done.push({ bookingId: r.bookingId, code: r.code, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await logAudit({
    actorId: auth.user.lineUserId,
    action: "credit.backfill_cancel_refund",
    targetType: "system",
    targetId: "backfill-cancel-credit-refunds",
    metadata: { count: done.length, amount: done.reduce((s, d) => s + (d.refunded ?? 0), 0) },
  });
  return NextResponse.json({ mode: "executed", refundedCount: done.length, refundedAmount: done.reduce((s, d) => s + (d.refunded ?? 0), 0), done });
}
