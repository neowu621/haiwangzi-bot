import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/stats
//
// 主控台顯示用，重點是 "operational" 數字：
//   - trips:   bookable = open 且 date >= today（未來可預約的場次）
//   - tours:   bookable = open 且 dateStart >= today
//   - bookings: active = 還沒執行完的訂單（status in pending/confirmed/deposit_paid，且對應 event 未過）
// 同時保留 total（含過去取消的）方便追蹤。
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    users,
    customers,
    coaches,
    admins,
    todayNewUsers,
    last7DaysNewUsers,
    trips,
    openTrips,
    bookableTrips,
    tours,
    openTours,
    bookableTours,
    bookings,
    todayNewBookings,
    last7DaysNewBookings,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "customer" } }),
    prisma.user.count({ where: { role: "coach" } }),
    prisma.user.count({ where: { role: "admin" } }),
    // 今天新增會員（建立日 >= 今天 00:00）
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    // 7 天內新增會員
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.divingTrip.count(),
    prisma.divingTrip.count({ where: { status: "open" } }),
    // 可預約：open + 未來日期
    prisma.divingTrip.count({
      where: { status: "open", date: { gte: todayStart } },
    }),
    prisma.tourPackage.count(),
    prisma.tourPackage.count({ where: { status: "open" } }),
    // 可預約：open + 未來出發日
    prisma.tourPackage.count({
      where: { status: "open", dateStart: { gte: todayStart } },
    }),
    prisma.booking.count(),
    // 今天新增訂單
    prisma.booking.count({ where: { createdAt: { gte: todayStart } } }),
    // 7 天內新增訂單
    prisma.booking.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
  ]);

  // 只算「未審核 + booking 仍存在」的憑證；過濾掉孤兒紀錄（用 raw SQL 才能 INNER JOIN）
  const pendingProofsResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM payment_proofs pp
    INNER JOIN bookings b ON pp.booking_id = b.id
    WHERE pp.verified_at IS NULL
  `;
  const pendingProofs = Number(pendingProofsResult[0]?.count ?? BigInt(0));

  // v201：抓未審核憑證的細節（給 dashboard 列表用）
  const pendingProofsList = await prisma.paymentProof.findMany({
    where: { verifiedAt: null },
    orderBy: { uploadedAt: "desc" },
    take: 10,
    include: {
      booking: {
        select: {
          id: true, code: true,
          user: { select: { realName: true, displayName: true, phone: true } },
        },
      },
    },
  });
  const pendingProofsDetails = pendingProofsList.map((p) => ({
    id: p.id,
    bookingId: p.bookingId,
    bookingCode: p.booking.code,
    name: p.booking.user.realName ?? p.booking.user.displayName,
    phone: p.booking.user.phone,
    amount: p.amount,
    type: p.type,
    uploadedAt: p.uploadedAt.toISOString(),
  }));

  // 算「尚未執行」訂單：status 為 pending / confirmed（含 deposit_paid 已是 confirmed status）
  // 並且關聯的 trip.date / tour.dateStart >= today
  // 因為 booking.refId 多型（指向 trip 或 tour），分兩段查
  const activeDailyBookings = await prisma.booking.count({
    where: {
      type: "daily",
      status: { in: ["pending", "confirmed"] },
      refId: {
        in: (
          await prisma.divingTrip.findMany({
            where: { date: { gte: todayStart } },
            select: { id: true },
          })
        ).map((t) => t.id),
      },
    },
  });
  const activeTourBookings = await prisma.booking.count({
    where: {
      type: "tour",
      status: { in: ["pending", "confirmed"] },
      refId: {
        in: (
          await prisma.tourPackage.findMany({
            where: { dateStart: { gte: todayStart } },
            select: { id: true },
          })
        ).map((t) => t.id),
      },
    },
  });
  const activeBookings = activeDailyBookings + activeTourBookings;

  const revenueAgg = await prisma.booking.aggregate({
    where: { status: { in: ["confirmed", "completed"] } },
    _sum: { paidAmount: true, totalAmount: true },
  });

  // ── Dashboard 進階指標 ─────────────────────────────

  // 今日營收（今日 verified 的付款）
  const todayRevenue = await prisma.paymentProof.aggregate({
    where: { verifiedAt: { gte: todayStart } },
    _sum: { amount: true },
  });

  // 本月營收
  const monthStart = new Date(todayStart);
  monthStart.setDate(1);
  const thisMonthRevenue = await prisma.paymentProof.aggregate({
    where: { verifiedAt: { gte: monthStart } },
    _sum: { amount: true },
  });

  // 上月同期營收（用於對比）
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthSameWindow = new Date(lastMonthStart);
  lastMonthSameWindow.setDate(todayStart.getDate());
  const lastMonthRevenue = await prisma.paymentProof.aggregate({
    where: { verifiedAt: { gte: lastMonthStart, lt: lastMonthSameWindow } },
    _sum: { amount: true },
  });

  // 接下來 14 天的場次
  const fourteenDaysLater = new Date(todayStart);
  fourteenDaysLater.setDate(todayStart.getDate() + 14);
  const upcomingTrips = await prisma.divingTrip.findMany({
    where: { date: { gte: todayStart, lte: fourteenDaysLater }, status: "open" },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 30,
  });

  // 撈這些場次的訂單統計
  const upcomingTripIds = upcomingTrips.map((t) => t.id);
  const upcomingBookings = upcomingTripIds.length === 0
    ? []
    : await prisma.booking.groupBy({
        by: ["refId"],
        where: {
          refId: { in: upcomingTripIds },
          type: "daily",
          status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"] },
        },
        _sum: { participants: true },
      });
  const bookedMap = new Map(upcomingBookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  // 撈所有相關潛點名
  const allSiteIds = Array.from(new Set(upcomingTrips.flatMap((t) => t.diveSiteIds)));
  const sites = allSiteIds.length === 0 ? [] : await prisma.diveSite.findMany({
    where: { id: { in: allSiteIds } },
    select: { id: true, name: true },
  });
  const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));

  // 撈所有相關教練
  const allCoachIds = Array.from(new Set(upcomingTrips.flatMap((t) => t.coachIds)));
  const coachesList = allCoachIds.length === 0 ? [] : await prisma.coach.findMany({
    where: { id: { in: allCoachIds } },
    select: { id: true, realName: true },
  });
  const coachNameMap = new Map(coachesList.map((c) => [c.id, c.realName]));

  // 教練績效 Top 3（近 30 天 completed bookings）
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const last30Trips = await prisma.divingTrip.findMany({
    where: { date: { gte: thirtyDaysAgo, lt: todayStart } },
    select: { id: true, coachIds: true, diveSiteIds: true },
  });
  const last30TripIds = last30Trips.map((t) => t.id);
  const last30Bookings = last30TripIds.length === 0 ? [] : await prisma.booking.findMany({
    where: { type: "daily", refId: { in: last30TripIds }, status: "completed" },
    select: { refId: true, participants: true },
  });
  const coachPerf = new Map<string, { trips: number; participants: number }>();
  const sitePopularity = new Map<string, { trips: number; participants: number }>();
  for (const t of last30Trips) {
    for (const c of t.coachIds) {
      const s = coachPerf.get(c) ?? { trips: 0, participants: 0 };
      s.trips += 1;
      coachPerf.set(c, s);
    }
    for (const sid of t.diveSiteIds) {
      const s = sitePopularity.get(sid) ?? { trips: 0, participants: 0 };
      s.trips += 1;
      sitePopularity.set(sid, s);
    }
  }
  for (const b of last30Bookings) {
    const trip = last30Trips.find((t) => t.id === b.refId);
    if (!trip) continue;
    for (const c of trip.coachIds) {
      const s = coachPerf.get(c) ?? { trips: 0, participants: 0 };
      s.participants += b.participants;
      coachPerf.set(c, s);
    }
    for (const sid of trip.diveSiteIds) {
      const s = sitePopularity.get(sid) ?? { trips: 0, participants: 0 };
      s.participants += b.participants;
      sitePopularity.set(sid, s);
    }
  }
  const topCoachIds = Array.from(coachPerf.keys());
  const allTopCoaches = topCoachIds.length === 0 ? [] : await prisma.coach.findMany({
    where: { id: { in: topCoachIds } },
    select: { id: true, realName: true },
  });
  const topCoaches = Array.from(coachPerf.entries())
    .map(([id, s]) => ({
      name: allTopCoaches.find((c) => c.id === id)?.realName ?? id.slice(0, 8),
      ...s,
    }))
    .sort((a, b) => b.participants - a.participants)
    .slice(0, 3);

  const topSiteIds = Array.from(sitePopularity.keys());
  const allTopSites = topSiteIds.length === 0 ? [] : await prisma.diveSite.findMany({
    where: { id: { in: topSiteIds } },
    select: { id: true, name: true },
  });
  const topSites = Array.from(sitePopularity.entries())
    .map(([id, s]) => ({
      name: allTopSites.find((x) => x.id === id)?.name ?? id,
      ...s,
    }))
    .sort((a, b) => b.participants - a.participants)
    .slice(0, 3);

  // 近 7 天生日的會員
  const sevenDaysLater = new Date(todayStart);
  sevenDaysLater.setDate(todayStart.getDate() + 7);
  const allUsersWithBirthday = await prisma.user.findMany({
    where: { birthday: { not: null }, deletedAt: null },
    select: { lineUserId: true, realName: true, displayName: true, birthday: true, vipLevel: true },
  });
  const nearBirthdays = allUsersWithBirthday
    .map((u) => {
      if (!u.birthday) return null;
      const bDate = new Date(u.birthday);
      // 算今年同月日
      const thisYearBday = new Date(todayStart.getFullYear(), bDate.getMonth(), bDate.getDate());
      if (thisYearBday < todayStart) thisYearBday.setFullYear(todayStart.getFullYear() + 1);
      if (thisYearBday > sevenDaysLater) return null;
      return {
        name: u.realName ?? u.displayName,
        date: thisYearBday.toISOString().slice(0, 10),
        vipLevel: u.vipLevel ?? 1,
      };
    })
    .filter((x): x is { name: string; date: string; vipLevel: number } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  // 流失警告：VIP4+ 30 天沒下單
  const thirtyDaysAgoVip = new Date(todayStart);
  thirtyDaysAgoVip.setDate(thirtyDaysAgoVip.getDate() - 30);
  const recentBookingUserIds = await prisma.booking.findMany({
    where: { createdAt: { gte: thirtyDaysAgoVip } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const recentUserIdSet = new Set(recentBookingUserIds.map((b) => b.userId));
  const allHighVips = await prisma.user.findMany({
    where: { vipLevel: { gte: 4 }, deletedAt: null },
    select: { lineUserId: true, realName: true, displayName: true, vipLevel: true, lastActiveAt: true },
  });
  const churningHighVips = allHighVips
    .filter((u) => !recentUserIdSet.has(u.lineUserId))
    .map((u) => ({
      name: u.realName ?? u.displayName,
      vipLevel: u.vipLevel ?? 1,
      lastActiveAt: u.lastActiveAt,
    }))
    .slice(0, 5);

  // 過期未結算的訂單數
  const pastTripsForSettlement = await prisma.divingTrip.findMany({
    where: { date: { lt: todayStart } },
    select: { id: true },
  });
  const pendingSettlement = pastTripsForSettlement.length === 0 ? 0 : await prisma.booking.count({
    where: {
      type: "daily",
      refId: { in: pastTripsForSettlement.map((t) => t.id) },
      status: { in: ["pending", "confirmed"] },
    },
  });

  // 待退款訂單（cancelled_by_*，paymentStatus 還沒 refunded，但有 paidAmount）
  const pendingRefunds = await prisma.booking.count({
    where: {
      status: { in: ["cancelled_by_user", "cancelled_by_weather"] },
      paidAmount: { gt: 0 },
      paymentStatus: { not: "refunded" },
    },
  });

  // v197：未付清訂單（部分付款 — 已付>0 但 < 總額，且未取消）
  // Prisma 不支援欄位對欄位比較，用 raw SQL
  const partiallyPaidResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM bookings
    WHERE status IN ('pending', 'confirmed')
      AND paid_amount > 0
      AND paid_amount < total_amount
  `;
  const partiallyPaid = Number(partiallyPaidResult[0]?.count ?? BigInt(0));

  // v197：超額訂單（單筆預約使該場次/團超出容量）— overCapacity flag
  const overCapacity = await prisma.booking.count({
    where: {
      overCapacity: true,
      status: { in: ["pending", "confirmed"] },
    },
  });

  // v201：完全未付款的進行中訂單（paidAmount=0，且場次/團未過）
  // 撈未來場次/團 id 集合，再篩
  const futureTripIds = (await prisma.divingTrip.findMany({
    where: { date: { gte: todayStart }, status: { not: "cancelled" } },
    select: { id: true },
  })).map((t) => t.id);
  const futureTourIds = (await prisma.tourPackage.findMany({
    where: { dateStart: { gte: todayStart }, status: { not: "cancelled" } },
    select: { id: true },
  })).map((t) => t.id);
  const unpaidBookingsList = await prisma.booking.findMany({
    where: {
      status: { in: ["pending", "confirmed"] },
      paidAmount: 0,
      OR: [
        { type: "daily", refId: { in: futureTripIds } },
        { type: "tour", refId: { in: futureTourIds } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, code: true, type: true, refId: true,
      totalAmount: true, createdAt: true,
      user: { select: { realName: true, displayName: true, phone: true } },
    },
  });
  // 補上場次/團的時間
  const futureTrips = futureTripIds.length === 0 ? [] : await prisma.divingTrip.findMany({
    where: { id: { in: unpaidBookingsList.filter((b) => b.type === "daily").map((b) => b.refId) } },
    select: { id: true, date: true, startTime: true, diveSiteIds: true },
  });
  const futureTours = futureTourIds.length === 0 ? [] : await prisma.tourPackage.findMany({
    where: { id: { in: unpaidBookingsList.filter((b) => b.type === "tour").map((b) => b.refId) } },
    select: { id: true, title: true, dateStart: true },
  });
  const tripMap2 = new Map(futureTrips.map((t) => [t.id, t]));
  const tourMap2 = new Map(futureTours.map((t) => [t.id, t]));
  const unpaidBookings = unpaidBookingsList.map((b) => {
    const target = b.type === "daily" ? tripMap2.get(b.refId) : tourMap2.get(b.refId);
    let when = "—";
    let what = "—";
    if (target && "date" in target) {
      when = target.date.toISOString().slice(0, 10) + " " + (target.startTime ?? "");
      what = target.diveSiteIds.map((id) => siteNameMap.get(id) ?? id).join("・") || "日潛";
    } else if (target && "dateStart" in target) {
      when = target.dateStart.toISOString().slice(0, 10);
      what = target.title;
    }
    return {
      id: b.id,
      code: b.code,
      type: b.type,
      name: b.user.realName ?? b.user.displayName,
      phone: b.user.phone,
      totalAmount: b.totalAmount,
      createdAt: b.createdAt.toISOString(),
      when,
      what,
    };
  });
  const unpaidCount = unpaidBookings.length;

  // v197：今日場次 + 明日場次（含 booked + customer list）
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrow = new Date(todayStart);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

  async function tripsForDay(start: Date, end: Date) {
    const trips = await prisma.divingTrip.findMany({
      where: { date: { gte: start, lt: end }, status: { not: "cancelled" } },
      orderBy: [{ startTime: "asc" }],
    });
    if (trips.length === 0) return [];
    const tripIds = trips.map((t) => t.id);
    const bks = await prisma.booking.findMany({
      where: {
        refId: { in: tripIds },
        type: "daily",
        status: { notIn: ["cancelled_by_user", "cancelled_by_weather"] },
      },
      select: {
        refId: true, participants: true, paymentStatus: true,
        user: { select: { realName: true, displayName: true, phone: true } },
      },
    });
    const bkByTrip = new Map<string, typeof bks>();
    for (const b of bks) {
      const arr = bkByTrip.get(b.refId) ?? [];
      arr.push(b);
      bkByTrip.set(b.refId, arr);
    }
    return trips.map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      startTime: t.startTime,
      isNightDive: t.isNightDive,
      sites: t.diveSiteIds.map((id) => siteNameMap.get(id) ?? id),
      coaches: t.coachIds.map((id) => coachNameMap.get(id) ?? id.slice(0, 6)),
      booked: (bkByTrip.get(t.id) ?? []).reduce((s, b) => s + b.participants, 0),
      capacity: t.capacity,
      customers: (bkByTrip.get(t.id) ?? []).map((b) => ({
        name: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        participants: b.participants,
        paymentStatus: b.paymentStatus,
      })),
    }));
  }
  const todayTripsDetail = await tripsForDay(todayStart, tomorrowStart);
  const tomorrowTripsDetail = await tripsForDay(tomorrowStart, dayAfterTomorrow);

  // 本週活躍會員（lastActiveAt 在 7 天內）
  const activeWeekly = await prisma.user.count({
    where: { lastActiveAt: { gte: sevenDaysAgo }, deletedAt: null },
  });

  // 🔥 高意願客戶（過去 7 天看過某場次但沒下單）
  let highIntentLeads: Array<{ name: string; tripDate: string; tripSite: string; viewedAt: string; refId: string }> = [];
  try {
    const recentViews = await prisma.pageView.findMany({
      where: { viewedAt: { gte: sevenDaysAgo } },
      orderBy: { viewedAt: "desc" },
      take: 200,
    });
    // 對每筆瀏覽，看該 user 是否在這筆瀏覽之後有下單
    const tripViews = recentViews.filter((v) => v.refType === "trip");
    const tripViewIds = Array.from(new Set(tripViews.map((v) => v.refId)));
    const viewedTrips = tripViewIds.length === 0 ? [] : await prisma.divingTrip.findMany({
      where: { id: { in: tripViewIds }, date: { gte: todayStart }, status: "open" },
      select: { id: true, date: true, startTime: true, diveSiteIds: true },
    });
    const viewedTripMap = new Map(viewedTrips.map((t) => [t.id, t]));
    // 查所有對應的活躍訂單
    const viewerUserIds = Array.from(new Set(tripViews.map((v) => v.userId)));
    const bookingsByViewers = viewerUserIds.length === 0 ? [] : await prisma.booking.findMany({
      where: {
        userId: { in: viewerUserIds },
        type: "daily",
        refId: { in: tripViewIds },
        status: { in: ["pending", "confirmed", "completed"] },
      },
      select: { userId: true, refId: true },
    });
    const booked = new Set(bookingsByViewers.map((b) => `${b.userId}:${b.refId}`));

    // 去重：同 user+trip 取最新一次瀏覽
    const seen = new Set<string>();
    const filtered: typeof tripViews = [];
    for (const v of tripViews) {
      const key = `${v.userId}:${v.refId}`;
      if (seen.has(key)) continue;
      if (booked.has(key)) continue; // 已下單，跳過
      if (!viewedTripMap.has(v.refId)) continue; // 場次已過/取消，跳過
      seen.add(key);
      filtered.push(v);
    }

    // 撈這些 user 的名字 + 對應 site name
    const leadUserIds = Array.from(new Set(filtered.map((v) => v.userId)));
    const leadUsers = leadUserIds.length === 0 ? [] : await prisma.user.findMany({
      where: { lineUserId: { in: leadUserIds }, deletedAt: null },
      select: { lineUserId: true, realName: true, displayName: true },
    });
    const leadUserMap = new Map(leadUsers.map((u) => [u.lineUserId, u]));

    const leadSiteIds = Array.from(new Set(filtered.flatMap((v) => viewedTripMap.get(v.refId)?.diveSiteIds ?? [])));
    const leadSites = leadSiteIds.length === 0 ? [] : await prisma.diveSite.findMany({
      where: { id: { in: leadSiteIds } },
      select: { id: true, name: true },
    });
    const leadSiteMap = new Map(leadSites.map((s) => [s.id, s.name]));

    highIntentLeads = filtered.slice(0, 10).map((v) => {
      const t = viewedTripMap.get(v.refId)!;
      const user = leadUserMap.get(v.userId);
      return {
        name: user?.realName ?? user?.displayName ?? v.userId.slice(0, 8),
        tripDate: t.date.toISOString().slice(0, 10) + " " + t.startTime,
        tripSite: t.diveSiteIds.map((id) => leadSiteMap.get(id) ?? id).join("・"),
        viewedAt: v.viewedAt.toISOString(),
        refId: v.refId,
      };
    });
  } catch (e) {
    // page_views table 可能還沒建（首次部署）
    console.warn("[stats highIntentLeads] skipped:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({
    users: {
      total: users,
      customers,
      coaches,
      admins,
      todayNew: todayNewUsers,
      last7DaysNew: last7DaysNewUsers,
      activeWeekly,
    },
    trips: { total: trips, open: openTrips, bookable: bookableTrips },
    tours: { total: tours, open: openTours, bookable: bookableTours },
    bookings: {
      total: bookings,
      active: activeBookings,
      todayNew: todayNewBookings,
      last7DaysNew: last7DaysNewBookings,
    },
    revenue: {
      paid: revenueAgg._sum.paidAmount ?? 0,
      booked: revenueAgg._sum.totalAmount ?? 0,
      today: todayRevenue._sum.amount ?? 0,
      thisMonth: thisMonthRevenue._sum.amount ?? 0,
      lastMonthSameWindow: lastMonthRevenue._sum.amount ?? 0,
    },
    pendingProofs,
    pendingProofsDetails,
    pendingSettlement,
    pendingRefunds,
    partiallyPaid,
    overCapacity,
    unpaidCount,
    unpaidBookings,
    todayTripsDetail,
    tomorrowTripsDetail,
    // 接下來 14 天的場次（含人數/教練/潛點）
    upcomingTrips: upcomingTrips.slice(0, 14).map((t) => ({
      id: t.id,
      date: t.date.toISOString().slice(0, 10),
      startTime: t.startTime,
      isNightDive: t.isNightDive,
      sites: t.diveSiteIds.map((id) => siteNameMap.get(id) ?? id),
      coaches: t.coachIds.map((id) => coachNameMap.get(id) ?? id.slice(0, 6)),
      booked: bookedMap.get(t.id) ?? 0,
      capacity: t.capacity,
    })),
    topCoaches,
    topSites,
    nearBirthdays,
    churningHighVips,
    highIntentLeads,
  });
}
