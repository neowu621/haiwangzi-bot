import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  bookingId: z.string().min(1),
  method: z.enum(["cash", "credit"]),
  amount: z.number().int().min(1),
  reason: z.string().min(3).max(2000), // 客戶必填說明
});

/**
 * v280: POST /api/refund-request/create
 *
 * 客戶在 LIFF 自助發起退款申請。
 * 前提：booking 是客戶本人的 + paidAmount > 0 + 沒有未處理的 RefundRequest
 *
 * 客戶送出 → RefundRequest status=pending_admin + initiatedBy=customer
 *          → 推 LINE Flex 給所有 admin/boss
 * Admin 在後台審核同意/拒絕。
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 找 booking 並驗權
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { user: { select: { realName: true, displayName: true } } },
  });
  if (!booking) return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your booking" }, { status: 403 });
  }
  if (booking.paidAmount <= 0) {
    return NextResponse.json(
      { error: "尚未有付款紀錄，無法申請退款" },
      { status: 400 },
    );
  }
  if (data.amount > booking.paidAmount) {
    return NextResponse.json(
      { error: `退款金額不能超過已付金額 NT$ ${booking.paidAmount}` },
      { status: 400 },
    );
  }
  // booking 已退款 → 不能再申請
  if (booking.paymentStatus === "refunded") {
    return NextResponse.json(
      { error: "此訂單已退款" },
      { status: 409 },
    );
  }
  // 已有未處理的 RefundRequest → 拒絕
  const existing = await prisma.refundRequest.findFirst({
    where: {
      bookingId: data.bookingId,
      status: { in: ["pending_customer", "pending_admin", "questioning"] },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "已有待處理的退款申請", existingId: existing.id },
      { status: 409 },
    );
  }

  // 讀 admin 設定的 credit bonus（轉抵用金的加成 %，例：店家政策天氣取消 10% 加成）
  // 客戶這邊不能自由填，由系統依政策決定（這裡先給 0 — admin 可在審核時調）
  const creditBonusPct = 0;

  const rr = await prisma.refundRequest.create({
    data: {
      bookingId: data.bookingId,
      requestedBy: auth.user.lineUserId,
      initiatedBy: "customer",
      method: data.method,
      amount: data.amount,
      creditBonusPct,
      reason: data.reason,
      status: "pending_admin",
    },
  });

  // 推 LINE Flex 給 admin/boss
  void (async () => {
    try {
      const lineClient = getLineClient();
      if (!lineClient) return;
      const admins = await prisma.user.findMany({
        where: {
          OR: [
            { role: "admin" }, { role: "boss" },
            { roles: { has: "admin" } }, { roles: { has: "boss" } },
          ],
          notifyByLine: true,
        },
        select: { lineUserId: true },
      });
      let bookingTitle = `#${booking.id.slice(0, 8)}`;
      if (booking.type === "daily") {
        const trip = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
        if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
      } else {
        const tour = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
        if (tour) bookingTitle = tour.title;
      }
      const customerName = booking.user.realName ?? booking.user.displayName;
      const methodLabel = data.method === "credit" ? "🎁 抵用金" : "💵 現金";
      const text = `📨 客戶退款申請\n\n客戶 ${customerName} 申請退款：\n\n訂單：${bookingTitle}\n退款方式：${methodLabel}\n退款金額：NT$ ${data.amount.toLocaleString()}\n已付金額：NT$ ${booking.paidAmount.toLocaleString()}\n\n原因：${data.reason}\n\n請至後台審核：${process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.xyz"}/admin/bookings`;
      for (const a of admins) {
        try {
          await lineClient.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] });
        } catch (e) {
          console.error("[customer refund request notify admin]", e);
        }
      }
    } catch (e) {
      console.error("[customer refund request notify]", e);
    }
  })();

  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.refund.request",
    targetType: "refund",
    targetId: rr.id,
    targetLabel: booking.code ?? undefined,
    metadata: {
      bookingId: data.bookingId,
      amount: data.amount,
      reason: data.reason,
    },
  });

  return NextResponse.json({ ok: true, refundRequest: rr });
}
