// v1038：客戶偏好分析 —— 從既有資料（PageView / Booking / DivingTrip）推導「客戶喜歡什麼」。
//   不新增任何追蹤欄位，全部由現有紀錄算出來：
//     1. 猶豫清單   看過但沒下單（且場次還沒過期）→ 最值得主動關心的名單
//     2. 熱門待轉單 同一場次很多人看卻沒人訂 → 可能是價格/時間/說明有問題
//     3. 潛點排行   哪些潛點最多人報名（以人次計）
//     4. 時段偏好   幾點出發最受歡迎 / 星期幾最多人下水
//     5. 沉睡客戶   曾經來過但很久沒下單 → 該喚回了
//     6. 常客偏好卡 前幾名客戶各自的最愛潛點 / 慣用時段 / 平均支數
//
// Query: ?days=90（統計範圍，1..365）&sleep=90（沉睡判定天數）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1060：潛水旺季 = 清明節 ～ 中秋節。旺季客人本來就常下水，一個月沒動靜就值得關心；
//   淡季隔兩三個月才來很正常，用同一個門檻會把整份名單洗成雜訊。
const PEAK_SLEEP_DAYS = 21; // 3 週：旺季常客大概兩週來一次，滿三週沒動靜就該關心了
const OFF_SLEEP_DAYS = 90;
// 清明是節氣，年年落在 4/4–4/6，取 4/4 當起點即可。
// 中秋是農曆，逐年查表最準（範圍外退回 9/30 的近似值）。
const MID_AUTUMN: Record<number, [number, number]> = {
  2026: [9, 25], 2027: [9, 15], 2028: [10, 3], 2029: [9, 22], 2030: [9, 12],
  2031: [10, 1], 2032: [9, 19], 2033: [9, 8], 2034: [9, 27], 2035: [9, 16],
};

function diveSeason(now: Date): { peak: boolean; start: string; end: string } {
  const y = now.getFullYear();
  const [em, ed] = MID_AUTUMN[y] ?? [9, 30];
  const start = new Date(y, 3, 4);          // 4/4 清明
  const end = new Date(y, em - 1, ed, 23, 59, 59);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    peak: now >= start && now <= end,
    start: `04/04`,
    end: `${pad(em)}/${pad(ed)}`,
  };
}

const STAFF_ROLES = ["boss", "admin", "it", "coach", "assistant"] as const;
const DEAD = ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"] as const;
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

