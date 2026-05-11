import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tourId: z.string().uuid(),
  participants: z.number().int().min(1).max(10).default(1),
  selectedAddons: z.array(z.string()).default([]),
  notes: z.string().optional(),
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

  // 容量檢查
  const booked = await prisma.booking.aggregate({
    where: { refId: data.tourId, type: "tour", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });
  const remaining = tour.capacity - (booked._sum.participants ?? 0);
  if (remaining < data.participants) {
    return NextResponse.json(
      { error: `available ${remaining} < requested ${data.participants}` },
      { status: 400 },
    );
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

  const booking = await prisma.booking.create({
    data: {
      userId: auth.user.lineUserId,
      type: "tour",
      refId: data.tourId,
      participants: data.participants,
      selectedAddons: data.selectedAddons,
      notes: data.notes,
      totalAmount,
      depositAmount: tour.deposit * data.participants,
      paidAmount: 0,
      paymentStatus: "pending",
      status: "pending",
      agreedToTermsAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, booking });
}
