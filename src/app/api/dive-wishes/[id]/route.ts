// v318：客戶查看 / 取消 自己的願望單
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({ where: { id } });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not_your_wish" }, { status: 403 });
  }
  return NextResponse.json({ wish });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({ where: { id } });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not_your_wish" }, { status: 403 });
  }
  if (wish.status !== "pending" && wish.status !== "discussing") {
    return NextResponse.json({ error: `cannot_cancel: status=${wish.status}` }, { status: 400 });
  }
  const reason = new URL(req.url).searchParams.get("reason") ?? undefined;
  const updated = await prisma.diveWish.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledBy: "customer",
      cancellationReason: reason ?? null,
      cancelledAt: new Date(),
      lastActivityAt: new Date(),
    },
  });
  // 推 LINE 給 admin
  void (async () => {
    try {
      const { getLineClient } = await import("@/lib/line");
      const lc = getLineClient();
      if (!lc) return;
      const admins = await prisma.user.findMany({
        where: {
          OR: [
            { role: "admin" }, { role: "boss" },
            { roles: { has: "admin" } }, { roles: { has: "boss" } },
          ],
          notifyByLine: true,
        },
        select: { lineUserId: true },
      });
      const text = `📝 願望單已被客戶取消\n\n${auth.user.realName ?? auth.user.displayName} 取消了 ${wish.id.slice(0, 8)}${reason ? `\n原因：${reason}` : ""}`;
      for (const a of admins) {
        try { await lc.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] }); } catch (e) { console.error(e); }
      }
    } catch (e) { console.error("[notify admin wish cancelled]", e); }
  })();
  return NextResponse.json({ ok: true, wish: updated });
}
