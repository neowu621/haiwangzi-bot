import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/media?limit=20&cursor=<id>  公開 feed
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") ?? 20));
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const items = await prisma.tripMedia.findMany({
    take: limit + 1,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = items.length > limit;
  const list = hasMore ? items.slice(0, limit) : items;

  // 同時把 trip + site 資訊一起 join (簡單版)
  const tripIds = Array.from(
    new Set(list.map((m) => m.tripId).filter(Boolean) as string[]),
  );
  const trips = await prisma.divingTrip.findMany({
    where: { id: { in: tripIds } },
    select: { id: true, date: true, startTime: true, diveSiteIds: true },
  });
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = await prisma.diveSite.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, name: true },
  });
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  return NextResponse.json({
    items: list.map((m) => {
      const trip = m.tripId ? tripMap.get(m.tripId) : null;
      const siteName = trip
        ? trip.diveSiteIds.map((id) => siteMap.get(id) ?? "—").join(" · ")
        : null;
      return {
        id: m.id,
        date: m.date.toISOString().slice(0, 10),
        platform: m.platform,
        url: m.url,
        caption: m.caption,
        thumbnail: m.thumbnailKey ? publicUrl(m.thumbnailKey) : null,
        site: siteName,
        startTime: trip?.startTime ?? null,
        createdAt: m.createdAt,
      };
    }),
    nextCursor: hasMore ? list[list.length - 1].id : null,
  });
}
