import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { refundBookingCredit } from "@/lib/refund-booking-credit"; // v603

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
  const role = requireRole(auth.user, ["coach", "assistant", "admin"]);
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

  // v603：天候取消 → 退還各訂單下單折抵的抵用金（冪等；creditUsed=0 自動略過）
  //   註：與 admin 手動「退款轉抵用金/110% 補償」分流（refType 不同），不會重複退。
  for (const b of bookings) {
    try {
      await refundBookingCredit(b.id, {
        note: `訂單 ${b.code ?? b.id.slice(0, 8)} 天候取消，退還折抵的抵用金`,
        createdBy: auth.user.lineUserId,
      });
    } catch (e) {
      console.error("[weather-cancel refund credit]", b.id, e);
    }
  }

  // v443：天氣取消通知改走 notifyCustomer + weather_cancel 模板
  //   → 統一 LINE / Email / 站內通知、文案與模板一致、尊重會員各通道開關（取代原本純文字 LINE push）
  const sites = trip.diveSiteIds.length
    ? await prisma.diveSite.findMany({
        where: { id: { in: trip.diveSiteIds } },
        select: { name: true },
      })
    : [];
  const siteName = sites.map((s) => s.name).join("、") || "東北角";
  const dateStr = trip.date.toISOString().slice(0, 10);
  const liffUrl =
    process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";

  const { notifyCustomer } = await import("@/lib/notify-template");
  for (const b of bookings) {
    // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
    notifyCustomer({
      userId: b.userId,
      templateKey: "weather_cancel",
      params: {
        date: dateStr,
        time: trip.startTime,
        site: siteName,
        reason: data.reason,
        url: "https://line.me/R/ti/p/%40894bpmew", // v796：聯繫教練改期 → 小編 LINE OA
      },
    });
  }

  return NextResponse.json({ ok: true, notified: bookings.length });
}
