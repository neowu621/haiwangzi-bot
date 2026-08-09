// v334: admin 查詢前台客戶活動紀錄
// Query params:
//   action?     — 完整 action 或 prefix（e.g. customer.booking）
//   userId?     — 過濾單一客戶
//   from?, to?  — ISO date 範圍
//   page?, limit? — 分頁（預設 1, 50）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { parseDevice } from "@/lib/ua"; // v1049：裝置欄

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");           // 完整或 prefix
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  // v1036：預設排除管理人員（老闆/管理者/IT/教練/助教）——他們本來就一直登入，會蓋掉真實客戶行為。
  //   ?includeStaff=1 可把他們加回來；指定 userId 查單一客戶時不套用排除。
  const userIdParam = url.searchParams.get("userId");
  const includeStaff = url.searchParams.get("includeStaff") === "1" || !!userIdParam;
  const staff = includeStaff ? [] : await prisma.user.findMany({
    where: { OR: [{ role: { in: ["boss", "admin", "it", "coach", "assistant"] } }, { roles: { hasSome: ["boss", "admin", "it", "coach", "assistant"] } }] },
    select: { lineUserId: true },
  });
  const staffIds = staff.map((s) => s.lineUserId);

  const where: Record<string, unknown> = {
    actorRole: "customer",
    ...(staffIds.length > 0 ? { actorId: { notIn: staffIds } } : {}),
  };
  if (action) {
    if (action.endsWith(".*")) {
      where.action = { startsWith: action.slice(0, -2) };
    } else if (action === "all") {
      // 不加 filter
    } else {
      where.action = action;
    }
  }
  if (userId) where.actorId = userId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    where.createdAt = range;
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      // v1040：?order=asc 讓「時間」欄位可以反向排（跨頁正確；客戶/動作的排序在前端做，只作用於當頁）
      orderBy: { createdAt: url.searchParams.get("order") === "asc" ? "asc" : "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Optional: 帶上 user 資料（給前端顯示用）— 對列表中的 actorId 做 batch lookup
  const userIds = Array.from(new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x)));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { lineUserId: { in: userIds } },
        // v1048：haiwangziLogCount = 海王子累積潛數（＝氣瓶支數），活躍度欄要顯示
        select: { lineUserId: true, displayName: true, realName: true, nickname: true, phone: true, createdAt: true, haiwangziLogCount: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.lineUserId, u]));

  // v1048：每位客戶的成立訂單筆數（排除取消類，與其他頁面的「成立」口徑一致）
  const orderGroups = userIds.length > 0
    ? await prisma.booking.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"] },
        },
        _count: { _all: true },
      })
    : [];
  const orderMap = new Map(orderGroups.map((g) => [g.userId, g._count._all]));

  // v1037：每位客戶的「累積登入次數 / 近 2 週登入次數 / 是否為一週內新客」
  //   登入事件本身已做節流(同人短時間只記一次)，所以次數≈實際造訪次數。
  const since14 = new Date(Date.now() - 14 * 86400000);
  const since7 = new Date(Date.now() - 7 * 86400000);
  const [loginAll, login14] = userIds.length > 0
    ? await Promise.all([
        prisma.auditLog.groupBy({
          by: ["actorId"],
          where: { actorRole: "customer", action: "customer.login", actorId: { in: userIds } },
          _count: { _all: true },
        }),
        prisma.auditLog.groupBy({
          by: ["actorId"],
          where: { actorRole: "customer", action: "customer.login", actorId: { in: userIds }, createdAt: { gte: since14 } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const allMap = new Map(loginAll.map((g) => [g.actorId, g._count._all]));
  const m14 = new Map(login14.map((g) => [g.actorId, g._count._all]));

  // v1036：摘要統計（依目前時間範圍與是否含管理人員）——讓這頁一眼看出「有多少人在動」
  const sumWhere = { ...where };
  delete (sumWhere as { action?: unknown }).action; // 摘要不受動作篩選影響
  const newSince = new Date(Date.now() - 7 * 86400000);
  // v1040：摘要卡改成 groupBy —— 除了數字，還能點開看「到底是哪些人」
  const [activeGroups, loginGroups, bookingGroups, newUsers, uaGroups] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["actorId"], where: sumWhere, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: { ...sumWhere, action: "customer.login" }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: { ...sumWhere, action: "customer.booking.create" }, _count: { _all: true } }),
    // v1037：一週內註冊的新客戶（排除管理人員）
    prisma.user.findMany({
      where: {
        createdAt: { gte: newSince },
        deletedAt: null,
        ...(staffIds.length > 0 ? { lineUserId: { notIn: staffIds } } : {}),
      },
      select: { lineUserId: true, displayName: true, realName: true, nickname: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // v1049：裝置分布。groupBy 到「UA 字串 × 客戶」——不同 UA 字串數量有限，回來再解析成四類。
    prisma.auditLog.groupBy({
      by: ["actorUserAgent", "actorId"],
      where: sumWhere,
      _count: { _all: true },
    }),
  ]);

  // v1049：把 UA 收斂成 iPhone / iPad / Android / 電腦，並算出「有多少比例是從 LINE 內建瀏覽器進來」
  type DevKey = "ios" | "ipad" | "android" | "desktop" | "unknown";
  const devEvents: Record<DevKey, number> = { ios: 0, ipad: 0, android: 0, desktop: 0, unknown: 0 };
  const devUsers: Record<DevKey, Map<string, number>> = {
    ios: new Map(), ipad: new Map(), android: new Map(), desktop: new Map(), unknown: new Map(),
  };
  let inLineEvents = 0;
  let deviceTotal = 0;
  for (const g of uaGroups) {
    const d = parseDevice(g.actorUserAgent);
    const n = g._count._all;
    devEvents[d.kind] += n;
    deviceTotal += n;
    if (d.inLine) inLineEvents += n;
    if (g.actorId) devUsers[d.kind].set(g.actorId, (devUsers[d.kind].get(g.actorId) ?? 0) + n);
  }

  // 摘要名單要顯示的人，可能不在本頁 rows 裡 → 補撈名字
  const sumIds = Array.from(new Set([
    ...[...activeGroups, ...loginGroups, ...bookingGroups].map((g) => g.actorId).filter((x): x is string => !!x),
    ...Object.values(devUsers).flatMap((m) => Array.from(m.keys())), // v1049：裝置卡也能點開看是誰
  ])).filter((id) => !userMap.has(id));
  const sumUsers = sumIds.length > 0
    ? await prisma.user.findMany({
        where: { lineUserId: { in: sumIds } },
        select: { lineUserId: true, displayName: true, realName: true, nickname: true },
      })
    : [];
  const nameOf = (id: string | null) => {
    if (!id) return "（未知）";
    const u = userMap.get(id) ?? sumUsers.find((s) => s.lineUserId === id);
    if (!u) return id.slice(0, 12) + "…";
    return `${(u.nickname ?? "").trim() || "?"}（${u.realName ?? u.displayName}）`;
  };
  // v1049：某個裝置類別底下有哪些人（次數多的排前面）
  const devPeople = (k: DevKey) =>
    Array.from(devUsers[k].entries())
      .map(([userId, count]) => ({ userId, name: nameOf(userId), count }))
      .sort((a, b) => b.count - a.count);
  const toPeople = (groups: { actorId: string | null; _count: { _all: number } }[]) =>
    groups
      .filter((g) => !!g.actorId)
      .map((g) => ({ userId: g.actorId as string, name: nameOf(g.actorId), count: g._count._all }))
      .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    total,
    page,
    limit,
    summary: {
      activeUsers: activeGroups.filter((a) => a.actorId).length,
      loginCount: loginGroups.reduce((s, g) => s + g._count._all, 0),
      bookingCount: bookingGroups.reduce((s, g) => s + g._count._all, 0),
      newMembers: newUsers.length, // v1037：一週內新註冊

      excludedStaff: !includeStaff && staffIds.length > 0 ? staffIds.length : 0,
      // v1049：裝置分布（iPad 併入 iPhone 這一欄的「iOS」計算，但名單分開留著）
      devices: {
        total: deviceTotal,
        inLineEvents,
        inLinePct: deviceTotal > 0 ? Math.round((inLineEvents / deviceTotal) * 100) : 0,
        items: (["ios", "ipad", "android", "desktop", "unknown"] as const).map((k) => ({
          kind: k,
          label: k === "ios" ? "iPhone" : k === "ipad" ? "iPad" : k === "android" ? "Android" : k === "desktop" ? "電腦" : "未知",
          events: devEvents[k],
          users: devUsers[k].size,
          pct: deviceTotal > 0 ? Math.round((devEvents[k] / deviceTotal) * 100) : 0,
        })).filter((d) => d.events > 0),
      },
      // v1040：點卡片展開的名單
      people: {
        active: toPeople(activeGroups),
        login: toPeople(loginGroups),
        booking: toPeople(bookingGroups),
        // v1049：各裝置的使用者名單
        devIos: devPeople("ios"),
        devIpad: devPeople("ipad"),
        devAndroid: devPeople("android"),
        devDesktop: devPeople("desktop"),
        newMembers: newUsers.map((u) => ({
          userId: u.lineUserId,
          name: `${(u.nickname ?? "").trim() || "?"}（${u.realName ?? u.displayName}）`,
          count: 0,
          createdAt: u.createdAt,
        })),
      },
    },
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actorId: r.actorId,
      actorName: r.actorName,
      user: r.actorId ? userMap.get(r.actorId) ?? null : null,
      // v1037：客戶登入概況（顯示在客戶名字旁）
      loginTotal: r.actorId ? (allMap.get(r.actorId) ?? 0) : 0,
      login14d: r.actorId ? (m14.get(r.actorId) ?? 0) : 0,
      isNewMember: r.actorId ? (userMap.get(r.actorId)?.createdAt ?? null) !== null && (userMap.get(r.actorId)!.createdAt >= since7) : false,
      // v1048：活躍度欄的另外兩個數字
      orderTotal: r.actorId ? (orderMap.get(r.actorId) ?? 0) : 0,
      tankTotal: r.actorId ? (userMap.get(r.actorId)?.haiwangziLogCount ?? 0) : 0,
      actorIp: r.actorIp,
      actorUserAgent: r.actorUserAgent,
      device: parseDevice(r.actorUserAgent), // v1049：在後端解析，前端只拿結果
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      metadata: r.metadata,
    })),
  });
}
