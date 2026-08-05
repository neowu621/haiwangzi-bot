import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { genTripCode } from "@/lib/code-gen";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1022：手機「快速新增場次」—— 複製既有場次(範本)的完整設定，套到多個日期一次建立。
//   潛點/時間/支數/岸船夜/價格/人數上限/教練/集合地點+地圖/參考影片/活動提醒 全部沿用。
//   同日期同時段已有場次 → 跳過（回報 skipped），避免重複開。
const Body = z.object({
  sourceTripId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(14), // 一次最多 14 天
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss", "it"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "參數錯誤（日期最多 14 天）" }, { status: 400 });
  }
  const { sourceTripId, dates } = parsed.data;

  const src = await prisma.divingTrip.findUnique({ where: { id: sourceTripId } });
  if (!src) return NextResponse.json({ error: "找不到範本場次" }, { status: 404 });

  const uniqueDates = Array.from(new Set(dates)).sort();
  const created: string[] = [];
  const skipped: string[] = [];

  for (const d of uniqueDates) {
    const date = new Date(`${d}T00:00:00.000Z`);
    // 同日期同開始時間已存在(未取消) → 跳過
    const dup = await prisma.divingTrip.findFirst({
      where: { date, startTime: src.startTime, status: { not: "cancelled" } },
      select: { id: true },
    });
    if (dup) { skipped.push(d); continue; }
    await prisma.divingTrip.create({
      data: {
        code: await genTripCode(),
        date,
        startTime: src.startTime,
        isNightDive: src.isNightDive,
        isScooter: src.isScooter,
        isBoat: src.isBoat,
        diveSiteIds: src.diveSiteIds,
        tankCount: src.tankCount,
        capacity: src.capacity,
        coachIds: src.coachIds,
        pricing: src.pricing ?? {},
        status: "open", // 建立即開放預約
        notes: src.notes,
        activityNote: src.activityNote,
        meetingPoint: src.meetingPoint,
        meetingPointUrl: src.meetingPointUrl,
        referenceVideoUrl: src.referenceVideoUrl,
        images: src.images,
      },
    });
    created.push(d);
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "trip.quick_add",
    targetType: "trip",
    targetId: sourceTripId,
    metadata: { created, skipped, startTime: src.startTime },
  }).catch(() => {});

  return NextResponse.json({ ok: true, created, skipped });
}
