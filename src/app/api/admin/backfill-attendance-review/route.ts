// v782：一鍵補推「到場確認／五星好評」給之前已到場但沒收到的客戶。
//   GET  ?days=45 → 回符合資格的筆數（status=completed 且 review_sent_at IS NULL，近 N 天）。
//   POST { days?, limit? } → 對這些客戶補發 attendance_confirmed，並蓋 review_sent_at（防重複）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 45;
const MAX_BATCH = 200;

async function findEligible(days: number, take: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return prisma.booking.findMany({
    where: {
      status: "completed",
      reviewSentAt: null,
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true, userId: true, type: true, refId: true,
      participants: true, tankCount: true,
    },
  });
}

// 把 eligible bookings 補上「姓名 / 場次 / 日期」給前端預覽名單
async function enrichList(bookings: Awaited<ReturnType<typeof findEligible>>) {
  const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours, users] = await Promise.all([
    dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true } }) : Promise.resolve([]),
    tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    prisma.user.findMany({ where: { lineUserId: { in: Array.from(new Set(bookings.map((b) => b.userId))) } }, select: { lineUserId: true, realName: true, displayName: true } }),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const userMap = new Map(users.map((u) => [u.lineUserId, u]));
  return bookings.map((b) => {
    const u = userMap.get(b.userId);
    let session = "潛水行程";
    let date: string | null = null;
    if (b.type === "daily") {
      const t = tripMap.get(b.refId);
      if (t) { session = `日潛 ${t.startTime}`; date = t.date.toISOString().slice(0, 10); }
    } else {
      const t = tourMap.get(b.refId);
      if (t) session = t.title;
    }
    return { id: b.id, name: u?.realName || u?.displayName || "（未命名）", session, date };
  });
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const days = Math.max(1, Math.min(365, Number(req.nextUrl.searchParams.get("days")) || DEFAULT_DAYS));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const eligible = await prisma.booking.count({
    where: { status: "completed", reviewSentAt: null, updatedAt: { gte: since } },
  });
  // v835：回傳名單（最多前 100 筆）給前端預覽，讓老闆先看「哪些人/場次」再送
  const bookings = await findEligible(days, Math.min(eligible, 100));
  const list = await enrichList(bookings);
  return NextResponse.json({ eligible, days, list, listTruncated: eligible > list.length });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const body = await req.json().catch(() => ({}));
  const days = Math.max(1, Math.min(365, Number(body?.days) || DEFAULT_DAYS));
  const limit = Math.max(1, Math.min(MAX_BATCH, Number(body?.limit) || MAX_BATCH));

  const bookings = await findEligible(days, limit);
  if (bookings.length === 0) return NextResponse.json({ sent: 0, remaining: 0 });

  // 補活動標題（daily 場次 / tour 團名）
  const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true, diveSiteIds: true, tankCount: true } }) : Promise.resolve([]),
    tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));

  // 客戶目前累積潛數 / VIP
  const userIds = Array.from(new Set(bookings.map((b) => b.userId)));
  const users = await prisma.user.findMany({
    where: { lineUserId: { in: userIds } },
    select: { lineUserId: true, haiwangziLogCount: true, vipLevel: true },
  });
  const userMap = new Map(users.map((u) => [u.lineUserId, u]));

  const { notifyCustomer } = await import("@/lib/notify-template");
  const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";

  let sent = 0;
  for (const b of bookings) {
    let bookingTitle = "您的潛水行程";
    let addLogs = b.participants;
    if (b.type === "daily") {
      const t = tripMap.get(b.refId);
      if (t) {
        bookingTitle = `日潛 ${t.date.toISOString().slice(0, 10)} ${t.startTime}`;
        addLogs = (b.tankCount ?? t.tankCount ?? 1) * b.participants;
      }
    } else {
      const t = tourMap.get(b.refId);
      if (t) bookingTitle = t.title;
    }
    const u = userMap.get(b.userId);
    notifyCustomer({
      userId: b.userId,
      templateKey: "attendance_confirmed",
      params: {
        bookingTitle,
        addLogs,
        totalLogs: u?.haiwangziLogCount ?? 0,
        vipLevel: u?.vipLevel ?? 1,
        liffUrl,
      },
    });
    // 蓋章防重複（不論推播成敗都標記，避免重按重發）
    await prisma.booking.update({ where: { id: b.id }, data: { reviewSentAt: new Date() } }).catch(() => {});
    sent++;
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const remaining = await prisma.booking.count({
    where: { status: "completed", reviewSentAt: null, updatedAt: { gte: since } },
  });
  return NextResponse.json({ sent, remaining });
}
