import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334
import { refundBookingCredit } from "@/lib/refund-booking-credit"; // v603

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
  // 多人預約時各潛伴明細 (除本人外)
  participantDetails: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        phone: z.string().optional().default(""),
        cert: z
          .enum(["OW", "AOW", "Rescue", "DM", "Instructor"])
          .nullable()
          .optional(),
        certNumber: z.string().optional().default(""),
        logCount: z.number().int().min(0).optional().default(0),
        relationship: z.string().optional().default(""),
        isSelf: z.boolean().optional().default(false),
      }),
    )
    .optional(),
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
  // 已取消、已完成、未到 → 不能改 (v293 補 cancelled_unpaid)
  if (
    booking.status === "cancelled_by_user" ||
    booking.status === "cancelled_by_weather" ||
    booking.status === "cancelled_unpaid" ||
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
    // v48 計價公式（與 POST /api/bookings/daily 一致）
    // 總額 = baseTrip + extraTank × 支數 × 人數 + 夜潛/水推 + 裝備
    const divesAmount = pricing.extraTank * effectiveTanks * newParticipants;
    let extraAmount = pricing.baseTrip;
    if (trip.isNightDive) extraAmount += pricing.nightDive;
    if (trip.isScooter) extraAmount += pricing.scooterRental;

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
    const totalAmount = divesAmount + extraAmount + gearAmount;

    const updated = await prisma.booking.update({
      where: { id },
      data: {
        participants: newParticipants,
        tankCount: effectiveTanks, // v704：編輯後同步存實際潛次
        rentalGear: data.rentalGear ?? undefined,
        notes: data.notes === undefined ? undefined : data.notes,
        participantDetails:
          data.participantDetails === undefined
            ? undefined
            : (data.participantDetails as never),
        totalAmount,
      },
    });
    void logCustomerActivity({
      req,
      user: auth.user,
      action: "customer.booking.update",
      targetType: "booking",
      targetId: updated.id,
      targetLabel: updated.code ?? undefined,
      metadata: { type: "daily", participants: updated.participants, totalAmount },
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
    void logCustomerActivity({
      req,
      user: auth.user,
      action: "customer.booking.update",
      targetType: "booking",
      targetId: updated.id,
      targetLabel: updated.code ?? undefined,
      metadata: { type: "tour", participants: updated.participants, totalAmount },
    });
    return NextResponse.json({ ok: true, booking: updated });
  }

  return NextResponse.json({ error: "unknown booking type" }, { status: 400 });
}

// DELETE /api/bookings/:id — 客戶自取消
// v285：未付款 → cancelled_unpaid（訂單不成立，不需退款）
//       已付款 → cancelled_by_user（客戶需另外申請退款）
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
    booking.status === "cancelled_unpaid" ||
    booking.status === "completed"
  ) {
    return NextResponse.json(
      { error: `already ${booking.status}` },
      { status: 400 },
    );
  }
  // v305：客戶取消「一律」cancelled_by_user，不再依 paidAmount 區分
  //   cancelled_unpaid 保留給「系統自動催繳取消」或「admin 手動標記」
  const hasPaid = booking.paidAmount > 0;
  const updated = await prisma.booking.update({
    where: { id },
    data: {
      status: "cancelled_by_user",
      cancellationReason: hasPaid ? "user_cancel_after_payment" : "user_cancel_unpaid",
      payLinkVerifiedAt: new Date(), // v297：客戶取消後公開付款連結失效
    },
  });
  // v305-A：自動駁回所有未審 proof，避免老闆事後又審核造成資料不一致
  void prisma.paymentProof.updateMany({
    where: {
      bookingId: id,
      verifiedAt: null,
      rejectedAt: null,
    },
    data: {
      rejectedAt: new Date(),
      rejectReason: "客戶在審核前取消訂單",
    },
  }).catch((e) => console.error("[cancel auto-reject proofs]", e));
  // v603：退還下單時折抵的抵用金（冪等；creditUsed=0 自動略過）
  const creditRefunded = await refundBookingCredit(id, {
    note: `訂單 ${booking.code ?? id.slice(0, 8)} 客戶取消，退還折抵的抵用金`,
  }).catch((e) => {
    console.error("[cancel refund credit]", e);
    return 0;
  });
  // v278：log
  void import("@/lib/booking-status-log").then((m) =>
    m.logBookingStatusChange({
      bookingId: id,
      fromStatus: booking.status,
      toStatus: "cancelled_by_user",
      actorId: auth.user.lineUserId,
      actorRole: "customer",
      note: hasPaid
        ? `客戶主動取消（已付 NT$${booking.paidAmount}，請申請退款）`
        : "客戶主動取消（未付款）",
    }),
  );
  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.booking.cancel",
    targetType: "booking",
    targetId: updated.id,
    targetLabel: updated.code ?? undefined,
    metadata: { hasPaid, paidAmount: booking.paidAmount },
  });
  return NextResponse.json({ ok: true, booking: updated, hasPaid, creditRefunded });
}
