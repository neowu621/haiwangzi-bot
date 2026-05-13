import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/admin/bookings/[id]
//   預設：軟取消（status = cancelled_by_user）
//   ?permanent=true：硬刪除整筆 booking + paymentProof + reminderLog
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

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
