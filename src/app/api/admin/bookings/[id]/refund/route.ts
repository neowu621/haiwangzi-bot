import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";
import { logAudit } from "@/lib/audit";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { refundEmail } from "@/lib/email/templates";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// POST /api/admin/bookings/[id]/refund
//   退款處理：把 booking 標記為 refunded + 處理錢的去向
//
//   body:
//     amount: number          退款金額（NT$）
//     method: "cash" | "credit"  現金退 / 轉成抵用金
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
  amount: z.number().int().min(1),  // 從 paidAmount 扣多少
  method: z.enum(["cash", "credit"]),
  // method=credit 時，實際發到 creditBalance 的金額（可大於 amount，例如天氣取消 110% 優惠）
  // 未提供時 default = amount（1:1）
  creditAmount: z.number().int().min(1).optional(),
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

    // 2. 若 method=credit → 發抵用金（可自訂金額，例如 110%/80%）
    let creditResult: { newBalance: number; oldBalance: number; granted: number } | null = null;
    if (data.method === "credit") {
      const grantAmount = data.creditAmount ?? data.amount;
      const r = await grantCredit({
        userId: booking.userId,
        amount: grantAmount,
        reason: "refund",
        refType: "booking",
        refId: id,
        note:
          data.reason ??
          (grantAmount === data.amount
            ? `預約 ${id.slice(0, 8)} 退費轉抵用金`
            : `預約 ${id.slice(0, 8)} 退費 NT$${data.amount} 轉抵用金 NT$${grantAmount}`),
        createdBy: auth.user.lineUserId,
        expiresAt: null, // 業務規則：退款轉抵用金永不過期
      });
      creditResult = { newBalance: r.newBalance, oldBalance: r.oldBalance, granted: grantAmount };
    }

    await logAudit({
      actorId: auth.user.lineUserId,
      action: "booking.refund",
      targetType: "booking",
      targetId: id,
      metadata: { method: data.method, amount: data.amount },
    });

    // ── 通知客戶（fire-and-forget，不阻擋退款主流程）─────────
    void notifyCustomer({
      bookingId: id,
      bookingCode: booking.code ?? id.slice(0, 8),
      method: data.method,
      refundAmount: data.amount,
      creditAmount: creditResult?.granted,
      newCreditBalance: creditResult?.newBalance,
      reason: data.reason ?? "退款處理",
    }).catch((e) => console.error("[refund notify]", e));

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

/**
 * 退款後通知客戶：Email（主，詳細）+ LINE（副，一句話導向 Email）
 * 失敗不影響退款結果
 */
async function notifyCustomer(args: {
  bookingId: string;
  bookingCode: string;
  method: "cash" | "credit";
  refundAmount: number;
  creditAmount?: number;
  newCreditBalance?: number;
  reason: string;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: { user: true },
  });
  if (!booking) return;

  // 組行程名稱（daily 取場次日期 + 潛點，tour 取 title）
  let bookingTitle = "";
  if (booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({
      where: { id: booking.refId },
      select: { date: true, startTime: true, diveSiteIds: true },
    });
    if (trip) {
      const date = trip.date.toISOString().slice(0, 10);
      const sites = trip.diveSiteIds.length > 0
        ? await prisma.diveSite.findMany({
            where: { id: { in: trip.diveSiteIds } },
            select: { name: true },
          })
        : [];
      bookingTitle = `${date} ${trip.startTime} ${sites.map((s) => s.name).join("・") || "日潛"}`;
    } else {
      bookingTitle = "日潛場次";
    }
  } else {
    const tour = await prisma.tourPackage.findUnique({
      where: { id: booking.refId },
      select: { title: true },
    });
    bookingTitle = tour?.title ?? "潛水團";
  }

  const userName = booking.user.realName ?? booking.user.displayName;

  // ── Email（主要通道）──────────────────────
  if (booking.user.notifyByEmail && booking.user.email && emailConfigured()) {
    const tpl = refundEmail({
      name: userName,
      bookingCode: args.bookingCode,
      bookingTitle,
      refundAmount: args.refundAmount,
      method: args.method,
      creditAmount: args.creditAmount,
      newCreditBalance: args.newCreditBalance,
      reason: args.reason,
    });
    try {
      await sendEmail({
        to: booking.user.email,
        subject: tpl.subject,
        text: tpl.text,
        html: tpl.html,
      });
    } catch (e) {
      console.error("[refund email]", e);
    }
  }

  // ── LINE（副通道：一句話 + 提示看 Email）──────────────────
  if (booking.user.notifyByLine && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    const methodLabel = args.method === "cash" ? "退現金" : "轉抵用金";
    const lineText =
      `🔄 退款通知\n\n您的訂單 ${args.bookingCode} 已退款：\n` +
      `${methodLabel} NT$ ${args.refundAmount.toLocaleString()}` +
      (args.method === "credit" && args.creditAmount
        ? `（抵用金入帳 NT$ ${args.creditAmount.toLocaleString()}）`
        : "") +
      `\n\n詳情請查看 Email 通知。`;
    try {
      const client = getLineClient();
      await client.pushMessage({
        to: booking.userId,
        messages: [{ type: "text", text: lineText }],
      });
    } catch (e) {
      console.error("[refund line push]", e);
    }
  }
}
