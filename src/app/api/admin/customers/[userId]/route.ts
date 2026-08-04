// v320: 客戶完整資訊（給 CustomerDetailDialog 用）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { userId } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { lineUserId: userId },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      nickname: true, // v1015
      phone: true,
      email: true,
      emailVerifiedAt: true,
      cert: true,
      certNumber: true,
      logCount: true,
      vipLevel: true,
      creditBalance: true,
      totalSpend: true,
      notifyByLine: true,
      notifyByEmail: true,
      birthday: true,
      role: true,
      notes: true, // v661：會員層長期備註
      createdAt: true,
      lastActiveAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // 統計：訂單數 / 願望單數 / 累計實付
  //   v739：只算「有實際消費」的訂單 — 排除取消類 / 未到場（無實際下水），與會員列表 revenue、
  //   潛水紀錄「已付款」一致(三處同步排除取消)。
  const activeStatus = {
    notIn: ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid", "no_show"],
  } as Prisma.BookingWhereInput["status"];
  const [bookingCount, wishCount, paidAgg] = await Promise.all([
    prisma.booking.count({ where: { userId, status: activeStatus } }),
    prisma.diveWish.count({ where: { userId } }),
    prisma.booking.aggregate({ where: { userId, status: activeStatus }, _sum: { paidAmount: true } }),
  ]);
  const totalPaid = paidAgg._sum.paidAmount ?? 0;

  // v664：各筆訂單客戶備註(Booking.notes)  +  v942：完整訂單清單(過往訂單紀錄)
  const [noted, orderRows] = await Promise.all([
    prisma.booking.findMany({
      where: { userId, notes: { not: null } },
      select: { id: true, type: true, refId: true, notes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.booking.findMany({
      where: { userId },
      select: { id: true, code: true, type: true, refId: true, participants: true, tankCount: true, totalAmount: true, paidAmount: true, paymentStatus: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  // 兩份資料的 refId 一起解析場次/潛旅標籤（去重，一次查）
  const allRows = [...noted, ...orderRows];
  const dailyIds = Array.from(new Set(allRows.filter((b) => b.type === "daily").map((b) => b.refId)));
  const tourIds = Array.from(new Set(allRows.filter((b) => b.type === "tour").map((b) => b.refId)));
  const [trips, tours] = await Promise.all([
    dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true } }) : Promise.resolve([]),
    tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const labelFor = (type: string, refId: string) =>
    type === "daily"
      ? `日潛 ${tripMap.get(refId)?.date?.toISOString().slice(0, 10) ?? ""} ${tripMap.get(refId)?.startTime ?? ""}`.trim()
      : type === "tour"
        ? (tourMap.get(refId)?.title ?? "潛旅")
        : "客製訂單";
  const activityNotes = noted.map((b) => ({ bookingId: b.id, note: b.notes, label: labelFor(b.type, b.refId), at: b.createdAt }));
  const orders = orderRows.map((b) => ({
    id: b.id, code: b.code, type: b.type, label: labelFor(b.type, b.refId),
    participants: b.participants, tankCount: b.tankCount,
    totalAmount: b.totalAmount, paidAmount: b.paidAmount,
    paymentStatus: b.paymentStatus, status: b.status, at: b.createdAt,
  }));

  return NextResponse.json({
    user,
    stats: { bookingCount, wishCount, totalPaid },
    activityNotes,
    orders,
  });
}
