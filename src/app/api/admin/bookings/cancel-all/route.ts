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
    const r = await prisma.booking.updateMany({
      where: { status: { in: ["pending", "confirmed"] } },
      data: {
        status: "cancelled_by_user",
        cancellationReason: "admin bulk cancel",
      },
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
