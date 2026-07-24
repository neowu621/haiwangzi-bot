// v318：admin 列出所有願望單
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // pending / discussing / converted / cancelled / all
  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;

  const wishes = await prisma.diveWish.findMany({
    where,
    orderBy: { lastActivityAt: "desc" },
    take: 200,
    include: {
      user: { select: { displayName: true, realName: true, phone: true, email: true, lineUserId: true } },
    },
  });

  const counts = await prisma.diveWish.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  // v899：把 diveSiteIds(Json，如 yingge-stone) 轉成中文潛點名；找不到就保留原值
  const idsOf = (w: { diveSiteIds: unknown }) => (Array.isArray(w.diveSiteIds) ? (w.diveSiteIds as string[]) : []);
  const allIds = [...new Set(wishes.flatMap(idsOf))];
  const sites = allIds.length
    ? await prisma.diveSite.findMany({ where: { id: { in: allIds } }, select: { id: true, name: true } })
    : [];
  const nameMap = new Map(sites.map((s) => [s.id, s.name]));
  const wishesOut = wishes.map((w) => ({
    ...w,
    diveSiteNames: idsOf(w).map((id) => nameMap.get(id) ?? id),
  }));

  return NextResponse.json({ wishes: wishesOut, counts });
}
