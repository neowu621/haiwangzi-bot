// v596：桌面會員(/pclogin)傳訊息給客服 → 進客服信箱(channel=web 對話串)+ 通知老闆。
//   老闆在客服信箱回覆 → 寫回該會員站內通知(見 admin reply 路由的 web 分支)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { notifyBossNewInquiry } from "@/lib/notify-boss";
import { logMessage } from "@/lib/message-log"; // v1058：自動回覆也記進通訊紀錄

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

  // v1058：kind="booking_help" = 下單失敗的求助。這種訊息客戶正處在「剛失敗、很焦慮」的狀態，
  //   一定要立刻有人回應，所以系統先自動回一句收到，讓對話框當下就有回覆。
  const body = (await req.json().catch(() => ({}))) as { message?: string; kind?: string };
  const message = (body.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "請輸入訊息內容" }, { status: 400 });
  const isBookingHelp = body.kind === "booking_help";

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
    // v1058：下單求助 → 立刻自動回一句，讓客戶當下就看到有人接手（而不是丟進黑洞等）。
    //   文案刻意誠懇：先道歉、明確承諾會處理、告訴他不用再按、也不會被重複收費。
    if (isBookingHelp) {
      const ack = [
        `${name} 您好，我們已經收到您的通知了 🙏`,
        "",
        "很抱歉讓您在下單時遇到問題，造成您的不便真的很不好意思。",
        "小編已經收到您剛才填寫的完整預約內容，會立刻為您確認場次名額並手動幫您完成預約。",
        "",
        "在我們回覆之前，請您不用再重複送出，也不會有重複扣款或重複訂位的情況，這邊都會幫您確認清楚。",
        "稍後就會在這個對話回覆您，謝謝您的耐心與體諒 🤿",
      ].join("\n");
      await prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          channel: "web",
          fromAddr: "service@haiwangzi.xyz",
          toAddr: email || auth.user.lineUserId,
          subject,
          bodyText: ack,
          messageId: `<web-ack-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@haiwangzi.xyz>`,
          status: "SENT",
        },
      });
      // 記進通訊紀錄，後台看得到這句是系統自動回的
      logMessage({
        channel: "inapp",
        templateKey: "booking_help_ack",
        recipientId: auth.user.lineUserId,
        recipient: name,
        title: "已收到下單求助通知（自動回覆）",
        status: "sent",
        source: "contact",
      });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  // 通知老闆(best-effort)
  void notifyBossNewInquiry({
    // v1058：下單求助標成 urgent，老闆那端一眼看得出這筆要優先處理
    type: "question",
    subject: isBookingHelp ? `🆘 下單失敗求助：${name}` : subject,
    name,
    email,
    bodyText: message,
  }).catch((e) => console.error("[me/contact notify]", e));

  return NextResponse.json({ ok: true });
}
