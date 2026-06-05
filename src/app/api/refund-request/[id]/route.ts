import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { grantCredit } from "@/lib/credit";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v274: GET /api/refund-request/[id]
 *
 * 客戶端 LIFF 頁讀取退款申請詳情用。需 LIFF auth，必須是該訂單擁有者。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await params;
  const rr = await prisma.refundRequest.findUnique({
    where: { id },
    include: { booking: { include: { user: { select: { lineUserId: true } } } } },
  });
  if (!rr) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rr.booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 組 booking title
  let bookingTitle = `預約 #${rr.bookingId.slice(0, 8)}`;
  if (rr.booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({ where: { id: rr.booking.refId } });
    if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
  } else {
    const tour = await prisma.tourPackage.findUnique({ where: { id: rr.booking.refId } });
    if (tour) bookingTitle = tour.title;
  }

  return NextResponse.json({
    refundRequest: {
      id: rr.id,
      bookingId: rr.bookingId,
      bookingTitle,
      method: rr.method,
      amount: rr.amount,
      creditBonusPct: rr.creditBonusPct,
      reason: rr.reason,
      status: rr.status,
      customerNote: rr.customerNote,
      createdAt: rr.createdAt,
      respondedAt: rr.respondedAt,
      executedAt: rr.executedAt,
    },
  });
}

const RespondBody = z.object({
  action: z.enum(["accepted", "questioning"]),
  note: z.string().max(1000).optional(),
});

/**
 * POST /api/refund-request/[id]
 *
 * 客戶回應退款申請：
 *   accepted    → status=accepted（後續由 admin 執行 /api/admin/bookings/[id]/refund）
 *                 或直接執行 grantCredit（如果是 credit 退款 → 立即發抵用金）
 *   questioning → status=questioning + 推 LINE 給所有 admin/boss
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await params;
  const parsed = RespondBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const rr = await prisma.refundRequest.findUnique({
    where: { id },
    include: { booking: { include: { user: true } } },
  });
  if (!rr) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (rr.booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (rr.status !== "pending_customer" && rr.status !== "questioning") {
    return NextResponse.json(
      { error: "already responded", currentStatus: rr.status },
      { status: 409 },
    );
  }

  if (parsed.data.action === "accepted") {
    // 客戶同意 → 若 method=credit 直接發抵用金；method=cash 等 admin 線下處理
    let executedNow = false;
    if (rr.method === "credit") {
      try {
        const totalCredit = rr.amount + Math.floor(rr.amount * (rr.creditBonusPct / 100));
        await grantCredit({
          userId: rr.booking.userId,
          amount: totalCredit,
          reason: "refund",
          refType: "booking",
          refId: rr.bookingId,
          note: `退款轉抵用金 (v274 客戶確認)${rr.creditBonusPct > 0 ? ` +${rr.creditBonusPct}%` : ""}`,
        });
        // 更新 booking（含 v275 退款備註）
        await prisma.booking.update({
          where: { id: rr.bookingId },
          data: {
            paymentStatus: "refunded",
            refundAmount: rr.amount,
            refundedAt: new Date(),
            refundMethod: "credit",
            refundNote: (rr as unknown as { refundNote?: string | null }).refundNote ?? null,
          },
        });
        executedNow = true;
      } catch (e) {
        console.error("[refund accept credit] failed", e);
        return NextResponse.json(
          { error: "退款執行失敗: " + (e instanceof Error ? e.message : String(e)) },
          { status: 500 },
        );
      }
    }
    await prisma.refundRequest.update({
      where: { id },
      data: {
        status: executedNow ? "executed" : "accepted",
        respondedAt: new Date(),
        executedAt: executedNow ? new Date() : null,
        customerNote: parsed.data.note,
      },
    });
    void logCustomerActivity({
      req,
      user: auth.user,
      action: "customer.refund.decide",
      targetType: "refund",
      targetId: id,
      metadata: { decision: "accepted", executed: executedNow },
    });
    return NextResponse.json({ ok: true, executed: executedNow });
  }

  // questioning：推 LINE 給所有 admin/boss
  await prisma.refundRequest.update({
    where: { id },
    data: {
      status: "questioning",
      respondedAt: new Date(),
      customerNote: parsed.data.note,
    },
  });
  // 找所有 admin/boss
  const admins = await prisma.user.findMany({
    where: {
      OR: [{ role: "admin" }, { role: "boss" }, { roles: { has: "admin" } }, { roles: { has: "boss" } }],
    },
    select: { lineUserId: true, notifyByLine: true, email: true },
  });
  const customerName = rr.booking.user.realName ?? rr.booking.user.displayName;
  const text = `⚠️ 退款有疑問\n\n客戶 ${customerName} 對退款申請有疑問：\n\n訂單 #${rr.bookingId.slice(0, 8)}\n退款 NT$ ${rr.amount}\n\n客戶留言：${parsed.data.note ?? "（無留言）"}\n\n請至 admin 後台處理。`;
  const lineClient = getLineClient();
  for (const a of admins) {
    if ((a.notifyByLine ?? true) && lineClient) {
      try {
        await lineClient.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] });
      } catch (e) {
        console.error("[refund questioning notify admin]", e);
      }
    }
  }
  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.refund.decide",
    targetType: "refund",
    targetId: id,
    metadata: { decision: "questioning" },
  });
  return NextResponse.json({ ok: true });
}
