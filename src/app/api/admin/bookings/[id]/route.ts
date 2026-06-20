import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole, getUserRoles } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { refundBookingCredit } from "@/lib/refund-booking-credit"; // v603

const CANCELLED_STATUSES = new Set([
  "cancelled_by_user",
  "cancelled_by_weather",
  "cancelled_unpaid",
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  participants: z.number().int().min(1).max(20).optional(),
  totalAmount: z.number().int().min(0).optional(),
  depositAmount: z.number().int().min(0).optional(),
  paidAmount: z.number().int().min(0).optional(),
  paymentStatus: z
    .enum(["pending", "deposit_paid", "fully_paid", "refunding", "refunded"])
    .optional(),
  // v309: 移除 cash 選項（v289 起不再支援現場支付）；保留 nullable
  paymentMethod: z.enum(["bank", "linepay", "other"]).nullable().optional(),
  status: z
    .enum([
      "pending",
      "awaiting_verify",       // v276
      "confirmed",
      "cancelled_by_user",
      "cancelled_by_weather",
      "cancelled_unpaid",      // v276
      "completed",
      "no_show",
    ])
    .optional(),
  notes: z.string().nullable().optional(),
  siteNotes: z.string().nullable().optional(),
  adminNotes: z.string().nullable().optional(),
  cancellationReason: z.string().nullable().optional(),
});

// PATCH /api/admin/bookings/[id]
// admin + coach 都可改（教練可在現場改 paidAmount / status）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const isAdminOrBoss = getUserRoles(auth.user).some((r) => r === "admin" || r === "boss");

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    // 管理備註只有 admin/boss 可寫
    if (k === "adminNotes" && !isAdminOrBoss) continue;
    patch[k] = v === "" ? null : v;
  }
  try {
    // v278：抓舊 status 才能 log 變化
    const oldBooking = patch.status !== undefined
      ? await prisma.booking.findUnique({ where: { id }, select: { status: true } })
      : null;
    const updated = await prisma.booking.update({
      where: { id },
      data: patch,
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "booking.update",
      targetType: "booking",
      targetId: id,
      metadata: patch,
    });
    // v278：status 變化才 log
    if (oldBooking && patch.status && oldBooking.status !== patch.status) {
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus: oldBooking.status,
          toStatus: patch.status as string,
          actorId: auth.user.lineUserId,
          actorRole: "admin",
          note: "admin 手動修改狀態",
        }),
      );
    }
    // v603：手動改成「取消」狀態時，退還下單折抵的抵用金（冪等）
    let creditRefunded = 0;
    if (
      oldBooking &&
      patch.status &&
      !CANCELLED_STATUSES.has(oldBooking.status) &&
      CANCELLED_STATUSES.has(patch.status as string)
    ) {
      creditRefunded = await refundBookingCredit(id, {
        note: `訂單 ${id.slice(0, 8)} 改為${patch.status}，退還折抵的抵用金`,
        createdBy: auth.user.lineUserId,
      }).catch((e) => {
        console.error("[admin patch refund credit]", e);
        return 0;
      });
    }
    return NextResponse.json({ ok: true, booking: updated, creditRefunded });
  } catch (e) {
    console.error("[PATCH /admin/bookings]", e);
    return NextResponse.json(
      {
        error: "update failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/bookings/[id]
//   admin + coach 都可
//   預設：軟取消（status = cancelled_by_user）
//   ?permanent=true：硬刪除整筆 booking + paymentProof + reminderLog（admin only）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  // 軟取消 admin + coach 都能；硬刪除限 admin
  const url = new URL(req.url);
  const permanent = url.searchParams.get("permanent") === "true";
  const role = permanent
    ? requireRole(auth.user, ["admin"])
    : requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    if (permanent) {
      await prisma.$transaction(async (tx) => {
        await tx.paymentProof.deleteMany({ where: { bookingId: id } });
        await tx.reminderLog.deleteMany({ where: { bookingId: id } });
        await tx.booking.delete({ where: { id } });
      });
      await logAudit({
        actorId: auth.user.lineUserId,
        action: "booking.delete",
        targetType: "booking",
        targetId: id,
        metadata: { permanent },
      });
      return NextResponse.json({ ok: true, action: "hard_deleted" });
    }

    // 軟取消：admin 取消 => status = cancelled_by_user
    const fromStatus = booking.status;
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: "cancelled_by_user",
        cancellationReason: "admin cancelled",
      },
    });
    // v293：補寫 booking_status_log
    void import("@/lib/booking-status-log").then((m) =>
      m.logBookingStatusChange({
        bookingId: id,
        fromStatus,
        toStatus: "cancelled_by_user",
        actorId: auth.user.lineUserId,
        actorRole: "admin",
        note: "admin 軟取消",
      }),
    );
    // v603：退還下單折抵的抵用金（冪等；若原本已是取消狀態則 helper 內部略過）
    const creditRefunded = CANCELLED_STATUSES.has(fromStatus)
      ? 0
      : await refundBookingCredit(id, {
          note: `訂單 ${booking.code ?? id.slice(0, 8)} admin 取消，退還折抵的抵用金`,
          createdBy: auth.user.lineUserId,
        }).catch((e) => {
          console.error("[admin cancel refund credit]", e);
          return 0;
        });
    // v420：通知客戶「預約已取消」（booking_cancel 模板）
    void (async () => {
      try {
        let bookingTitle = booking.code ?? `預約 #${id.slice(0, 8)}`;
        if (booking.type === "daily") {
          const t = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
          if (t) bookingTitle = `日潛 ${t.date.toISOString().slice(0, 10)} ${t.startTime}`;
        } else {
          const t = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
          if (t) bookingTitle = t.title;
        }
        const { notifyCustomer } = await import("@/lib/notify-template");
        const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
        // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
        notifyCustomer({
          userId: booking.userId,
          templateKey: "booking_cancel",
          params: { bookingTitle, reason: "", liffUrl },
        });
      } catch (e) {
        console.error("[booking cancel notify]", e);
      }
    })();
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "booking.cancel",
      targetType: "booking",
      targetId: id,
      metadata: { permanent },
    });
    return NextResponse.json({
      ok: true,
      action: "soft_cancelled",
      booking: updated,
      creditRefunded,
    });
  } catch (e) {
    console.error("[DELETE /admin/bookings]", e);
    return NextResponse.json(
      {
        error: "刪除失敗",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
