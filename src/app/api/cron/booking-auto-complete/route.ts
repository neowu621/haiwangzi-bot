// v319: 活動日已過 + 訂單仍 confirmed + 已付清 → 自動轉 completed
// 建議 Cronicle 排程：每天 00:30 Asia/Taipei
// 用途：避免老闆忘了在「今晚結帳」標完成，導致統計報表少算
//
// 規則（兩條件同時 met）：
//   1) booking.status === "confirmed"
//   2) paymentStatus === "fully_paid"
//   3) 對應 trip.date（日潛）或 package.dateEnd（潛水團）< 今天（台北時區）
//   → 自動標 completed + 寫 booking_status_log
//
// 排除：pending / awaiting_verify / cancelled / no_show / completed
import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { logBookingStatusChange } from "@/lib/booking-status-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function taipeiTodayDate(): Date {
  const tw = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  return new Date(`${tw}T00:00:00+08:00`);
}

async function run(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const today = taipeiTodayDate();

  // 先抓出所有候選 confirmed + fully_paid bookings
  const candidates = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      paymentStatus: "fully_paid",
    },
    select: { id: true, type: true, refId: true },
    take: 1000,
  });

  // 對日潛 / 潛水團 分別查活動日
  const dailyIds = candidates.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = candidates.filter((b) => b.type === "tour").map((b) => b.refId);

  const [dailyTrips, tourPkgs] = await Promise.all([
    dailyIds.length > 0
      ? prisma.divingTrip.findMany({
          where: { id: { in: dailyIds }, date: { lt: today } },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: string }>),
    tourIds.length > 0
      ? prisma.tourPackage.findMany({
          where: { id: { in: tourIds }, dateEnd: { lt: today } },
          select: { id: true },
        })
      : Promise.resolve([] as Array<{ id: string }>),
  ]);

  const expiredDailyIds = new Set(dailyTrips.map((t) => t.id));
  const expiredTourIds = new Set(tourPkgs.map((p) => p.id));

  const toComplete = candidates.filter((b) =>
    b.type === "daily" ? expiredDailyIds.has(b.refId) : expiredTourIds.has(b.refId),
  );

  let ok = 0;
  let fail = 0;
  for (const b of toComplete) {
    try {
      await prisma.booking.update({
        where: { id: b.id },
        data: { status: "completed" },
      });
      await logBookingStatusChange({
        bookingId: b.id,
        fromStatus: "confirmed",
        toStatus: "completed",
        actorId: null,
        actorRole: "system",
        note: "cron auto-complete (活動日已過 + 已付清)",
      });
      ok++;
    } catch (e) {
      fail++;
      console.error("[booking-auto-complete]", b.id, e);
    }
  }

  return NextResponse.json({
    ok: true,
    eligible: toComplete.length,
    completed: ok,
    failed: fail,
  });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
