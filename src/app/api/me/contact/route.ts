// v596：桌面會員(/pclogin)傳訊息給客服 → 進客服信箱(channel=web 對話串)+ 通知老闆。
//   老闆在客服信箱回覆 → 寫回該會員站內通知(見 admin reply 路由的 web 分支)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { notifyBossNewInquiry } from "@/lib/notify-boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v668：會員看自己的客服對話(自己發的 + 客服回的)
//   分頁：預設只回「最近 30 則」(由舊到新)；?before=<ISO> 往上補更早的 30 則。
//   回傳 hasMore(是否還有更早) + oldestAt(本頁最早一則時間，當下一頁的 before 游標)。
const CONTACT_PAGE = 30;
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const before = new URL(req.url).searchParams.get("before");
  const beforeDate = before ? new Date(before) : null;

  const threads = await prisma.emailThread.findMany({
    where: { channel: "web", lineUserId: auth.user.lineUserId },
    select: { id: true },
  });
  const ids = threads.map((t) => t.id);
  if (!ids.length) return NextResponse.json({ messages: [], hasMore: false, oldestAt: null });

  // 由新到舊取 limit+1 筆判斷是否還有更早，再反轉成「由舊到新」給前端顯示
  const rows = await prisma.emailMessage.findMany({
    where: {
      threadId: { in: ids },
      ...(beforeDate && !isNaN(beforeDate.getTime()) ? { createdAt: { lt: beforeDate } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: CONTACT_PAGE + 1,
    select: { direction: true, bodyText: true, createdAt: true },
  });
  const hasMore = rows.length > CONTACT_PAGE;
  const page = (hasMore ? rows.slice(0, CONTACT_PAGE) : rows).reverse();
  return NextResponse.json({
    messages: page.map((m) => ({ who: m.direction === "OUTBOUND" ? "cs" : "me", body: m.bodyText, createdAt: m.createdAt })),
    hasMore,
    oldestAt: page.length ? page[0].createdAt : null,
  });
}

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
