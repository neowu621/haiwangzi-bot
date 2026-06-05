// v334: admin 查詢前台客戶活動紀錄
// Query params:
//   action?     — 完整 action 或 prefix（e.g. customer.booking）
//   userId?     — 過濾單一客戶
//   from?, to?  — ISO date 範圍
//   page?, limit? — 分頁（預設 1, 50）
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
  const action = url.searchParams.get("action");           // 完整或 prefix
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const where: Record<string, unknown> = {
    actorRole: "customer",
  };
  if (action) {
    if (action.endsWith(".*")) {
      where.action = { startsWith: action.slice(0, -2) };
    } else if (action === "all") {
      // 不加 filter
    } else {
      where.action = action;
    }
  }
  if (userId) where.actorId = userId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    where.createdAt = range;
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Optional: 帶上 user 資料（給前端顯示用）— 對列表中的 actorId 做 batch lookup
  const userIds = Array.from(new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x)));
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { lineUserId: { in: userIds } },
        select: { lineUserId: true, displayName: true, realName: true, phone: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.lineUserId, u]));

  return NextResponse.json({
    total,
    page,
    limit,
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      actorId: r.actorId,
      actorName: r.actorName,
      user: r.actorId ? userMap.get(r.actorId) ?? null : null,
      actorIp: r.actorIp,
      actorUserAgent: r.actorUserAgent,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetLabel,
      metadata: r.metadata,
    })),
  });
}
