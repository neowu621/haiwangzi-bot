import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit-logs?page=1&limit=50&action=&actorId=&targetType=
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get("limit") ?? "50")));
  const action = url.searchParams.get("action") ?? "";
  const actorId = url.searchParams.get("actorId") ?? "";
  const targetType = url.searchParams.get("targetType") ?? "";

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action };
  if (actorId) where.actorId = actorId;
  if (targetType) where.targetType = targetType;

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // v200：批次補上 actor 的顯示名稱
  const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x && x !== "system")));
  const actors = actorIds.length === 0 ? [] : await prisma.user.findMany({
    where: { lineUserId: { in: actorIds } },
    select: { lineUserId: true, realName: true, displayName: true, role: true },
  });
  const actorMap = new Map(actors.map((u) => [u.lineUserId, u]));

  const enriched = logs.map((l) => {
    const u = l.actorId ? actorMap.get(l.actorId) : undefined;
    return {
      ...l,
      actorName: l.actorName ?? u?.realName ?? u?.displayName ?? null,
      actorRole: u?.role ?? null,
    };
  });

  return NextResponse.json({ logs: enriched, total, page, limit, pages: Math.ceil(total / limit) });
}