type Named = { lineUserId: string; displayName: string; realName: string | null; nickname: string | null; phone: string | null };
const nameOf = (u: Named | undefined) =>
  u ? `${u.nickname || "?"}（${u.realName || u.displayName}）` : "（已刪除）";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const sp = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(7, Number(sp.get("days") ?? "90")));
  // v1060：沉睡門檻分旺淡季 —— 淡季兩三個月不下水很正常，旺季一個月沒動靜就該關心了。
  //   ?sleep=<天> 可手動指定；不帶就依當下日期自動判定。
  const season = diveSeason(new Date());
  const sleepDays = sp.get("sleep")
    ? Math.min(365, Math.max(7, Number(sp.get("sleep"))))
    : season.peak ? PEAK_SLEEP_DAYS : OFF_SLEEP_DAYS;
  const since = new Date(Date.now() - days * 86400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 管理人員名單（全部統計都排除，他們的瀏覽/測試單會蓋掉真實偏好）
  const staff = await prisma.user.findMany({
    where: { OR: [{ role: { in: [...STAFF_ROLES] } }, { roles: { hasSome: [...STAFF_ROLES] } }] },
    select: { lineUserId: true },
  });
  const staffIds = new Set(staff.map((s) => s.lineUserId));

  // ── 原始資料：範圍內的有效日潛訂單 + 瀏覽紀錄
  const [bookings, views, sites] = await Promise.all([
    prisma.booking.findMany({
      where: { createdAt: { gte: since }, status: { notIn: [...DEAD] } },
      select: { userId: true, type: true, refId: true, participants: true, tankCount: true, totalAmount: true, createdAt: true },
    }),
    prisma.pageView.groupBy({
      by: ["userId", "refType", "refId"],
      where: { viewedAt: { gte: since } },
      _count: { _all: true },
      _max: { viewedAt: true },
    }),
    prisma.diveSite.findMany({ select: { id: true, name: true } }),
  ]);
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  const custBookings = bookings.filter((b) => !staffIds.has(b.userId));
  const custViews = views.filter((v) => !staffIds.has(v.userId));

  // ── 撈出所有會用到的場次（訂單的 + 被瀏覽的）
  const tripIds = Array.from(new Set([
    ...custBookings.filter((b) => b.type === "daily").map((b) => b.refId),
    ...custViews.filter((v) => v.refType === "trip").map((v) => v.refId),
  ]));
  const tourIds = Array.from(new Set([
    ...custBookings.filter((b) => b.type === "tour").map((b) => b.refId),
    ...custViews.filter((v) => v.refType === "tour").map((v) => v.refId),
  ]));
  const [trips, tours] = await Promise.all([
    tripIds.length ? prisma.divingTrip.findMany({
      where: { id: { in: tripIds } },
      select: { id: true, date: true, startTime: true, isNightDive: true, isBoat: true, diveSiteIds: true, status: true, capacity: true },
    }) : Promise.resolve([]),
    tourIds.length ? prisma.tourPackage.findMany({
      where: { id: { in: tourIds } },
      select: { id: true, title: true, dateStart: true, dateEnd: true, status: true },
    }) : Promise.resolve([]),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));

  const fmtDate = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}(${WEEKDAY[d.getUTCDay()]})`;
  const tripLabel = (id: string) => {
    const t = tripMap.get(id);
    if (!t) return "（場次已刪除）";
    const names = t.diveSiteIds.map((s) => siteName.get(s) ?? s).join("、") || "未指定潛點";
    return `${fmtDate(t.date)} ${t.startTime} ${names}${t.isNightDive ? " 夜潛" : ""}${t.isBoat ? " 船潛" : ""}`;
  };
  const refLabel = (refType: string, id: string) =>
    refType === "tour" ? (tourMap.get(id)?.title ?? "（潛旅已刪除）") : tripLabel(id);

  // ── 1+2. 猶豫清單（看過但沒下單，且行程還沒出發）
  const booked = new Set(custBookings.map((b) => `${b.userId}|${b.refId}`));
  const stillOpen = (refType: string, id: string) => {
    if (refType === "tour") {
      const t = tourMap.get(id);
      return !!t && t.dateEnd >= today;
    }
    const t = tripMap.get(id);
    return !!t && t.date >= today && t.status !== "cancelled";
  };
  const hesitatingRaw = custViews
    .filter((v) => !booked.has(`${v.userId}|${v.refId}`) && stillOpen(v.refType, v.refId))
    .sort((a, b) => (b._max.viewedAt?.getTime() ?? 0) - (a._max.viewedAt?.getTime() ?? 0));

  // 熱門待轉單：同一場次被幾個不同客戶看過卻沒人下單
  const hotAgg = new Map<string, { refType: string; refId: string; watchers: number; views: number }>();
  for (const v of hesitatingRaw) {
    const k = `${v.refType}|${v.refId}`;
    const cur = hotAgg.get(k) ?? { refType: v.refType, refId: v.refId, watchers: 0, views: 0 };
    cur.watchers += 1;
    cur.views += v._count._all;
    hotAgg.set(k, cur);
  }
  const bookedPerRef = new Map<string, number>();
  for (const b of custBookings) bookedPerRef.set(b.refId, (bookedPerRef.get(b.refId) ?? 0) + 1);

  // ── 3. 潛點排行（以人次計：participants）
  const siteAgg = new Map<string, { people: number; orders: number }>();
  const slotAgg = new Map<string, { people: number; orders: number; night: boolean }>();
  const dowAgg = new Map<number, number>();
  let tankSum = 0, tankPeople = 0;
  for (const b of custBookings) {
    if (b.type !== "daily") continue;
    const t = tripMap.get(b.refId);
    if (!t) continue;
    const ppl = b.participants || 1;
    for (const sid of t.diveSiteIds) {
      const cur = siteAgg.get(sid) ?? { people: 0, orders: 0 };
      cur.people += ppl; cur.orders += 1;
      siteAgg.set(sid, cur);
    }
    const slotKey = `${t.startTime}${t.isNightDive ? "｜夜潛" : ""}`;
    const s = slotAgg.get(slotKey) ?? { people: 0, orders: 0, night: t.isNightDive };
    s.people += ppl; s.orders += 1;
    slotAgg.set(slotKey, s);
    dowAgg.set(t.date.getUTCDay(), (dowAgg.get(t.date.getUTCDay()) ?? 0) + ppl);
    if (b.tankCount) { tankSum += b.tankCount * ppl; tankPeople += ppl; }
  }

  // ── 5. 沉睡客戶：曾經下過單，但最後一單已超過 sleepDays
  const sleepBefore = new Date(Date.now() - sleepDays * 86400_000);
  const lastOrders = await prisma.booking.groupBy({
    by: ["userId"],
    where: { status: { notIn: [...DEAD] } },
    _max: { createdAt: true },
    _count: { _all: true },
  });
  const sleepingIds = lastOrders
    .filter((g) => !staffIds.has(g.userId) && g._max.createdAt !== null && g._max.createdAt < sleepBefore)
    .sort((a, b) => (b._max.createdAt?.getTime() ?? 0) - (a._max.createdAt?.getTime() ?? 0))
    .slice(0, 30);

  // ── 6. 常客偏好卡：範圍內下單人次最多的客戶
  const perUser = new Map<string, { orders: number; people: number; amount: number; sites: Map<string, number>; slots: Map<string, number>; tanks: number[] }>();
  for (const b of custBookings) {
    const u = perUser.get(b.userId) ?? { orders: 0, people: 0, amount: 0, sites: new Map<string, number>(), slots: new Map<string, number>(), tanks: [] as number[] };
    u.orders += 1;
    u.people += b.participants || 1;
    u.amount += b.totalAmount || 0;
    const t = b.type === "daily" ? tripMap.get(b.refId) : undefined;
    if (t) {
      for (const sid of t.diveSiteIds) u.sites.set(sid, (u.sites.get(sid) ?? 0) + 1);
      const k = `${t.startTime}${t.isNightDive ? "｜夜潛" : ""}`;
      u.slots.set(k, (u.slots.get(k) ?? 0) + 1);
      if (b.tankCount) u.tanks.push(b.tankCount);
    }
    perUser.set(b.userId, u);
  }
  const topUserIds = Array.from(perUser.entries())
    .sort((a, b) => b[1].orders - a[1].orders || b[1].amount - a[1].amount)
    .slice(0, 12)
    .map(([id]) => id);

  // ── 一次撈齊所有要顯示名字的客戶
  const needIds = Array.from(new Set([
    ...hesitatingRaw.slice(0, 60).map((v) => v.userId),
    ...sleepingIds.map((g) => g.userId),
    ...topUserIds,
  ]));
  const users = needIds.length
    ? await prisma.user.findMany({
        where: { lineUserId: { in: needIds } },
        select: { lineUserId: true, displayName: true, realName: true, nickname: true, phone: true },
      })
    : [];
  const uMap = new Map(users.map((u) => [u.lineUserId, u]));
  const top1 = (m: Map<string, number>) => {
    let best: [string, number] | null = null;
    for (const e of m) if (!best || e[1] > best[1]) best = e;
    return best;
  };

  return NextResponse.json({
    days,
    sleepDays,
    // v1060：讓前端說得出「為什麼是 30 天」
    season: { peak: season.peak, start: season.start, end: season.end, manual: !!sp.get("sleep") },
    summary: {
      orders: custBookings.length,
      people: custBookings.reduce((s, b) => s + (b.participants || 1), 0),
      watchers: hesitatingRaw.length,
      sleeping: sleepingIds.length,
      avgTank: tankPeople > 0 ? Math.round((tankSum / tankPeople) * 10) / 10 : null,
      excludedStaff: staffIds.size,
    },
    hesitating: hesitatingRaw.slice(0, 40).map((v) => ({
      userId: v.userId,
      name: nameOf(uMap.get(v.userId)),
      phone: uMap.get(v.userId)?.phone ?? null,
      refType: v.refType,
      refId: v.refId,
      label: refLabel(v.refType, v.refId),
      views: v._count._all,
      lastViewedAt: v._max.viewedAt,
    })),
    hotRefs: Array.from(hotAgg.values())
      .filter((r) => r.watchers >= 2)
      .sort((a, b) => b.watchers - a.watchers || b.views - a.views)
      .slice(0, 10)
      .map((r) => ({
        refType: r.refType,
        refId: r.refId,
        label: refLabel(r.refType, r.refId),
        watchers: r.watchers,
        views: r.views,
        orders: bookedPerRef.get(r.refId) ?? 0,
      })),
    siteRank: Array.from(siteAgg.entries())
      .map(([id, v]) => ({ id, name: siteName.get(id) ?? id, ...v }))
      .sort((a, b) => b.people - a.people)
      .slice(0, 12),
    slotRank: Array.from(slotAgg.entries())
      .map(([k, v]) => ({ slot: k, ...v }))
      .sort((a, b) => b.people - a.people),
    dowRank: WEEKDAY.map((w, i) => ({ dow: `週${w}`, people: dowAgg.get(i) ?? 0 })),
    sleeping: sleepingIds.map((g) => ({
      userId: g.userId,
      name: nameOf(uMap.get(g.userId)),
      phone: uMap.get(g.userId)?.phone ?? null,
      lastOrderAt: g._max.createdAt,
      totalOrders: g._count._all,
      quietDays: g._max.createdAt ? Math.floor((Date.now() - g._max.createdAt.getTime()) / 86400_000) : null,
    })),
    topCustomers: topUserIds.map((id) => {
      const u = perUser.get(id)!;
      const site = top1(u.sites);
      const slot = top1(u.slots);
      return {
        userId: id,
        name: nameOf(uMap.get(id)),
        orders: u.orders,
        people: u.people,
        amount: u.amount,
        favSite: site ? (siteName.get(site[0]) ?? site[0]) : null,
        favSiteCount: site?.[1] ?? 0,
        favSlot: slot?.[0] ?? null,
        favSlotCount: slot?.[1] ?? 0,
        avgTank: u.tanks.length ? Math.round((u.tanks.reduce((a, b) => a + b, 0) / u.tanks.length) * 10) / 10 : null,
      };
    }),
  });
}
