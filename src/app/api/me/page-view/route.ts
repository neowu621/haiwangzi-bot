import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  refType: z.enum(["trip", "tour"]),
  refId: z.string().min(1).max(64),
});

/**
 * POST /api/me/page-view
 *   客戶在 LIFF 看某個場次/潛水團時，前端呼叫此 endpoint 記錄一筆
 *   給 admin 後台分析「看過但沒下單」的高意願客戶
 *
 *   為避免短時間刷新狂發 → 同 user + 同 ref 在 5 分鐘內只記一次
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  let body: { refType: string; refId: string };
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  try {
    // 去重：同 user + 同 ref + 5 分鐘內 已有紀錄 → skip
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await prisma.pageView.findFirst({
      where: {
        userId: auth.lineUserId,
        refType: body.refType,
        refId: body.refId,
        viewedAt: { gte: fiveMinAgo },
      },
    });
    if (existing) return NextResponse.json({ ok: true, deduped: true });

    await prisma.pageView.create({
      data: {
        userId: auth.lineUserId,
        refType: body.refType,
        refId: body.refId,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 寫失敗不影響使用者，靜默返回 ok
    console.error("[page-view]", e);
    return NextResponse.json({ ok: true, error: "logged silently" });
  }
}
