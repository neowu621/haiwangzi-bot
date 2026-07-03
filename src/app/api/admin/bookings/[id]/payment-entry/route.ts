// v366：付款／折抵逐筆明細帳。
//   POST  新增一筆「金額調整」（實收 or 折抵減免）→ 寫 PaymentEntry + 增量更新 Booking.paidAmount + 重算 paymentStatus。
//   DELETE 移除某一筆（?entryId=）→ 倒扣 paidAmount + 重算 + 寫 audit（明細表保留軌跡靠 audit log，列表保持乾淨）。
//   設計原則：Booking.paidAmount 仍為「已付款」權威數字，明細表只是逐筆來源；折抵類也計入 paidAmount（依老闆需求）。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 調整項目定義：label 顯示用、isCash 區分「真實金流 vs 折抵」（報表分開算）
const PAYMENT_KINDS: Record<
  string,
  { label: string; isCash: boolean }
> = {
  transfer: { label: "轉帳", isCash: true },
  cash: { label: "現金", isCash: true },
  linepay: { label: "LINE Pay", isCash: true },
  credit: { label: "抵用金", isCash: false },
  boss_discount: { label: "老闆折抵", isCash: false },
  assistant: { label: "助教減免", isCash: false },
  other: { label: "其他", isCash: false },
};

const Body = z.object({
  kind: z.enum([
    "transfer",
    "cash",
    "linepay",
    "credit",
    "boss_discount",
    "assistant",
    "other",
  ]),
  amount: z.number().int().positive(),
  note: z.string().max(200).optional(),
});

function nextPaymentStatus(paid: number, total: number): string {
  if (paid >= total && total > 0) return "fully_paid";
  if (paid > 0) return "deposit_paid";
  return "pending";
}

// GET /api/admin/bookings/[id]/payment-entry — 列出該訂單所有明細（新→舊）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]); // v756：付款/折抵記帳僅老闆(boss/admin/it)，教練/助教不可
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const entries = await prisma.paymentEntry.findMany({
    where: { bookingId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amount: true,
      kind: true,
      isCash: true,
      note: true,
      createdByName: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ entries });
}

// POST /api/admin/bookings/[id]/payment-entry — 新增一筆
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]); // v756：付款/折抵記帳僅老闆(boss/admin/it)，教練/助教不可
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { kind, amount } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  if (kind === "other" && !note) {
    return NextResponse.json(
      { error: "「其他」項目必須填寫說明" },
      { status: 400 },
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { id: true, totalAmount: true, paidAmount: true, paymentStatus: true },
  });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.paymentStatus === "refunded" || booking.paymentStatus === "refunding") {
    return NextResponse.json(
      { error: "此訂單已退款／退款中，無法新增付款" },
      { status: 400 },
    );
  }

  const remaining = booking.totalAmount - booking.paidAmount;
  if (amount > remaining) {
    return NextResponse.json(
      { error: `金額 NT$${amount.toLocaleString()} 超過剩餘款 NT$${remaining.toLocaleString()}`, code: "EXCEED_REMAINING", remaining },
      { status: 400 },
    );
  }

  const meta = PAYMENT_KINDS[kind];
  const newPaid = booking.paidAmount + amount;
  const newStatus = nextPaymentStatus(newPaid, booking.totalAmount);
  const operatorName = auth.user.realName ?? auth.user.displayName ?? "管理員";

  const [entry, updated] = await prisma.$transaction([
    prisma.paymentEntry.create({
      data: {
        bookingId: id,
        amount,
        kind,
        isCash: meta.isCash,
        note,
        createdById: auth.user.lineUserId,
        createdByName: operatorName,
      },
    }),
    prisma.booking.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        paymentStatus: newStatus as never,
        // v776：收到現金即標記付款方式＝現場支付（cash）。
        //   讓「老闆按到場→現場收現結清」一次把 paidAmount / paymentStatus / paymentMethod 全部同步。
        ...(kind === "cash" ? { paymentMethod: "cash" as never } : {}),
      },
    }),
  ]);

  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: operatorName,
    action: "booking.payment_entry_add",
    targetType: "booking",
    targetId: id,
    metadata: { kind, label: meta.label, amount, isCash: meta.isCash, note, newPaid, newStatus },
  });

  return NextResponse.json({
    ok: true,
    entry,
    booking: { paidAmount: updated.paidAmount, paymentStatus: updated.paymentStatus },
  });
}

// DELETE /api/admin/bookings/[id]/payment-entry?entryId=xxx — 移除一筆並倒扣
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]); // v756：付款/折抵記帳僅老闆(boss/admin/it)，教練/助教不可
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const entryId = req.nextUrl.searchParams.get("entryId");
  if (!entryId)
    return NextResponse.json({ error: "missing entryId" }, { status: 400 });

  const entry = await prisma.paymentEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.bookingId !== id)
    return NextResponse.json({ error: "entry not found" }, { status: 404 });

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { totalAmount: true, paidAmount: true },
  });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });

  const newPaid = Math.max(0, booking.paidAmount - entry.amount);
  const newStatus = nextPaymentStatus(newPaid, booking.totalAmount);

  const [, updated] = await prisma.$transaction([
    prisma.paymentEntry.delete({ where: { id: entryId } }),
    prisma.booking.update({
      where: { id },
      data: { paidAmount: newPaid, paymentStatus: newStatus as never },
    }),
  ]);

  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: auth.user.realName ?? auth.user.displayName ?? "管理員",
    action: "booking.payment_entry_delete",
    targetType: "booking",
    targetId: id,
    metadata: { removed: { kind: entry.kind, amount: entry.amount, note: entry.note }, newPaid, newStatus },
  });

  return NextResponse.json({
    ok: true,
    booking: { paidAmount: updated.paidAmount, paymentStatus: updated.paymentStatus },
  });
}
