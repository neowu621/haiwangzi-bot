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

  return NextResponse.json({ wishes, counts });
}
