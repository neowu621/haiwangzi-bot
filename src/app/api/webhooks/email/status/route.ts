import { NextRequest, NextResponse } from "next/server";
import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyZeaburSignature } from "@/lib/zeabur-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/email/status
 * 接收 Zeabur Email 的「寄出信件」狀態事件。
 * 這支 webhook 不會收到客人來信 —— 那是 inbound webhook 的事。
 *
 * 來源：haiwangzi-email-console bundle，由 Hono 改寫為 Next.js route handler。
 * v521 修正：依 Zeabur Email webhook 官方文件，payload 是巢狀信封
 *   { event, timestamp, email: { id, message_id, from, to[], subject, sent_at }, data: {...} }
 *   provider id 在 email.id、收件人在 email.to[] / data.*_recipients，事件型別在 body.event（也有同名 header）。
 */
interface ZSendWebhookPayload {
  event?: string;
  timestamp?: string;
  email?: {
    id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
  };
  data?: {
    bounced_recipients?: unknown;
    complained_recipients?: unknown;
  };
}

export async function POST(req: NextRequest) {
  // 1) 必須先拿 raw body 驗簽，再 parse
  const raw = await req.text();
  const ok = verifyZeaburSignature(
    raw,
    req.headers.get("x-zsend-signature"),
    req.headers.get("x-zsend-timestamp"),
  );
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  let payload: ZSendWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // 事件型別：優先 body.event，退回 header
  const event = (payload.event ?? req.headers.get("x-zsend-event") ?? "").toLowerCase();
  const providerId = payload.email?.id;
  // 收件人：bounce/complaint 優先用 data.*_recipients，否則用 email.to[0]
  const recipient =
    firstEmail(payload.data?.bounced_recipients) ??
    firstEmail(payload.data?.complained_recipients) ??
    payload.email?.to?.[0];

  // 找到對應的 outbound message（用 providerId 對應 send 時存的）
  const msg = providerId
    ? await prisma.emailMessage.findFirst({ where: { providerId } })
    : null;

  // 2) 事件 → 狀態對應（容忍 send/sent、delivery/delivered 等命名差異）
  switch (event) {
    case "send":
    case "sent":
      if (msg) await setStatus(msg.id, "SENT");
      break;

    case "delivery":
    case "delivered":
      if (msg) await setStatus(msg.id, "DELIVERED");
      break;

    case "bounce":
    case "bounced":
      if (msg) await setStatus(msg.id, "BOUNCED");
      if (recipient) await suppress(recipient, "bounce");
      await onBounce(msg?.threadId); // 標紅訂位 thread + 待接通知管道
      break;

    case "complaint":
    case "complained":
      if (recipient) await suppress(recipient, "complaint");
      break;

    case "reject":
    case "rejected":
      if (msg) await setStatus(msg.id, "FAILED");
      break;

    case "open":
    case "opened":
      if (msg) await prisma.emailMessage.update({ where: { id: msg.id }, data: { openedAt: new Date() } });
      break;

    case "click":
    case "clicked":
      if (msg) await prisma.emailMessage.update({ where: { id: msg.id }, data: { clickedAt: new Date() } });
      break;

    default:
      // 訂閱所有事件時，未知事件直接 200 收下即可
      break;
  }

  // 3) 一律回 200，讓 Zeabur 不要重送（at-least-once，handler 要冪等）
  return NextResponse.json({ ok: true });
}

/** 從 SES/Zeabur 的 recipients 結構抽第一個 email（可能是字串陣列或物件陣列） */
function firstEmail(arr: unknown): string | undefined {
  if (!arr) return undefined;
  const r = Array.isArray(arr) ? arr[0] : arr;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const v = o.emailAddress ?? o.email ?? o.address;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

async function setStatus(id: string, status: MessageStatus) {
  await prisma.emailMessage.update({ where: { id }, data: { status } });
}

async function suppress(email: string, reason: "bounce" | "complaint") {
  await prisma.suppressedEmail.upsert({
    where: { email },
    update: { reason },
    create: { email, reason },
  });
}

/**
 * 退信補救 —— 對訂位生意這是最該做的自動化：
 * 客人沒收到確認信＝可能不知道訂成功，要轉人工用 LINE/電話聯絡。
 * 把該 thread 標「處理中 + 退信」標籤，後台一眼看到。
 */
async function onBounce(threadId?: string) {
  if (!threadId) return;
  await prisma.emailThread.update({
    where: { id: threadId },
    data: { status: "PROCESSING", tags: { push: "退信" } },
  });
  // TODO（可選）：接後台告警 / 推 LINE 給汪汪「此訂位請改用 LINE 聯絡」
}
