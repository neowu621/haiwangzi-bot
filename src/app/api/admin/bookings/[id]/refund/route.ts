import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// POST /api/admin/bookings/[id]/refund
//   退款處理：把 booking 標記為 refunded + 處理錢的去向
//
//   body:
//     amount: number          退款金額（NT$）
//     method: "cash" | "credit"  現金退 / 轉成禮金
//     reason: string?         備註
//
//   邏輯：
//     - 不論方式，booking.paymentStatus = refunded, refundAmount=amount, refundedAt=now
//     - method=credit：呼叫 grantCredit(+amount) 寫一筆 reason="refund" 的 CreditTx
//     - method=cash：只記錄 refundMethod="cash"，老闆/admin 須線下退款
//     - 不會自動改 booking.status（讓 admin 自己決定 cancelled_by_user/weather）
//
//   權限：boss + admin
// ─────────────────────────────────────────────────────────

const Body = z.object({
  amount: z.number().int().min(1),
  method: z.enum(["cash", "credit"]),
  reason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });

  // 已經退完款的不能再退
  if (booking.paymentStatus === "refunded") {
    return NextResponse.json(
      { error: "already refunded", refundAmount: booking.refundAmount },
      { status: 400 },
    );
  }

  // 退款上限：已付金額
  if (data.amount > booking.paidAmount) {
    return NextResponse.json(
      {
        error: `退款金額 NT$${data.amount} > 已付 NT$${booking.paidAmount}`,
      },
      { status: 400 },
    );
  }

  try {
    // 1. 更新 booking
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        paymentStatus: "refunded",
        refundAmount: data.amount,
        refundedAt: new Date(),
        refundMethod: data.method,
        cancellationReason:
          booking.cancellationReason ?? data.reason ?? "admin refund",
      },
    });

    // 2. 若 method=credit → 發禮金
    let creditResult: { newBalance: number; oldBalance: number } | null = null;
    if (data.method === "credit") {
      const r = await grantCredit({
        userId: booking.userId,
        amount: data.amount,
        reason: "refund",
        refType: "booking",
        refId: id,
        note:
          data.reason ?? `預約 ${id.slice(0, 8)} 退費轉禮金`,
        createdBy: auth.user.lineUserId,
      });
      creditResult = { newBalance: r.newBalance, oldBalance: r.oldBalance };
    }

    return NextResponse.json({
      ok: true,
      booking: updated,
      refundMethod: data.method,
      credit: creditResult,
    });
  } catch (e) {
    console.error("[refund]", e);
    return NextResponse.json(
      {
        error: "refund failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
