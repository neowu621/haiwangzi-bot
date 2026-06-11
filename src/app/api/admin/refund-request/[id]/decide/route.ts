import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  decision: z.enum(["approve", "reject"]),
  // approve 時可調整退款參數（admin 最後拍板）
  method: z.enum(["cash", "credit"]).optional(),
  amount: z.number().int().min(1).optional(),
  creditBonusPct: z.number().int().min(0).max(50).optional(),
  refundNote: z.string().max(2000).optional(),
  // reject 必填
  rejectReason: z.string().max(2000).optional(),
});

/**
 * v280: POST /api/admin/refund-request/[id]/decide
 *
 * Admin 審核客戶發起的退款申請 (status = pending_admin)。
 *   - approve → 立刻執行（credit 自動發 / cash 標 accepted 等線下處理）
 *               推 LINE 通知客戶「退款已核准」
 *   - reject  → status = rejected_by_admin，推 LINE 通知客戶說明
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) {
    return NextResponse.json({ error: role.message }, { status: role.status });
  }
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const rr = await prisma.refundRequest.findUnique({
    where: { id },
    include: { booking: { include: { user: true } } },
  });
  if (!rr) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rr.status !== "pending_admin") {
    return NextResponse.json(
      { error: `非待審核狀態（current: ${rr.status}）` },
      { status: 409 },
    );
  }

  const lineClient = getLineClient();
  const customerName = rr.booking.user.realName ?? rr.booking.user.displayName;

  if (data.decision === "reject") {
    await prisma.refundRequest.update({
      where: { id },
      data: {
        status: "rejected_by_admin",
        respondedAt: new Date(),
        customerNote: data.rejectReason ?? null,
      },
    });
    // 推 LINE 給客戶
    if ((rr.booking.user.notifyByLine ?? true) && lineClient) {
      try {
        await lineClient.pushMessage({
          to: rr.booking.userId,
          messages: [{
            type: "text",
            text: `Hi ${customerName}，您的退款申請已被審核但未核准。\n\n${data.rejectReason ? `理由：${data.rejectReason}\n\n` : ""}如有疑問請聯絡客服。`,
          }],
        });
      } catch (e) { console.error("[refund reject notify]", e); }
    }
    return NextResponse.json({ ok: true, decision: "rejected" });
  }

  // approve：admin 可調整參數（最後拍板）
  const finalMethod = data.method ?? rr.method;
  const finalAmount = data.amount ?? rr.amount;
  const finalBonusPct = data.creditBonusPct ?? rr.creditBonusPct;

  // 若 credit → 立刻發抵用金 + 更新 booking
  let executedNow = false;
  if (finalMethod === "credit") {
    try {
      const totalCredit = finalAmount + Math.floor(finalAmount * (finalBonusPct / 100));
      await grantCredit({
        userId: rr.booking.userId,
        amount: totalCredit,
        reason: "refund",
        refType: "booking",
        refId: rr.bookingId,
        note: `退款轉抵用金 (v280 客戶申請、admin 核准)${finalBonusPct > 0 ? ` +${finalBonusPct}%` : ""}`,
      });
      await prisma.booking.update({
        where: { id: rr.bookingId },
        data: {
          paymentStatus: "refunded",
          payLinkVerifiedAt: new Date(), // v297：退款後公開付款連結失效
          refundAmount: finalAmount,
          refundedAt: new Date(),
          refundMethod: "credit",
          refundNote: data.refundNote ?? null,
        },
      });
      executedNow = true;
    } catch (e) {
      console.error("[refund approve credit]", e);
      return NextResponse.json(
        { error: "退款執行失敗: " + (e instanceof Error ? e.message : String(e)) },
        { status: 500 },
      );
    }
  } else {
    // cash → 標 paymentStatus=refunded 但等 admin 線下處理 (refundNote 紀錄)
    await prisma.booking.update({
      where: { id: rr.bookingId },
      data: {
        paymentStatus: "refunded",
        refundAmount: finalAmount,
        refundedAt: new Date(),
        refundMethod: "cash",
        refundNote: data.refundNote ?? null,
      },
    });
    executedNow = true;
  }

  await prisma.refundRequest.update({
    where: { id },
    data: {
      status: executedNow ? "executed" : "accepted",
      method: finalMethod,
      amount: finalAmount,
      creditBonusPct: finalBonusPct,
      refundNote: data.refundNote ?? null,
      respondedAt: new Date(),
      executedAt: executedNow ? new Date() : null,
    },
  });

  // v420：退款完成通知改用 refund_complete flex 模板（可後台編輯 + email）
  {
    const bookingTitle = rr.booking.code ?? `預約 #${rr.bookingId.slice(0, 8)}`;
    const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
    const method: "cash" | "credit" = finalMethod === "credit" ? "credit" : "cash";
    const { notifyCustomer } = await import("@/lib/notify-template");
    // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
    notifyCustomer({
      userId: rr.booking.userId,
      templateKey: "refund_complete",
      params: { bookingTitle, amount: finalAmount, method, liffUrl },
    });
  }

  return NextResponse.json({ ok: true, decision: "approved", executed: executedNow });
}
