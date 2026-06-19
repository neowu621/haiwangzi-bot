// v596：桌面會員(/pclogin)傳訊息給客服 → 進客服信箱(channel=web 對話串)+ 通知老闆。
//   老闆在客服信箱回覆 → 寫回該會員站內通知(見 admin reply 路由的 web 分支)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { notifyBossNewInquiry } from "@/lib/notify-boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = (body.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "請輸入訊息內容" }, { status: 400 });

  const name = auth.user.realName ?? auth.user.displayName ?? "會員";
  const email = auth.user.email ?? "";
  const subject = `會員訊息：${name}`;
  const messageId = `<web-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@haiwangzi.xyz>`;

  try {
    // 同一會員未結案的 web 對話 → 接續;否則開新串
    let thread = await prisma.emailThread.findFirst({
      where: { channel: "web", lineUserId: auth.user.lineUserId, status: { not: "CLOSED" } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (!thread) {
      thread = await prisma.emailThread.create({
        data: {
          subject,
          customerEmail: email,
          customerName: name,
          status: "WAITING",
          channel: "web",
          lineUserId: auth.user.lineUserId,
          tags: ["桌面會員"],
          lastMessageAt: new Date(),
        },
      });
    } else {
      await prisma.emailThread.update({ where: { id: thread.id }, data: { status: "WAITING", lastMessageAt: new Date() } });
    }
    await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        channel: "web",
        fromAddr: email || auth.user.lineUserId,
        toAddr: "service@haiwangzi.xyz",
        subject,
        bodyText: message,
        messageId,
        status: "RECEIVED",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 通知老闆(best-effort)
  void notifyBossNewInquiry({ type: "question", subject, name, email, bodyText: message }).catch((e) => console.error("[me/contact notify]", e));

  return NextResponse.json({ ok: true });
}
