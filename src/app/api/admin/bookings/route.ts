import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bookings - 全部訂單，含 trip/tour 的日期時間資訊
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { displayName: true, realName: true, phone: true } } },
  });

  // 撈所有相關 trip / tour，附加日期 + 時間
  const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    prisma.divingTrip.findMany({
      where: { id: { in: dailyIds } },
      select: { id: true, date: true, startTime: true, diveSiteIds: true },
    }),
    prisma.tourPackage.findMany({
      where: { id: { in: tourIds } },
      select: { id: true, title: true, dateStart: true, dateEnd: true },
    }),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));

  // 撈所有 dive sites
  const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = await prisma.diveSite.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, name: true },
  });
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  return NextResponse.json({
    bookings: bookings.map((b) => {
      let ref: Record<string, unknown> = {};
      if (b.type === "daily") {
        const t = tripMap.get(b.refId);
        if (t) {
          ref = {
            date: t.date.toISOString().slice(0, 10),
            startTime: t.startTime, // "08:00" 字串，直接顯示不要走時區轉換
            sites: t.diveSiteIds.map((id) => siteMap.get(id) ?? "—"),
          };
        }
      } else {
        const t = tourMap.get(b.refId);
        if (t) {
          ref = {
            title: t.title,
            dateStart: t.dateStart.toISOString().slice(0, 10),
            dateEnd: t.dateEnd.toISOString().slice(0, 10),
          };
        }
      }
      return { ...b, ref };
    }),
  });
}
