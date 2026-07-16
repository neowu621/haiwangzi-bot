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

  // v660：會員端只顯示近 30 天的通知（資料不刪除，後台「通訊紀錄」仍可查全部）
  const since30d = new Date(Date.now() - 30 * 86400000);
  const rows = await prisma.notification.findMany({
    where: { userId: auth.user.lineUserId, createdAt: { gte: since30d } },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // 多取一筆判斷是否還有下一頁
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      templateKey: true,
      title: true,
      body: true,
      linkUrl: true,
      buttonLabel: true, // v862：站內按鈕文字（來自模板設定）
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
