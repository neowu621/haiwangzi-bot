import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/admin-weekly
 *
 * 由 Cronicle 每週一早上 09:00 觸發。
 * 計算上週統計，推 Flex「Admin 週報」給所有 role=admin 的 User。
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "server_misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();

  // 算上週範圍 (週一 ~ 週日)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const daysSinceLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const lastMonday = new Date(today);
  lastMonday.setDate(today.getDate() - daysSinceLastMonday - 7);
  lastMonday.setHours(0, 0, 0, 0);
  const thisMonday = new Date(lastMonday);
  thisMonday.setDate(lastMonday.getDate() + 7);

  // 上週新增的 bookings
  const newBookings = await prisma.booking.count({
    where: { createdAt: { gte: lastMonday, lt: thisMonday } },
  });
  // 上週完成的 bookings (status=completed)
  const completed = await prisma.booking.count({
    where: {
      status: "completed",
      updatedAt: { gte: lastMonday, lt: thisMonday },
    },
  });
  // 上週取消
  const cancelled = await prisma.booking.count({
    where: {
      status: { in: ["cancelled_by_user", "cancelled_by_weather"] },
      updatedAt: { gte: lastMonday, lt: thisMonday },
    },
  });
  // 上週收款 (paymentProof.verifiedAt)
  const verifiedProofs = await prisma.paymentProof.aggregate({
    where: { verifiedAt: { gte: lastMonday, lt: thisMonday } },
    _sum: { amount: true },
  });
  const revenue = verifiedProofs._sum.amount ?? 0;

  // 最熱門潛點
  const tripBookings = await prisma.booking.findMany({
    where: {
      type: "daily",
      createdAt: { gte: lastMonday, lt: thisMonday },
      status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"] },
    },
    select: { refId: true, participants: true },
  });
  const trips = await prisma.divingTrip.findMany({
    where: { id: { in: Array.from(new Set(tripBookings.map((b) => b.refId))) } },
  });
  const sites = await prisma.diveSite.findMany();
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));
  const siteCount = new Map<string, number>();
  for (const b of tripBookings) {
    const trip = trips.find((t) => t.id === b.refId);
    if (!trip) continue;
    for (const sid of trip.diveSiteIds) {
      siteCount.set(sid, (siteCount.get(sid) ?? 0) + b.participants);
    }
  }
  let topSite = "—";
  let topCount = 0;
  for (const [sid, n] of siteCount.entries()) {
    if (n > topCount) {
      topCount = n;
      topSite = siteMap.get(sid) ?? sid;
    }
  }

  // 推 Flex 給所有 admin
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
  });
  const sent: string[] = [];
  const errors: Array<{ adminId: string; error: string }> = [];

  if (process.env.LINE_CHANNEL_ACCESS_TOKEN && admins.length > 0) {
    const client = getLineClient();
    const msg = buildFlexByKey(
      "admin_weekly",
      {
        weekRange: `${lastMonday.toISOString().slice(0, 10)} ~ ${new Date(thisMonday.getTime() - 86400000).toISOString().slice(0, 10)}`,
        bookings: newBookings,
        revenue,
        cancellations: cancelled,
        completed,
        topSite,
      },
      "上週營運摘要",
    );
    for (const a of admins) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await client.pushMessage({ to: a.lineUserId, messages: [msg as any] });
        sent.push(a.lineUserId);
      } catch (e) {
        errors.push({
          adminId: a.lineUserId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    weekRange: {
      from: lastMonday.toISOString().slice(0, 10),
      to: new Date(thisMonday.getTime() - 86400000).toISOString().slice(0, 10),
    },
    stats: {
      newBookings,
      completed,
      cancelled,
      revenue,
      topSite,
    },
    sent,
    errors,
    tookMs: Date.now() - startedAt.getTime(),
  });
}
