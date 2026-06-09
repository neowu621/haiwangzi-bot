import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/notifications/unread-count — 站內通知未讀數（輕端點，BottomNav 紅點用）
//   只 count、不取資料；單一索引 (user_id, is_read) 走得到，無高頻負荷
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const count = await prisma.notification.count({
    where: { userId: auth.user.lineUserId, isRead: false },
  });

  return NextResponse.json({ count });
}
