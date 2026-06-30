// v677：到場點名 —— 今日參加名單（給教練/助教/老闆/管理者現場點名用）。
//   回今天的日潛場次 + 進行中潛旅，各自的已確認/已點名 bookings，依場次分組。
//   點名動作沿用既有 POST /api/coach/bookings/[id]/attendance。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "assistant", "boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const dayStart = new Date(`${todayStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${todayStr}T23:59:59+08:00`);

  // 今天的日潛場次 + 今天進行中的潛旅
  const [trips, tours] = await Promise.all([
    prisma.divingTrip.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      select: { id: true, date: true, startTime: true, diveSiteIds: true },
    }),
    prisma.tourPackage.findMany({
      where: { dateStart: { lte: dayEnd }, dateEnd: { gte: dayStart } },
      select: { id: true, title: true, dateStart: true, dateEnd: true },
    }),
  ]);

  const tripIds = trips.map((t) => t.id);
  const tourIds = tours.map((t) => t.id);
  const refIds = [...tripIds, ...tourIds];
  if (refIds.length === 0) return NextResponse.json({ date: todayStr, sessions: [] });

  // 站點名稱
  const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = siteIds.length
    ? await prisma.diveSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
    : [];
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  // v719：點名名單 = 所有「會到場」的訂單（排除取消類），不論付款是否核對。
  //   原本只收 confirmed/completed/no_show，會漏掉「待確認匯款(awaiting_verify)」與
  //   「建立/等待付款(pending)」的客人 —— 他們其實會來潛水，要能點名。
  //   付款狀態另以 paymentStatus 標示（未付清/付清），不影響是否出現在名單。
  const bookings = await prisma.booking.findMany({
    where: {
      refId: { in: refIds },
      status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"] },
      paymentStatus: { notIn: ["refunding", "refunded"] },
    },
    select: {
      id: true, refId: true, type: true, participants: true, status: true,
      paymentStatus: true, signatureImageKey: true,
      totalAmount: true, paidAmount: true, // v755：點名確認框要顯示剩餘款／判斷有無付款
      user: { select: { displayName: true, realName: true, phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byRef = new Map<string, typeof bookings>();
  for (const b of bookings) {
    const arr = byRef.get(b.refId) ?? [];
    arr.push(b);
    byRef.set(b.refId, arr);
  }

  const mapBk = (b: typeof bookings[number]) => ({
    id: b.id,
    name: b.user.realName ?? b.user.displayName,
    phone: b.user.phone,
    participants: b.participants,
    status: b.status,
    paymentStatus: b.paymentStatus,
    signed: !!b.signatureImageKey,
    totalAmount: b.totalAmount, // v755
    paidAmount: b.paidAmount,   // v755：剩餘 = totalAmount - paidAmount
  });

  const sessions = [
    ...trips.map((t) => ({
      key: `daily-${t.id}`,
      type: "daily" as const,
      label: `${t.startTime} ${t.diveSiteIds.map((id) => siteName.get(id) ?? id).join("、")}`.trim(),
      time: t.startTime,
      date: t.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }), // v737：場次日期(YYYY-MM-DD)
      bookings: (byRef.get(t.id) ?? []).map(mapBk),
    })),
    ...tours.map((t) => ({
      key: `tour-${t.id}`,
      type: "tour" as const,
      label: t.title,
      time: "",
      date: t.dateStart.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }), // v737：出發日
      bookings: (byRef.get(t.id) ?? []).map(mapBk),
    })),
  ].filter((s) => s.bookings.length > 0);

  return NextResponse.json({ date: todayStr, sessions });
}
