import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/message-log — 訊息發送紀錄（分頁 + 篩選 channel / status）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel"); // line / email / inapp
  const status = url.searchParams.get("status"); // sent / failed / skipped
  const cursor = url.searchParams.get("cursor"); // message id
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);

  const where: Record<string, unknown> = {};
  if (channel && ["line", "email", "inapp"].includes(channel)) where.channel = channel;
  if (status && ["sent", "failed", "skipped"].includes(status)) where.status = status;

  const items = await prisma.messageLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;

  // 概況統計（近 7 天）
  const since = new Date(Date.now() - 7 * 86400_000);
  const grouped = await prisma.messageLog.groupBy({
    by: ["channel", "status"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const stats = { sent: 0, failed: 0, skipped: 0, line: 0, email: 0, inapp: 0 };
  for (const g of grouped) {
    if (g.status in stats) stats[g.status as keyof typeof stats] += g._count._all;
    if (g.channel in stats) stats[g.channel as keyof typeof stats] += g._count._all;
  }

  return NextResponse.json({
    items: page.map((m) => ({
      id: m.id,
      channel: m.channel,
      templateKey: m.templateKey,
      recipient: m.recipient,
      title: m.title,
      status: m.status,
      error: m.error,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    stats,
  });
}
