// v320: 客戶完整資訊（給 CustomerDetailDialog 用）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  // 統計：訂單數 / 願望單數
  const [bookingCount, wishCount] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.diveWish.count({ where: { userId } }),
  ]);

  // v661：彙整該會員「各活動的活動備註」(Booking.adminNotes)，附活動標籤
  const noted = await prisma.booking.findMany({
    where: { userId, adminNotes: { not: null } },
    select: { id: true, type: true, refId: true, adminNotes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const dailyIds = noted.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = noted.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true } }) : Promise.resolve([]),
    tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const activityNotes = noted.map((b) => {
    const label = b.type === "daily"
      ? `日潛 ${tripMap.get(b.refId)?.date?.toISOString().slice(0, 10) ?? ""} ${tripMap.get(b.refId)?.startTime ?? ""}`.trim()
      : (tourMap.get(b.refId)?.title ?? "潛旅");
    return { bookingId: b.id, note: b.adminNotes, label, at: b.createdAt };
  });

  return NextResponse.json({
    user,
    stats: { bookingCount, wishCount },
    activityNotes,
  });
}
