import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  participants: z.number().int().min(1).max(10).optional(),
  tankCount: z.number().int().min(1).max(5).optional(),
  rentalGear: z
    .array(
      z.object({
        itemType: z.enum([
          "BCD",
          "regulator",
          "wetsuit",
          "fins",
          "mask",
          "computer",
          "full_set",
        ]),
        price: z.number().int(),
        qty: z.number().int().min(1).max(20).default(1),
      }),
    )
    .optional(),
  notes: z.string().nullable().optional(),
});

// PATCH /api/bookings/:id — 修改尚未完成 / 取消的訂單
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your booking" }, { status: 403 });
  }
  // 已取消、已完成、未到 → 不能改
  if (
    booking.status === "cancelled_by_user" ||
    booking.status === "cancelled_by_weather" ||
    booking.status === "completed" ||
    booking.status === "no_show"
  ) {
    return NextResponse.json(
      { error: `booking is ${booking.status}, cannot modify` },
      { status: 400 },
    );
  }

  const data = PatchSchema.parse(await req.json());

  // 重算總額需要 trip / tour 詳情
  if (booking.type === "daily") {
    const trip = await prisma.divingTrip.findUnique({
      where: { id: booking.refId },
    });
    if (!trip)
      return NextResponse.json({ error: "trip not found" }, { status: 404 });

    const newParticipants = data.participants ?? booking.participants;

    // 容量檢查（扣掉自己原本的數）
    if (newParticipants !== booking.participants) {
      const sum = await prisma.booking.aggregate({
        where: {
          refId: booking.refId,
          type: "daily",
          status: { not: "cancelled_by_user" },
          id: { not: booking.id },
        },
        _sum: { participants: true },
      });
      const otherBooked = sum._sum.participants ?? 0;
      if (trip.capacity != null && otherBooked + newParticipants > trip.capacity) {
        // 超賣不擋（與 POST 一致），改記 overCapacity flag
        await prisma.booking.update({
          where: { id: booking.id },
          data: { overCapacity: true },
        });
      }
    }

    const pricing = trip.pricing as {
      baseTrip: number;
      extraTank: number;
      nightDive: number;
      scooterRental: number;
    };
    const effectiveTanks = Math.min(
      trip.tankCount,
      Math.max(1, data.tankCount ?? trip.tankCount),
    );
    // v46 計價公式：每一次潛水 × 支數 + 基本費（與 POST /api/bookings/daily 一致）
    let baseAmount =
      pricing.extraTank * effectiveTanks + pricing.baseTrip;
    if (trip.isNightDive) baseAmount += pricing.nightDive;
    if (trip.isScooter) baseAmount += pricing.scooterRental;

    const gear =
      data.rentalGear ??
      (booking.rentalGear as Array<{
        itemType: string;
        price: number;
        qty?: number;
      }>);
    const gearAmount = gear.reduce(
      (s, g) => s + g.price * (g.qty ?? 1),
      0,
    );
    const totalAmount = baseAmount * newParticipants + gearAmount;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        participants: newParticipants,
        rentalGear: data.rentalGear ?? undefined,
        notes: data.notes === undefined ? undefined : data.notes,
        totalAmount,
      },
    });
    return NextResponse.json({ ok: true, booking: updated });
  }

  // tour 的修改範圍小一些（只改 notes + participants）
  if (booking.type === "tour") {
    const tour = await prisma.tourPackage.findUnique({
      where: { id: booking.refId },
    });
    if (!tour)
      return NextResponse.json({ error: "tour not found" }, { status: 404 });

    const newParticipants = data.participants ?? booking.participants;

    if (newParticipants !== booking.participants) {
      const sum = await prisma.booking.aggregate({
        where: {
          refId: booking.refId,
          type: "tour",
          status: { not: "cancelled_by_user" },
          id: { not: booking.id },
        },
        _sum: { participants: true },
      });
      const otherBooked = sum._sum.participants ?? 0;
      if (tour.capacity != null && otherBooked + newParticipants > tour.capacity) {
        return NextResponse.json(
          {
            error: `available ${tour.capacity - otherBooked} < requested ${newParticipants}`,
          },
          { status: 400 },
        );
      }
    }

    // 簡化：潛水團不重算加購（addons 變更比較少），只改人數時等比例重算
    const perPerson = booking.totalAmount / booking.participants;
    const totalAmount = Math.round(perPerson * newParticipants);
    const depositAmount =
      booking.depositAmount > 0
        ? Math.round(
            (booking.depositAmount / booking.participants) * newParticipants,
          )
        : 0;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        participants: newParticipants,
        notes: data.notes === undefined ? undefined : data.notes,
        totalAmount,
        depositAmount,
      },
    });
    return NextResponse.json({ ok: true, booking: updated });
  }

  return NextResponse.json({ error: "unknown booking type" }, { status: 400 });
}

// DELETE /api/bookings/:id — 客戶自取消（轉成 cancelled_by_user）
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your booking" }, { status: 403 });
  }
  if (
    booking.status === "cancelled_by_user" ||
    booking.status === "cancelled_by_weather" ||
    booking.status === "completed"
  ) {
    return NextResponse.json(
      { error: `already ${booking.status}` },
      { status: 400 },
    );
  }
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "cancelled_by_user", cancellationReason: "user_cancel" },
  });
  return NextResponse.json({ ok: true, booking: updated });
}
