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

  return NextResponse.json({ logs, total, page, limit, pages: Math.ceil(total / limit) });
}
