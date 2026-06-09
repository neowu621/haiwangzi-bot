import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/m/trips
//
// 手機簡版後台「今明場次」專用輕量端點。
// 只回今天 / 明天的日潛場次，每場僅必要欄位：
//   { id, date, startTime, sites:[名稱], people, coachName, participants:[姓名] }
// participants 只給「展開看名單」用 → 只回姓名字串陣列（不回電話 / 證照 / 金額）。
// 台北時區算今明（比照 stats/lite）。完整編輯請走 /admin/trips。
type MTrip = {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "08:00"
  sites: string[];
  people: number;
  coachName: string | null;
  participants: string[]; // 姓名清單
};

const NOT_CANCELLED = ["cancelled_by_user", "cancelled_by_weather", "no_show"] as const;

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  try {
    // 台北時區算今明（避免 UTC 偏移把場次算錯天），比照 stats/lite
    const tw = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    const now = new Date();
    const todayStr = tw(now);
    const tmr = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    const tomorrowStr = tw(tmr);
    // DivingTrip.date 是 @db.Date（無時區），用 UTC 午夜邊界查最穩
    const todayDate = new Date(todayStr + "T00:00:00.000Z");
    const dayAfterDate = new Date(todayDate);
    dayAfterDate.setUTCDate(dayAfterDate.getUTCDate() + 2);

    // 今明兩天場次（只取必要欄位）
    const trips = await prisma.divingTrip.findMany({
      where: { date: { gte: todayDate, lt: dayAfterDate }, status: { not: "cancelled" } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: { id: true, date: true, startTime: true, diveSiteIds: true, coachIds: true },
    });

    if (trips.length === 0) {
      return NextResponse.json({ today: todayStr, tomorrow: tomorrowStr, trips: [] as MTrip[] });
    }

    const tripIds = trips.map((t) => t.id);

    // 該批場次的有效訂單（排除取消/未到場），只取 participants 數 + 名單欄位
    const bookings = await prisma.booking.findMany({
      where: { type: "daily", refId: { in: tripIds }, status: { notIn: [...NOT_CANCELLED] } },
      select: {
        refId: true,
        participants: true,
        participantDetails: true,
        user: { select: { realName: true, displayName: true } },
      },
    });

    // dive site 名稱（找不到就用 id 本身，多半即中文名）
    const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
    const sites = siteIds.length === 0
      ? []
      : await prisma.diveSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } });
    const siteMap = new Map(sites.map((s) => [s.id, s.name]));

    // 教練名稱（coachIds → User.realName/displayName）
    const coachIds = Array.from(new Set(trips.flatMap((t) => t.coachIds)));
    const coaches = coachIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { lineUserId: { in: coachIds } },
          select: { lineUserId: true, realName: true, displayName: true },
        });
    const coachMap = new Map(coaches.map((c) => [c.lineUserId, c.realName ?? c.displayName]));

    // booking 依場次分組
    const byTrip = new Map<string, typeof bookings>();
    for (const b of bookings) {
      const arr = byTrip.get(b.refId) ?? [];
      arr.push(b);
      byTrip.set(b.refId, arr);
    }

    const result: MTrip[] = trips.map((t) => {
      const bs = byTrip.get(t.id) ?? [];
      let people = 0;
      const participants: string[] = [];
      for (const b of bs) {
        people += b.participants ?? 0;
        // participantDetails: [{ name, ... }]；缺名單就退回訂購者本人姓名
        const details = Array.isArray(b.participantDetails) ? b.participantDetails : [];
        const names = details
          .map((d) => (d && typeof d === "object" ? (d as { name?: unknown }).name : null))
          .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
        if (names.length > 0) {
          participants.push(...names);
        } else {
          participants.push(b.user.realName ?? b.user.displayName);
        }
      }
      return {
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        startTime: t.startTime,
        sites: t.diveSiteIds.map((id) => siteMap.get(id) ?? id),
        people,
        coachName: t.coachIds.map((id) => coachMap.get(id)).filter(Boolean).join("、") || null,
        participants,
      };
    });

    return NextResponse.json({ today: todayStr, tomorrow: tomorrowStr, trips: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/m/trips] error:", msg, e);
    return NextResponse.json({ error: `場次載入失敗：${msg}` }, { status: 500 });
  }
}
