import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { ingestInboundEmail, type InboundAttachmentMeta } from "@/lib/email-inbound";
import { r2Configured, makeKey, putBuffer } from "@/lib/r2";

/**
 * v521：Gmail IMAP 讀信器 — 客服信箱 console 的「收信」實作。
 *
 * 流程：service@haiwangzi.xyz →(ImprovMX 轉寄)→ haiwangzi.northeast.coast@gmail.com，
 *   本函式用 IMAP 連這個 Gmail，把「轉進來的 @haiwangzi.xyz 客人信」拉出來、解析、入庫，
 *   出現在後台收件匣。靠 cron 定時呼叫（/api/cron/email-inbound-poll）。
 *
 * 必要 env（在 Zeabur 設）：
 *   INBOUND_GMAIL_USER          收信 Gmail（haiwangzi.northeast.coast@gmail.com）
 *   INBOUND_GMAIL_APP_PASSWORD  該 Gmail 的 App Password（需開 2FA 後產生；同一把可開 IMAP）
 *   （未設則 fallback 用 GMAIL_USER / GMAIL_APP_PASSWORD）
 */

const HOST = "imap.gmail.com";

export function inboundImapConfigured(): boolean {
  return Boolean(
    (process.env.INBOUND_GMAIL_USER || process.env.GMAIL_USER) &&
      (process.env.INBOUND_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD),
  );
}

export interface PollResult {
  ok: boolean;
  scanned: number;
  ingested: number;
  dedup: number;
  skipped: number;
  error?: string;
}

function firstAddr(a?: AddressObject | AddressObject[]): { email: string; name?: string } | null {
  const obj = Array.isArray(a) ? a[0] : a;
  const v = obj?.value?.[0];
  if (!v?.address) return null;
  return { email: v.address, name: v.name || undefined };
}

function joinRefs(refs?: string | string[]): string | null {
  if (!refs) return null;
  return Array.isArray(refs) ? refs.join(" ") : refs;
}

/** 收件人/標頭是否含本網域 → 過濾掉 Gmail 裡的私人信，只收轉進來的客服信 */
function isForDomain(toText: string, deliveredTo: string): boolean {
  const hay = `${toText} ${deliveredTo}`.toLowerCase();
  return hay.includes("haiwangzi.xyz");
}

export async function pollInboundGmail(limit = 30): Promise<PollResult> {
  if (!inboundImapConfigured()) {
    return { ok: false, scanned: 0, ingested: 0, dedup: 0, skipped: 0, error: "IMAP 未設定（缺 INBOUND_GMAIL_USER / INBOUND_GMAIL_APP_PASSWORD）" };
  }
  const user = (process.env.INBOUND_GMAIL_USER || process.env.GMAIL_USER)!;
  const pass = (process.env.INBOUND_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD)!.replace(/\s+/g, "");

  const client = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user, pass }, logger: false });
  let scanned = 0, ingested = 0, dedup = 0, skipped = 0;

  await client.connect();
  // 掃 INBOX + 垃圾信匣（轉寄信常被 Gmail 判垃圾，不掃 Spam 會漏收客人信）
  const folders = ["INBOX"];
  try {
    for (const mb of await client.list()) {
      if (mb.specialUse === "\\Junk" && !folders.includes(mb.path)) { folders.push(mb.path); break; }
    }
  } catch { /* 找不到 Spam 匣就只掃 INBOX */ }

  try {
   for (const folder of folders) {
    const lock = await client.getMailboxLock(folder);
    try {
    // 只撈「To 含本網域」的未讀信 → 完全不碰老闆 Gmail 裡的私人信
    const uids = (await client.search({ seen: false, to: "haiwangzi.xyz" }, { uid: true })) || [];
    const take = uids.slice(0, limit);
    for (const uid of take) {
      scanned++;
      try {
        const dl = await client.download(`${uid}`, undefined, { uid: true });
        if (!dl?.content) { skipped++; continue; }
        const parsed = await simpleParser(dl.content);

        // 防呆再確認一次；非本網域就「跳過但不標已讀」（不動私人信）
        const toText = (parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).map((t) => t.text).join(",") : "");
        const deliveredTo = String(parsed.headers.get("delivered-to") ?? parsed.headers.get("x-forwarded-to") ?? "");
        if (!isForDomain(toText, deliveredTo)) { skipped++; continue; }

        const from = firstAddr(parsed.from);
        const messageId = parsed.messageId || `<gmail-${uid}-${Date.now()}@haiwangzi.xyz>`;
        if (!from) { await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true }); skipped++; continue; }

        // 附件 → R2 私密 bucket（含個資）
        const attachments: InboundAttachmentMeta[] = [];
        for (const att of parsed.attachments ?? []) {
          const filename = att.filename || "attachment";
          const meta: InboundAttachmentMeta = { filename, contentType: att.contentType || "application/octet-stream", size: att.size ?? att.content?.length ?? 0 };
          if (att.content && r2Configured()) {
            try {
              const key = makeKey("email", filename, "inbound");
              await putBuffer("email", key, att.content, meta.contentType);
              meta.key = key; meta.bucket = "private";
            } catch { /* 上傳失敗留 metadata */ }
          }
          attachments.push(meta);
        }

        const r = await ingestInboundEmail({
          messageId,
          inReplyTo: parsed.inReplyTo ?? null,
          references: joinRefs(parsed.references),
          fromEmail: from.email,
          fromName: from.name,
          to: "service@haiwangzi.xyz",
          subject: parsed.subject ?? "(無主旨)",
          text: parsed.text ?? null,
          html: parsed.html || null,
          attachments,
        });
        if (r.dedup) dedup++; else ingested++;

        await client.messageFlagsAdd(`${uid}`, ["\\Seen"], { uid: true });
      } catch {
        skipped++; // 單封失敗不影響其它（不標已讀，下次重試）
      }
    }
    } finally {
      lock.release();
    }
   }
  } finally {
    await client.logout().catch(() => {});
  }

  return { ok: true, scanned, ingested, dedup, skipped };
}
