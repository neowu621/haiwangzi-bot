import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { notifyCustomer } from "@/lib/notify-template";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  method: z.enum(["cash", "credit"]),
  amount: z.number().int().min(1),
  creditBonusPct: z.number().int().min(0).max(50).optional(),
  reason: z.string().max(1000).optional(),
  // v275：退款備註（內部用，老闆寫實際退款管道）
  refundNote: z.string().max(2000).optional(),
});

/**
 * v274: POST /api/admin/bookings/[id]/refund-request
 *
 * Admin 發起退款申請（不立即執行）→ 建 RefundRequest + 推 Flex 給客戶
 * 客戶在 LIFF /liff/refund/[id] 確認接受 / 有疑問
 * 客戶接受後才執行原本的 /api/admin/bookings/[id]/refund 邏輯
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

  const { id: bookingId } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { user: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  }

  // 已有未處理的 RefundRequest → 不要重發
  const existing = await prisma.refundRequest.findFirst({
    where: { bookingId, status: { in: ["pending_customer", "questioning"] } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "已有待處理的退款申請", existingId: existing.id },
      { status: 409 },
    );
  }

  const rr = await prisma.refundRequest.create({
    data: {
      bookingId,
      requestedBy: auth.user.lineUserId,
      method: data.method,
      amount: data.amount,
      creditBonusPct: data.creditBonusPct ?? 0,
      reason: data.reason,
      // v275: 退款備註（admin 內部）
      refundNote: data.refundNote,
    },
  });

  // 組 booking title
  let bookingTitle = `預約 #${booking.id.slice(0, 8)}`;
  if (booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
    if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
  } else {
    const tour = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
    if (tour) bookingTitle = tour.title;
  }

  const liffBase = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  const refundUrl = `${liffBase}/refund/${rr.id}`;

  // v480：改走 notifyCustomer — LINE/Email/站內 全由模板組稿（後台填什麼發什麼）+ 記入發送紀錄
  notifyCustomer({
    userId: booking.userId,
    templateKey: "refund_request",
    params: {
      bookingTitle,
      amount: data.amount,
      method: data.method,
      creditBonus: data.creditBonusPct ?? 0,
      reason: data.reason ?? "",
      liffUrl: refundUrl,
    },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "refund_request.create",
    targetType: "booking",
    targetId: bookingId,
    targetLabel: booking.code ?? booking.id.slice(0, 8),
    metadata: { refundRequestId: rr.id, method: data.method, amount: data.amount },
  });

  return NextResponse.json({ ok: true, refundRequest: rr });
}
