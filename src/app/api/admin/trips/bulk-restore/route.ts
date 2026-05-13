import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  // 安全：必須顯式列出要還原的 IDs，避免一次還原錯誤的東西
  tripIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /api/admin/trips/bulk-restore
//   body: { tripIds: [...] }
//   功能：把指定 trips 的 status 從 cancelled → open
//   用途：場次被誤取消（例如天氣 cron 誤報、手動誤點）後一次性還原
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { tripIds } = BodySchema.parse(await req.json());

  const r = await prisma.divingTrip.updateMany({
    where: { id: { in: tripIds }, status: "cancelled" },
    data: { status: "open", cancelReason: null, weatherNote: null },
  });

  // 同步把該場次的 cancelled_by_weather bookings 還原為 confirmed
  // （手動取消的 cancelled_by_user 不動 — 那是客戶自願的）
  const bookings = await prisma.booking.updateMany({
    where: {
      refId: { in: tripIds },
      type: "daily",
      status: "cancelled_by_weather",
    },
    data: { status: "confirmed", cancellationReason: null },
  });

  return NextResponse.json({
    ok: true,
    tripsRestored: r.count,
    bookingsRestored: bookings.count,
  });
}
