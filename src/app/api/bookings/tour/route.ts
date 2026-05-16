import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { grantCredit } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tourId: z.string().uuid(),
  participants: z.number().int().min(1).max(10).default(1),
  selectedAddons: z.array(z.string()).default([]),
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash", "bank", "linepay", "other"]).default("bank"),
  creditUsed: z.number().int().min(0).optional().default(0),
  agreedToTerms: z.literal(true),
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

  const data = BodySchema.parse(await req.json());

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

  // 禮金折抵：不能超過 user 餘額也不能超過總金額
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

  const booking = await prisma.booking.create({
    data: {
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
      paymentMethod: data.paymentMethod,
      creditUsed,
      status,
      agreedToTermsAt: new Date(),
    },
  });

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

  return NextResponse.json({ ok: true, booking });
}
