import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/message-log — 通訊紀錄（統一讀取模型）。
//   合併兩個資料源:① MessageLog(系統外送 LINE/Email/站內) ② EmailMessage(客服信箱:
//   網站詢問 INBOUND / 客服回覆 · 自動回覆 OUTBOUND)。依 createdAt 時間游標合併分頁。
//   篩選:direction(in/out) · channel(line/email/inapp) · status(received/failed/opened)。

type Dir = "in" | "out";
interface UItem {
  id: string;
  kind: "log" | "email";
  direction: Dir;
  channel: "line" | "email" | "inapp";
  status: string; // received/queued/sent/delivered/opened/failed/bounced/skipped
  recipient: string;
  title: string;
  category: string; // 來源 chip
  error: string | null;
  threadId: string | null;
  createdAt: string;
}

const TEMPLATE_LABEL: Record<string, string> = {
  birthday_credit: "生日祝福",
  attendance_confirmed: "出席確認",
  contact_notify_admin: "通知老闆",
};
function logCategory(templateKey: string, source: string): string {
  if (TEMPLATE_LABEL[templateKey]) return TEMPLATE_LABEL[templateKey];
  if (source === "broadcast") return "群發通知";
  if (source === "weather") return "天氣通知";
  if (source === "custom-order") return "客製訂單";
  if (source === "test") return "測試";
  return "系統通知";
}
function emailStatus(direction: string, status: string, opened: boolean): string {
  if (direction === "INBOUND") return "received";
  if (opened) return "opened";
  switch (status) {
    case "DELIVERED": return "delivered";
    case "SENT": return "sent";
    case "QUEUED": return "queued";
    case "BOUNCED": return "bounced";
    case "FAILED": return "failed";
    default: return "sent";
  }
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const direction = url.searchParams.get("direction"); // in / out
  const channel = url.searchParams.get("channel"); // line / email / inapp
  const status = url.searchParams.get("status"); // received / failed / opened
  const cursor = url.searchParams.get("cursor"); // ISO 時間游標
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 30), 100);
  const cursorTime = cursor ? new Date(cursor) : null;

  // 決定查哪些表(MessageLog 都是 outbound;EmailMessage 含 email + line 兩種 channel)
  let includeLog = true;
  let includeEmail = true;
  if (direction === "in") includeLog = false;
  if (channel === "inapp") includeEmail = false; // EmailMessage 無 inapp
  if (status === "received" || status === "opened") includeLog = false;

  const logWhere: Record<string, unknown> = {};
  if (cursorTime) logWhere.createdAt = { lt: cursorTime };
  if (channel && ["line", "email", "inapp"].includes(channel)) logWhere.channel = channel;
  if (status === "failed") logWhere.status = "failed";

  const emailWhere: Record<string, unknown> = {};
  if (cursorTime) emailWhere.createdAt = { lt: cursorTime };
  if (channel === "email" || channel === "line") emailWhere.channel = channel; // v561
  if (direction === "in" || status === "received") emailWhere.direction = "INBOUND";
  else if (direction === "out") emailWhere.direction = "OUTBOUND";
  if (status === "opened") emailWhere.openedAt = { not: null };
  if (status === "failed") emailWhere.status = { in: ["FAILED", "BOUNCED"] };

  const [logs, emails] = await Promise.all([
    includeLog
      ? prisma.messageLog.findMany({ where: logWhere, orderBy: { createdAt: "desc" }, take: limit + 1 })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.messageLog.findMany>>),
    includeEmail
      ? prisma.emailMessage.findMany({
          where: emailWhere,
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          include: { thread: { select: { id: true, customerName: true, tags: true } } },
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.emailMessage.findMany>>),
  ]);

  const merged: UItem[] = [];
  for (const m of logs) {
    const ch = (["line", "email", "inapp"].includes(m.channel) ? m.channel : "inapp") as UItem["channel"];
    merged.push({
      id: "L:" + m.id, kind: "log", direction: "out", channel: ch,
      status: m.status, recipient: m.recipient, title: m.title,
      category: logCategory(m.templateKey, m.source), error: m.error, threadId: null,
      createdAt: m.createdAt.toISOString(),
    });
  }
  for (const e of emails) {
    const em = e as typeof e & { channel?: string; thread?: { id: string; customerName: string | null; tags: string[] } | null };
    const dir: Dir = em.direction === "INBOUND" ? "in" : "out";
    const isLine = em.channel === "line";
    const who = dir === "in" ? (em.thread?.customerName ?? em.fromAddr) : em.toAddr;
    const cat = isLine
      ? (dir === "in" ? "LINE 詢問" : "LINE 回覆")
      : dir === "in"
        ? (em.thread?.tags?.includes("網站詢問") ? "網站詢問" : "客人來訊")
        : (em.subject?.startsWith("我們已收到") ? "自動回覆" : "客服回覆");
    merged.push({
      id: "E:" + em.id, kind: "email", direction: dir, channel: isLine ? "line" : "email",
      status: emailStatus(em.direction, em.status, !!em.openedAt),
      recipient: who, title: em.subject,
      category: cat, error: null, threadId: em.thread?.id ?? em.threadId,
      createdAt: em.createdAt.toISOString(),
    });
  }
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const hasMore = merged.length > limit;
  const page = merged.slice(0, limit);
  const nextCursor = hasMore ? page[page.length - 1]?.createdAt ?? null : null;

  // 行動型統計(近 7 天 + 目前待回覆)
  const since = new Date(Date.now() - 7 * 86400_000);
  const [waiting, weekInbound, failLog, failEmail, sentLog, sentEmail, deliveredEmail, openedEmail] = await Promise.all([
    prisma.emailThread.count({ where: { status: "WAITING" } }),
    prisma.emailMessage.count({ where: { direction: "INBOUND", createdAt: { gte: since } } }),
    prisma.messageLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { status: { in: ["FAILED", "BOUNCED"] }, createdAt: { gte: since } } }),
    prisma.messageLog.count({ where: { status: "sent", createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED"] }, createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { direction: "OUTBOUND", status: "DELIVERED", createdAt: { gte: since } } }),
    prisma.emailMessage.count({ where: { direction: "OUTBOUND", openedAt: { not: null }, createdAt: { gte: since } } }),
  ]);
  const stats = {
    waiting,
    weekInbound,
    sent: sentLog + sentEmail,
    failed: failLog + failEmail,
    openRate: deliveredEmail > 0 ? Math.round((openedEmail / deliveredEmail) * 100) : null,
  };

  return NextResponse.json({ items: page, nextCursor, stats });
}
