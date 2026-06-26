import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_LIST_CACHE_HEADERS } from "@/lib/http-cache";
import { cached, TTL_LISTING } from "@/lib/cache"; // v693：版本號快取

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/trips/:id
// 單一日潛場次詳細
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // v693：命中快取時零 DB；場次/預約寫入版本即 +1 自動失效（含空位數）
  const payload = await cached(`trip:${id}`, "trips", TTL_LISTING, async () => {
  const trip = await prisma.divingTrip.findUnique({ where: { id } });
  if (!trip) return null;

  const foundSites = await prisma.diveSite.findMany({
    where: { id: { in: trip.diveSiteIds } },
  });
  const siteMap = new Map(foundSites.map((s) => [s.id, s]));
  // v153 起：diveSiteIds 可能直接存中文名，DiveSite 表內找不到時用名稱本身
  const sites = trip.diveSiteIds.map((id) =>
    siteMap.get(id) ?? { id, name: id, region: null, description: "", difficulty: null, maxDepth: "", features: [], images: [], youtubeUrl: null, locationUrl: null, cautions: null },
  );

  // 只回前端展示需要的公開欄位；此端點帶 public 快取，
  // 絕不可外洩教練內部資料（feePerDive 成本 / lineUserId 個資 / note 備註）
  const coaches = await prisma.coach.findMany({
    where: { id: { in: trip.coachIds } },
    select: { id: true, realName: true, cert: true, specialty: true },
  });
  const booked = await prisma.booking.aggregate({
    where: { refId: id, type: "daily", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });

  return {
    ...trip,
    date: trip.date.toISOString().slice(0, 10),
    booked: booked._sum.participants ?? 0,
    // capacity null = 無上限（available 也給 null，UI 顯示「可預約」）
    available:
      trip.capacity == null
        ? null
        : Math.max(0, trip.capacity - (booked._sum.participants ?? 0)),
    sites,
    coaches,
  };
  });
  if (!payload) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(payload, { headers: PUBLIC_LIST_CACHE_HEADERS });
}
