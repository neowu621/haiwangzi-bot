import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

// GET /api/me/notifications?cursor=&limit=15 — 站內通知列表（cursor 分頁）
//   take limit+1 判 hasMore，回 { items, nextCursor }。純文字、零圖片。
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitParamRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParamRaw)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(limitParamRaw)))
    : DEFAULT_LIMIT;

  const rows = await prisma.notification.findMany({
    where: { userId: auth.user.lineUserId },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // 多取一筆判斷是否還有下一頁
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      templateKey: true,
      title: true,
      body: true,
      linkUrl: true,
      icon: true,
      isRead: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ items, nextCursor });
}
