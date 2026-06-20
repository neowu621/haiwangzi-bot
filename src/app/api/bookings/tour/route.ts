import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";
import { genBookingCode } from "@/lib/code-gen";
import { generatePayLinkToken } from "@/lib/pay-link";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tourId: z.string().uuid(),
  participants: z.number().int().min(1).max(10).default(1),
  selectedAddons: z.array(z.string()).default([]),
  notes: z.string().optional(),
  // v289：建立訂單時不選付款方式，等客戶到「付款方式選擇」頁才寫入
  paymentMethod: z.enum(["bank", "linepay", "other"]).nullable().optional(),
  paymentNote: z.string().max(200).optional(), // 客戶選「其他」時填寫的說明
  creditUsed: z.number().int().min(0).optional().default(0),
  agreedToTerms: z.literal(true),
  // v260：手寫簽名 PNG data URL
  signatureDataUrl: z.string().optional(),
  realName: z.string().min(1),
  phone: z.string().min(1),
  certNumber: z.string().optional(),
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }),
});

// POST /api/bookings/tour
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const tour = await prisma.tourPackage.findUnique({ where: { id: data.tourId } });
  if (!tour) return NextResponse.json({ error: "tour not found" }, { status: 404 });
  if (tour.status !== "open")
    return NextResponse.json({ error: `tour status: ${tour.status}` }, { status: 400 });

  // 黑名單檢查
  if (auth.user.blacklisted) {
    return NextResponse.json(
      {
        error: "blacklisted",
        message: auth.user.blacklistReason || "您的帳號被標記為黑名單",
      },
      { status: 403 },
    );
  }
  // v313：擋未驗證 Email 客戶下單
  if (!auth.user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "email_not_verified",
        message: "請先完成 Email 驗證才能下單。請至「個人」分頁查看驗證信，或在頂部 banner 點「重寄驗證信」。",
      },
      { status: 403 },
    );
  }

  // 容量檢查 (null = 無上限)
  const booked = await prisma.booking.aggregate({
    where: {
      refId: data.tourId,
      type: "tour",
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    _sum: { participants: true },
  });
  const currentBooked = booked._sum.participants ?? 0;
  if (tour.capacity != null) {
    const remaining = tour.capacity - currentBooked;
    if (remaining < data.participants) {
      // 潛水團超量直接擋（與日潛不同；潛水團需提前規劃住宿/機票）
      return NextResponse.json(
        { error: `available ${remaining} < requested ${data.participants}` },
        { status: 400 },
      );
    }
  }

  // 算錢: basePrice + addons 加總
  const addons = (tour.addons as Array<{ id: string; priceDelta: number }>) ?? [];
  const addonAmount = data.selectedAddons.reduce((s, id) => {
    const addon = addons.find((a) => a.id === id);
    return s + (addon?.priceDelta ?? 0);
  }, 0);
  const totalAmount = (tour.basePrice + addonAmount) * data.participants;

  // 更新個資
  await prisma.user.update({
    where: { lineUserId: auth.user.lineUserId },
    data: {
      realName: data.realName,
      phone: data.phone,
      certNumber: data.certNumber,
      emergencyContact: data.emergencyContact,
    },
  });

  // 抵用金折抵：不能超過 user 餘額也不能超過總金額
  const creditUsed = Math.max(
    0,
    Math.min(
      data.creditUsed ?? 0,
      auth.user.creditBalance ?? 0,
      totalAmount,
    ),
  );
  const depositAmount = tour.deposit * data.participants;
  const paidAmount = creditUsed;
  // 折抵後若已超過訂金 → confirmed；超過全額 → fully_paid
  let paymentStatus: "pending" | "deposit_paid" | "fully_paid" = "pending";
  let status: "pending" | "confirmed" = "pending";
  if (paidAmount >= totalAmount && totalAmount > 0) {
    paymentStatus = "fully_paid";
    status = "confirmed";
  } else if (paidAmount >= depositAmount && depositAmount > 0) {
    paymentStatus = "deposit_paid";
    status = "confirmed";
  }

  const bookingCode = await genBookingCode();
  const booking = await prisma.booking.create({
    data: {
      code: bookingCode,
      userId: auth.user.lineUserId,
      type: "tour",
      refId: data.tourId,
      participants: data.participants,
      selectedAddons: data.selectedAddons,
      notes: data.notes,
      totalAmount,
      depositAmount,
      paidAmount,
      paymentStatus,
      paymentMethod: data.paymentMethod ?? null,
      // v296：公開付款連結 token
      payLinkToken: generatePayLinkToken(),
      paymentNote: data.paymentNote ?? null,
      creditUsed,
      status,
      agreedToTermsAt: new Date(),
    },
  });

  // v278：記錄初始狀態
  void import("@/lib/booking-status-log").then((m) =>
    m.logBookingStatusChange({
      bookingId: booking.id,
      fromStatus: null,
      toStatus: status,
      actorId: auth.user.lineUserId,
      actorRole: "customer",
      note: `下單（付款狀態：${paymentStatus}）`,
    }),
  ).catch((e) => console.error("[booking-status-log]", e));

  // v260/v612：手寫簽名 — 先存 DB 暫存欄位（秒回）→ R2 交背景 + cron 補傳。
  if (data.signatureDataUrl) {
    const ua = req.headers.get("user-agent") ?? null;
    try {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          signaturePending: data.signatureDataUrl,
          signaturePendingAt: new Date(),
          signedAt: new Date(),
          signedFromUserAgent: ua,
        } as never,
      });
      void import("@/lib/signature-flush")
        .then((m) => m.flushPendingSignature(booking.id))
        .catch((e) => console.error("[signature immediate flush]", e));
    } catch (e) {
      console.error("[tour booking signature pending save] failed", e);
    }
  }

  if (creditUsed > 0) {
    try {
      await grantCredit({
        userId: auth.user.lineUserId,
        amount: -creditUsed,
        reason: "used",
        refType: "booking",
        refId: booking.id,
        note: `潛水團預約折抵`,
      });
    } catch (e) {
      console.error("[tour booking credit deduct]", e);
      await prisma.booking.delete({ where: { id: booking.id } });
      return NextResponse.json(
        { error: "credit deduction failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // v270：首單獎勵改在 attendance=completed 時觸發，不在這裡

  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.booking.create",
    targetType: "booking",
    targetId: booking.id,
    targetLabel: booking.code ?? undefined,
    metadata: {
      type: "tour",
      packageId: data.tourId,
      participants: data.participants,
      totalAmount,
    },
  });

  return NextResponse.json({ ok: true, booking });
}
