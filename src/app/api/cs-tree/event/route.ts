// v903：記錄客服引導問題樹事件（前端點分類/看答案/解決/轉真人時打點）。
//   會員身分為 best-effort：拿得到就記 userId，拿不到仍記事件（不擋）。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  category: z.string().min(1).max(40),
  questionKey: z.string().max(60).optional(),
  action: z.enum(["category", "answer", "resolved", "escalated"]),
});

export async function POST(req: NextRequest) {
  let data: z.infer<typeof Body>;
  try {
    data = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const auth = await authFromRequest(req);
    if (auth.ok) userId = auth.user.lineUserId;
  } catch { /* 匿名也記 */ }

  try {
    await prisma.csTreeEvent.create({
      data: {
        userId,
        category: data.category,
        questionKey: data.questionKey ?? null,
        action: data.action,
      },
    });
  } catch (e) {
    console.error("[cs-tree event]", e);
  }
  return NextResponse.json({ ok: true });
}
