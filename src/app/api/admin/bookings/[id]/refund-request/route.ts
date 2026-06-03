import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { buildFlexByKeyAsync } from "@/lib/flex";
import { sendEmail } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  method: z.enum(["cash", "credit"]),
  amount: z.number().int().min(1),
  creditBonusPct: z.number().int().min(0).max(50).optional(),
  reason: z.string().max(1000).optional(),
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

  // 推 LINE Flex
  if (booking.user.notifyByLine ?? true) {
    void (async () => {
      try {
        const lineClient = getLineClient();
        if (!lineClient) return;
        const flex = await buildFlexByKeyAsync(
          "refund_request",
          {
            bookingTitle,
            amount: data.amount,
            method: data.method,
            creditBonus: data.creditBonusPct ?? 0,
            reason: data.reason ?? "",
            liffUrl: refundUrl,
          },
          `退款申請 NT$${data.amount} 待您確認`,
        );
        await lineClient.pushMessage({ to: booking.userId, messages: [flex] });
      } catch (e) {
        console.error("[refund-request LINE]", e);
      }
    })();
  }

  // 推 Email
  if ((booking.user.notifyByEmail ?? true) && booking.user.email) {
    void (async () => {
      try {
        const methodLabel = data.method === "credit"
          ? `🎁 抵用金 NT$ ${data.amount}${(data.creditBonusPct ?? 0) > 0 ? `（額外 +${data.creditBonusPct}% 加成）` : ""}`
          : `💵 現金退費 NT$ ${data.amount}`;
        const text = `Hi ${booking.user.realName ?? booking.user.displayName}，

您有一筆退款申請待確認：

  訂單：${bookingTitle}
  退款方式：${methodLabel}
  退款金額：NT$ ${data.amount}
${data.reason ? `  原因：${data.reason}\n` : ""}
請至 LINE 預約 App 點擊「查看詳情並確認」回應。
或直接開啟：${refundUrl}

— 海王子潛水`;
        await sendEmail({
          to: booking.user.email!,
          subject: `退款申請待您確認 NT$${data.amount} — 海王子潛水`,
          text,
        });
      } catch (e) {
        console.error("[refund-request Email]", e);
      }
    })();
  }

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
