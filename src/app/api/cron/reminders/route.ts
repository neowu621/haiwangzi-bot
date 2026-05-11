import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/cron/reminders
// Zeabur cron 每天早上 09:00 與下午 18:00 觸發
//   - 出發前一天 18:00 → 寄 D-1 行前提醒 (日潛 + 旅行團)
//   - 旅行團尾款截止前 3 天 09:00 → 寄尾款提醒
//   - 旅行團出發前 1 天 09:00 → 寄行前手冊
//
// 認證：簡單用 query string ?token=<CRON_TOKEN>，Zeabur 上設定為環境變數
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      note: "LINE_CHANNEL_ACCESS_TOKEN 未設定，僅 dry-run",
    });
  }

  const client = getLineClient();
  const sent: Array<{ type: string; userId: string; bookingId: string }> = [];

  // 計算明日的 00:00 與 24:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow.getTime() + 86400000);

  // ─── D-1 日潛提醒 ─────────────────────────────────
  const dailyTrips = await prisma.divingTrip.findMany({
    where: {
      date: { gte: tomorrow, lt: dayAfter },
      status: "open",
    },
  });
  for (const trip of dailyTrips) {
    const bookings = await prisma.booking.findMany({
      where: {
        refId: trip.id,
        type: "daily",
        status: "confirmed",
      },
      include: { user: true },
    });
    for (const b of bookings) {
      const dup = await prisma.reminderLog.findFirst({
        where: { bookingId: b.id, type: "d1_reminder" },
      });
      if (dup) continue;
      try {
        const msg = buildFlexByKey(
          "d1_reminder",
          {
            date: trip.date.toISOString().slice(0, 10),
            time: trip.startTime,
            site: "東北角",
            weather: "晴",
            wave: "1m",
            water: "24°C",
            vis: "8-12m",
            gather: "集合時間：" + trip.startTime,
          },
          `明日 ${trip.startTime} 行前提醒`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: b.userId, messages: [msg as any] });
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "d1_reminder", channel: "line" },
        });
        sent.push({ type: "d1_reminder", userId: b.userId, bookingId: b.id });
      } catch (e) {
        await prisma.reminderLog.create({
          data: {
            bookingId: b.id,
            type: "d1_reminder",
            channel: "line",
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }
  }

  // ─── 尾款提醒 (旅行團出發前 3 天) ─────────────────
  const in3 = new Date();
  in3.setDate(in3.getDate() + 3);
  in3.setHours(0, 0, 0, 0);
  const in3End = new Date(in3.getTime() + 86400000);

  const toursIn3 = await prisma.tourPackage.findMany({
    where: { dateStart: { gte: in3, lt: in3End } },
  });
  for (const tour of toursIn3) {
    const bookings = await prisma.booking.findMany({
      where: {
        refId: tour.id,
        type: "tour",
        status: "confirmed",
        paymentStatus: "deposit_paid",
      },
    });
    for (const b of bookings) {
      const dup = await prisma.reminderLog.findFirst({
        where: { bookingId: b.id, type: "final_reminder" },
      });
      if (dup) continue;
      const remaining = b.totalAmount - b.paidAmount;
      if (remaining <= 0) continue;
      try {
        const msg = buildFlexByKey(
          "final_reminder",
          {
            tourTitle: tour.title,
            remaining,
            deadline: tour.finalDeadline
              ? tour.finalDeadline.toISOString().slice(0, 10)
              : "—",
            daysLeft: 3,
            bankAccount: process.env.BANK_ACCOUNT ?? "—",
            url: process.env.NEXT_PUBLIC_BASE_URL
              ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/payment/${b.id}?type=final`
              : "https://line.me/",
          },
          `${tour.title} 尾款提醒`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: b.userId, messages: [msg as any] });
        await prisma.reminderLog.create({
          data: { bookingId: b.id, type: "final_reminder", channel: "line" },
        });
        sent.push({
          type: "final_reminder",
          userId: b.userId,
          bookingId: b.id,
        });
      } catch (e) {
        await prisma.reminderLog.create({
          data: {
            bookingId: b.id,
            type: "final_reminder",
            channel: "line",
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }
  }

  return NextResponse.json({ ok: true, sent });
}
