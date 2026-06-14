import { NextRequest, NextResponse } from "next/server";
import { ingestInboundEmail, type InboundAttachmentMeta } from "@/lib/email-inbound";
import { r2Configured, makeKey, putBuffer } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/email/inbound
 * 接收 Inbound Parse 服務（Postmark 範例）送來的「客人新信」。
 * 驗證：webhook URL 帶 ?secret=<INBOUND_WEBHOOK_SECRET>。
 *
 * 註：海王子實際採「ImprovMX 轉 Gmail + 系統 IMAP 讀 Gmail」(見 /api/cron/email-inbound-poll)，
 *   這支 Postmark webhook 保留為備援/相容路徑，與 IMAP 讀信共用 ingestInboundEmail。
 */
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.INBOUND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let p: PostmarkInbound;
  try {
    p = (await req.json()) as PostmarkInbound;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const messageId = headerValue(p.Headers, "Message-ID") ?? p.MessageID;
  if (!messageId) return NextResponse.json({ error: "missing messageId" }, { status: 400 });

  // 附件：base64 → R2 私密 bucket（含個資），DB 只存 key + metadata。R2 沒設定就只留 metadata。
  const attachments: InboundAttachmentMeta[] = await Promise.all(
    (p.Attachments ?? []).map(async (a) => {
      const base: InboundAttachmentMeta = { filename: a.Name, contentType: a.ContentType, size: a.ContentLength };
      if (!a.Content || !r2Configured()) return base;
      try {
        const key = makeKey("email", a.Name || "attachment", "inbound");
        await putBuffer("email", key, Buffer.from(a.Content, "base64"), a.ContentType || "application/octet-stream");
        return { ...base, key, bucket: "private" };
      } catch {
        return base;
      }
    }),
  );

  const r = await ingestInboundEmail({
    messageId,
    inReplyTo: headerValue(p.Headers, "In-Reply-To") ?? null,
    references: headerValue(p.Headers, "References") ?? null,
    fromEmail: p.FromFull?.Email ?? p.From,
    fromName: p.FromFull?.Name || undefined,
    to: p.To,
    subject: p.Subject ?? "(無主旨)",
    text: p.TextBody,
    html: p.HtmlBody,
    attachments,
  });

  return NextResponse.json(r.dedup ? { ok: true, dedup: true } : { ok: true });
}

function headerValue(headers: { Name: string; Value: string }[] | undefined, name: string) {
  return headers?.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value;
}

interface PostmarkInbound {
  From: string;
  FromFull?: { Email: string; Name: string };
  To?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID: string;
  Headers?: { Name: string; Value: string }[];
  Attachments?: { Name: string; ContentType: string; ContentLength: number; Content: string }[];
}
