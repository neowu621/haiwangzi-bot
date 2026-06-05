// v318：admin 查單筆 + 回覆 + 取消 + 轉場次
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({
    where: { id },
    include: {
      user: { select: { displayName: true, realName: true, phone: true, email: true, lineUserId: true } },
    },
  });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ wish });
}

const Body = z.object({
  text: z.string().min(1).max(2000),
});

interface Message {
  from: "customer" | "boss";
  text: string;
  at: string;
  actorId?: string;
}

// PATCH = reply
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({ where: { id }, include: { user: { select: { lineUserId: true, realName: true, displayName: true } } } });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.status !== "pending" && wish.status !== "discussing") {
    return NextResponse.json({ error: `cannot_reply: status=${wish.status}` }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const newMsg: Message = {
    from: "boss",
    text: parsed.data.text,
    at: new Date().toISOString(),
    actorId: auth.user.lineUserId,
  };
  const updated = await prisma.diveWish.update({
    where: { id },
    data: {
      messages: [...((wish.messages as unknown as Message[]) ?? []), newMsg] as never,
      status: "discussing",
      lastActivityAt: new Date(),
    },
  });

  // push LINE 給客戶
  void (async () => {
    try {
      const { getLineClient } = await import("@/lib/line");
      const lc = getLineClient();
      if (!lc) return;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app";
      const text = `📝 老闆回覆您的願望單\n\n「${parsed.data.text.slice(0, 200)}${parsed.data.text.length > 200 ? "..." : ""}」\n\n👉 至 LIFF 我的預約 → 我的願望單查看完整對話`;
      void baseUrl;
      await lc.pushMessage({ to: wish.user.lineUserId, messages: [{ type: "text", text }] });
    } catch (e) { console.error("[admin reply notify customer]", e); }
  })();

  return NextResponse.json({ ok: true, wish: updated });
}

// DELETE = 老闆取消
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({ where: { id }, include: { user: { select: { lineUserId: true } } } });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.status !== "pending" && wish.status !== "discussing") {
    return NextResponse.json({ error: `cannot_cancel: status=${wish.status}` }, { status: 400 });
  }
  const reason = new URL(req.url).searchParams.get("reason") ?? "";

  const updated = await prisma.diveWish.update({
    where: { id },
    data: {
      status: "cancelled",
      cancelledBy: "boss",
      cancellationReason: reason || null,
      cancelledAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "dive_wish.cancel",
    targetType: "dive_wish",
    targetId: id,
    metadata: { reason },
  });

  // push LINE 給客戶
  void (async () => {
    try {
      const { getLineClient } = await import("@/lib/line");
      const lc = getLineClient();
      if (!lc) return;
      const text = `📝 老闆結束願望單對話\n\n${reason ? `說明：${reason}\n\n` : ""}如還想潛水，歡迎重新提出新的願望單，或瀏覽既有場次。`;
      await lc.pushMessage({ to: wish.user.lineUserId, messages: [{ type: "text", text }] });
    } catch (e) { console.error("[boss cancel notify customer]", e); }
  })();

  return NextResponse.json({ ok: true, wish: updated });
}
