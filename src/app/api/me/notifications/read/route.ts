import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/notifications/read — 標記站內通知為已讀
//   body { ids: string[] } 標指定幾筆；body { all: true } 全部標已讀。
//   只動自己的（where 帶 userId），回 { updated }。
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { ids?: unknown; all?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* 空 body 視為無動作 */
  }

  const all = body.all === true;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((x): x is string => typeof x === "string")
    : [];

  if (!all && ids.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const res = await prisma.notification.updateMany({
    where: {
      userId: auth.user.lineUserId,
      isRead: false,
      ...(all ? {} : { id: { in: ids } }),
    },
    data: { isRead: true, readAt: new Date() },
  });

  return NextResponse.json({ updated: res.count });
}
