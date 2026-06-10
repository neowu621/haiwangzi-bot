// v318：客戶在自己的願望單回覆訊息
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ImageItem = z.object({
  url: z.string().min(1),
  key: z.string().optional(),
  type: z.enum(["r2", "link"]),
  caption: z.string().max(200).optional(),
});

const Body = z.object({
  text: z.string().min(1).max(2000),
  attachments: z.array(ImageItem).max(5).default([]),
});

interface Message {
  from: "customer" | "boss";
  text: string;
  at: string;
  actorId?: string;
  attachments?: Array<{ url: string; key?: string; type: "r2" | "link"; caption?: string }>;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({ where: { id } });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not_your_wish" }, { status: 403 });
  }
  if (wish.status !== "pending" && wish.status !== "discussing") {
    return NextResponse.json({ error: `cannot_reply: status=${wish.status}` }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const newMsg: Message = {
    from: "customer",
    text: parsed.data.text,
    at: new Date().toISOString(),
    actorId: auth.user.lineUserId,
    attachments: parsed.data.attachments.length > 0 ? parsed.data.attachments : undefined,
  };
  const updated = await prisma.diveWish.update({
    where: { id },
    data: {
      messages: [...((wish.messages as unknown as Message[]) ?? []), newMsg] as never,
      status: "discussing",
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
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.xyz";
      const text = `📝 客戶回覆願望單\n\n${auth.user.realName ?? auth.user.displayName}：\n「${parsed.data.text.slice(0, 200)}${parsed.data.text.length > 200 ? "..." : ""}」\n\n👉 ${baseUrl}/admin/dive-wishes/${id}`;
      for (const a of admins) {
        try { await lc.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] }); } catch (e) { console.error(e); }
      }
    } catch (e) { console.error("[customer reply notify admin]", e); }
  })();

  void logCustomerActivity({
    req,
    user: auth.user,
    action: "customer.wish.reply",
    targetType: "wish",
    targetId: updated.id,
    targetLabel: updated.code ?? undefined,
    metadata: { textPreview: parsed.data.text.slice(0, 100) },
  });

  return NextResponse.json({ ok: true, wish: updated });
}
