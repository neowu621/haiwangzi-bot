import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/bookings/cancel-all
//   body: { confirm: "CANCEL-ALL-BOOKINGS" }
//   把所有「進行中」的訂單 (status in pending/confirmed) 統一取消
//   不刪 booking row（admin 仍能在「取消」tab 看到歷史）
//   也不影響 paymentProof / reminderLog
const Body = z.object({
  confirm: z.literal("CANCEL-ALL-BOOKINGS"),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'confirm 欄位必須是 "CANCEL-ALL-BOOKINGS"' },
      { status: 400 },
    );
  }

  try {
    // v293：先撈出每筆 id+原 status 才能寫 booking_status_log
    const targets = await prisma.booking.findMany({
      where: { status: { in: ["pending", "awaiting_verify", "confirmed"] } },
      select: { id: true, status: true },
    });
    const r = await prisma.booking.updateMany({
      where: { status: { in: ["pending", "awaiting_verify", "confirmed"] } },
      data: {
        status: "cancelled_by_user",
        cancellationReason: "admin bulk cancel",
      },
    });
    // 批量寫 log（不擋住 response）
    void import("@/lib/booking-status-log").then(async (m) => {
      for (const t of targets) {
        try {
          await m.logBookingStatusChange({
            bookingId: t.id,
            fromStatus: t.status,
            toStatus: "cancelled_by_user",
            actorId: auth.user.lineUserId,
            actorRole: "admin",
            note: "admin bulk cancel",
          });
        } catch (e) {
          console.error("[cancel-all log]", t.id, e);
        }
      }
    });
    return NextResponse.json({ ok: true, cancelled: r.count });
  } catch (e) {
    console.error("[POST /admin/bookings/cancel-all]", e);
    return NextResponse.json(
      {
        error: "失敗",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
