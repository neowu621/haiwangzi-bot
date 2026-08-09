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
// v1017：participants 改帶「暱稱（姓名）+ 訂單內容」，點名字可看該筆訂單
type MParticipant = {
  name: string;
  nickname: string | null;
  bookingId: string;
  bookingCode: string | null;
  ordererName: string; // 訂購人（本人）
  ordererNick: string | null;
  phone: string | null;
  people: number; // 該訂單人數
  tankCount: number | null; // 每人幾支
  notes: string | null; // 訂單備註（含裝備尺寸/配重/付款說明）
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string | null; // v1019：客戶選的付款方式
  status: string;
};
type MTrip = {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // "08:00"
  sites: string[];
  people: number;
  coachName: string | null;
  participants: MParticipant[];
  // v1023：手機端編輯用
  capacity: number | null;
  coachIds: string[];
  status: string;
  notes: string | null;
  tankCount: number;
  isNightDive: boolean; // v1043
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

    // v1002：改列「今天起所有」日潛場次（原本只今明兩天）
    const trips = await prisma.divingTrip.findMany({
      where: { date: { gte: todayDate }, status: { not: "cancelled" } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: {
        id: true, date: true, startTime: true, diveSiteIds: true, coachIds: true,
        capacity: true, status: true, notes: true, tankCount: true, // v1023：手機端編輯用
        isNightDive: true, // v1043：夜潛在列表整列上底色區隔
      },
    });

    if (trips.length === 0) {
      return NextResponse.json({ today: todayStr, tomorrow: tomorrowStr, trips: [] as MTrip[] });
    }

    const tripIds = trips.map((t) => t.id);

    // 該批場次的有效訂單（排除取消/未到場），只取 participants 數 + 名單欄位
    const bookings = await prisma.booking.findMany({
      where: { type: "daily", refId: { in: tripIds }, status: { notIn: [...NOT_CANCELLED] } },
      select: {
        id: true,
        code: true,
        refId: true,
        participants: true,
        participantDetails: true,
        tankCount: true,
        notes: true,
        totalAmount: true,
        paidAmount: true,
        paymentStatus: true,
        paymentMethod: true,
        status: true,
        user: { select: { realName: true, displayName: true, nickname: true, phone: true } },
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
      const participants: MParticipant[] = [];
      for (const b of bs) {
        people += b.participants ?? 0;
        const ordererName = b.user.realName ?? b.user.displayName;
        const base = {
          bookingId: b.id,
          bookingCode: b.code ?? null,
          ordererName,
          ordererNick: b.user.nickname ?? null,
          phone: b.user.phone ?? null,
          people: b.participants ?? 0,
          tankCount: b.tankCount ?? null,
          notes: b.notes ?? null,
          totalAmount: b.totalAmount ?? 0,
          paidAmount: b.paidAmount ?? 0,
          paymentStatus: b.paymentStatus ?? "",
          paymentMethod: b.paymentMethod ?? null, // v1019
          status: b.status ?? "",
        };
        // participantDetails: [{ name, nickname, isSelf... }]；缺名單就退回訂購者本人
        const details = Array.isArray(b.participantDetails) ? b.participantDetails : [];
        const rows = (details as unknown[])
          .map((raw) => {
            const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
            return {
              name: typeof d.name === "string" ? d.name.trim() : "",
              // 本人的暱稱以會員資料為準；潛伴用訂單當下填的
              nickname: d.isSelf === true
                ? (b.user.nickname ?? (typeof d.nickname === "string" ? d.nickname : null))
                : (typeof d.nickname === "string" ? d.nickname : null),
            };
          })
          .filter((r) => r.name.length > 0);
        if (rows.length > 0) {
          participants.push(...rows.map((r) => ({ ...base, name: r.name, nickname: r.nickname })));
        } else {
          participants.push({ ...base, name: ordererName, nickname: b.user.nickname ?? null });
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
        // v1023：手機端編輯用
        capacity: t.capacity,
        coachIds: t.coachIds,
        status: t.status,
        notes: t.notes,
        tankCount: t.tankCount,
        isNightDive: t.isNightDive, // v1043
      };
    });

    return NextResponse.json({ today: todayStr, tomorrow: tomorrowStr, trips: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/m/trips] error:", msg, e);
    return NextResponse.json({ error: `場次載入失敗：${msg}` }, { status: 500 });
  }
}
