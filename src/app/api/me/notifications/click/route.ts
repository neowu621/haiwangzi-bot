// v1039：站內通知「按鈕被點了」——記一次時間戳（只記第一次），給後台算訊息成效的點擊率。
//   刻意做成 fire-and-forget：任何錯誤都靜默回 ok，絕不擋住使用者跳頁。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { id: string };
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  try {
    await prisma.notification.updateMany({
      // userId 條件是安全邊界：只能蓋自己的通知
      where: { id: body.id, userId: auth.lineUserId, clickedAt: null },
      data: { clickedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notif-click]", e);
    return NextResponse.json({ ok: true, error: "logged silently" });
  }
}
