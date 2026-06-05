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
  // v321：通道選擇（預設 line 維持向後相容）
  channels: z.array(z.enum(["line", "email"])).min(1).optional(),
  emailSubject: z.string().max(200).optional(),
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
  const wish = await prisma.diveWish.findUnique({
    where: { id },
    include: { user: { select: { lineUserId: true, realName: true, displayName: true, email: true, notifyByLine: true, notifyByEmail: true } } },
  });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.status !== "pending" && wish.status !== "discussing") {
    return NextResponse.json({ error: `cannot_reply: status=${wish.status}` }, { status: 400 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const channels = parsed.data.channels ?? ["line"]; // v321：預設 line（向後相容）
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

  // v321：發送結果（同步 await，回給前端讓老闆知道哪邊成功 / 失敗）
  const results: Record<string, { ok: boolean; error?: string }> = {};
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
  const previewText = parsed.data.text.slice(0, 200) + (parsed.data.text.length > 200 ? "..." : "");

  if (channels.includes("line")) {
    if (!wish.user.notifyByLine) {
      results.line = { ok: false, error: "客戶關閉了 LINE 通知" };
    } else {
      try {
        const { getLineClient } = await import("@/lib/line");
        const lc = getLineClient();
        if (!lc) {
          results.line = { ok: false, error: "LINE Channel access token 未設定" };
        } else {
          const text = `📝 老闆回覆您的願望單\n\n「${previewText}」\n\n👉 至 LIFF 我的預約 → 我的願望單查看完整對話`;
          await lc.pushMessage({ to: wish.user.lineUserId, messages: [{ type: "text", text }] });
          results.line = { ok: true };
        }
      } catch (e) {
        results.line = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  if (channels.includes("email")) {
    if (!wish.user.email) {
      results.email = { ok: false, error: "客戶未填寫 Email" };
    } else if (!wish.user.notifyByEmail) {
      results.email = { ok: false, error: "客戶關閉了 Email 通知" };
    } else {
      try {
        const { sendEmail } = await import("@/lib/email/send");
        const subject = parsed.data.emailSubject?.trim() || `${appName} — 願望單回覆`;
        await sendEmail({
          to: wish.user.email,
          subject,
          html: `<div style="font-family: 'PingFang TC','Microsoft JhengHei',sans-serif; max-width:600px; padding:24px">
            <p>${(wish.user.realName ?? wish.user.displayName ?? "客戶")} 您好：</p>
            <p>老闆回覆了您的願望單：</p>
            <pre style="white-space:pre-wrap; font-family:inherit; background:#f8fafc; padding:16px; border-radius:8px; line-height:1.7">${parsed.data.text.replace(/</g, "&lt;")}</pre>
            <p style="font-size:13px; color:#475569">👉 至 LIFF 我的預約 → 我的願望單查看完整對話。</p>
            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb" />
            <p style="font-size:12px; color:#6b7280">${appName}</p>
          </div>`,
        });
        results.email = { ok: true };
      } catch (e) {
        results.email = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  return NextResponse.json({ ok: true, wish: updated, results });
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
