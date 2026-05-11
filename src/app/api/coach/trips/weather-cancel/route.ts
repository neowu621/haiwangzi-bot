import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tripId: z.string().uuid(),
  reason: z.string().min(1),
});

// POST /api/coach/trips/weather-cancel
// 教練/Admin 觸發天氣取消,廣播給該場次所有訂單者
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const data = BodySchema.parse(await req.json());

  const trip = await prisma.divingTrip.update({
    where: { id: data.tripId },
    data: { status: "cancelled", cancelReason: "weather" },
  });

  const bookings = await prisma.booking.findMany({
    where: { refId: data.tripId, type: "daily", status: { not: "cancelled_by_user" } },
  });

  // 全部標 cancelled_by_weather
  await prisma.booking.updateMany({
    where: { refId: data.tripId, type: "daily", status: { not: "cancelled_by_user" } },
    data: { status: "cancelled_by_weather", cancellationReason: data.reason },
  });

  // LINE 推播給所有報名者
  const client = getLineClient();
  const dateStr = trip.date.toISOString().slice(0, 10);
  const message = `⚠️ 場次取消通知\n\n${dateStr} ${trip.startTime} 場次因${data.reason}取消。\n\n請選擇:\n• 改期 → 看其他可預約場次\n• 退款 → 教練會聯繫您`;

  const results = await Promise.allSettled(
    bookings.map((b) =>
      client.pushMessage({
        to: b.userId,
        messages: [{ type: "text", text: message }],
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    notified: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}
