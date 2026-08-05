import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1022：手機「快速新增場次」的範本清單。
//   近 60 天用過的「潛點＋時間＋支數＋岸/船/夜」組合去重，依使用次數排序，只回前 10 筆（<1KB）。
//   刻意輕量：不回完整場次清單（避免像 Dump 頁要等）。
type Template = {
  key: string;
  sourceTripId: string; // 建立時複製這一筆的完整設定
  startTime: string;
  siteNames: string[];
  tankCount: number;
  capacity: number | null;
  isNightDive: boolean;
  isBoat: boolean;
  isScooter: boolean;
  usedCount: number;
  lastUsed: string; // YYYY-MM-DD
};

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  // 與其他管理功能一致：老闆/管理者/IT
  const role = requireRole(auth.user, ["admin", "boss", "it"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  try {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    since.setHours(0, 0, 0, 0);

    const trips = await prisma.divingTrip.findMany({
      where: { date: { gte: since }, status: { not: "cancelled" } },
      orderBy: { date: "desc" },
      select: {
        id: true, date: true, startTime: true, diveSiteIds: true, tankCount: true,
        capacity: true, isNightDive: true, isBoat: true, isScooter: true,
      },
    });

    // 站名對照（找不到就用 id 本身，多半即中文名）
    const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
    const sites = siteIds.length === 0 ? [] : await prisma.diveSite.findMany({
      where: { id: { in: siteIds } }, select: { id: true, name: true },
    });
    const siteMap = new Map(sites.map((s) => [s.id, s.name]));

    // 去重：同「時間+潛點組合+支數+類型」視為同一個範本；保留最新那筆當來源
    const map = new Map<string, Template>();
    for (const t of trips) {
      const key = [
        t.startTime, t.diveSiteIds.join(","), t.tankCount,
        t.isNightDive ? "N" : "", t.isBoat ? "B" : "", t.isScooter ? "S" : "",
      ].join("|");
      const existing = map.get(key);
      if (existing) {
        existing.usedCount += 1;
        continue;
      }
      map.set(key, {
        key,
        sourceTripId: t.id, // trips 依日期新→舊，第一次遇到的即最新
        startTime: t.startTime,
        siteNames: t.diveSiteIds.map((id) => siteMap.get(id) ?? id),
        tankCount: t.tankCount,
        capacity: t.capacity,
        isNightDive: t.isNightDive,
        isBoat: t.isBoat,
        isScooter: t.isScooter,
        usedCount: 1,
        lastUsed: t.date.toISOString().slice(0, 10),
      });
    }

    const templates = Array.from(map.values())
      .sort((a, b) => (b.usedCount - a.usedCount) || (a.lastUsed < b.lastUsed ? 1 : -1))
      .slice(0, 10);

    // 已排場次的日期（未來 60 天）→ 前端月曆標紅點，避免重複開
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    const futureEnd = new Date(future);
    futureEnd.setDate(futureEnd.getDate() + 60);
    const booked = await prisma.divingTrip.findMany({
      where: { date: { gte: future, lt: futureEnd }, status: { not: "cancelled" } },
      select: { date: true },
    });
    const bookedDates = Array.from(new Set(booked.map((b) => b.date.toISOString().slice(0, 10))));

    return NextResponse.json({ templates, bookedDates });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/m/trip-templates]", msg, e);
    return NextResponse.json({ error: `範本載入失敗：${msg}` }, { status: 500 });
  }
}
