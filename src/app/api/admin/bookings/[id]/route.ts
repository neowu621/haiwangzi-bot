import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

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
  status: z
    .enum([
      "pending",
      "confirmed",
      "cancelled_by_user",
      "cancelled_by_weather",
      "completed",
      "no_show",
    ])
    .optional(),
  notes: z.string().nullable().optional(),
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
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) patch[k] = v === "" ? null : v;
  }
  try {
    const updated = await prisma.booking.update({
      where: { id },
      data: patch,
    });
    return NextResponse.json({ ok: true, booking: updated });
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
      return NextResponse.json({ ok: true, action: "hard_deleted" });
    }

    // 軟取消：admin 取消 => status = cancelled_by_user
    const updated = await prisma.booking.update({
      where: { id },
      data: {
        status: "cancelled_by_user",
        cancellationReason: "admin cancelled",
      },
    });
    return NextResponse.json({
      ok: true,
      action: "soft_cancelled",
      booking: updated,
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
