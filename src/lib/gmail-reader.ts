import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { prisma } from "@/lib/prisma";
import { ingestInboundEmail, type InboundAttachmentMeta } from "@/lib/email-inbound";
import { r2Configured, makeKey, putBuffer } from "@/lib/r2";

/**
 * v521：Gmail IMAP 讀信器 — 客服信箱 console 的「收信」實作。
 *
 * 流程：service@haiwangzi.xyz →(ImprovMX 轉寄)→ haiwangzi.northeast.coast@gmail.com，
 *   本函式用 IMAP 連這個 Gmail，把「轉進來的 @haiwangzi.xyz 客人信」拉出來、解析、入庫，
 *   出現在後台收件匣。靠 cron 定時呼叫（/api/cron/email-inbound-poll）。
 *
 * v528 重要修正：不再靠「未讀(\Seen)」判斷 —— 這個 Gmail 老闆本人也會看，一點開信就變已讀，
 *   cron 還沒跑就被讀掉 → 永遠收不到。改成掃「近 N 天」的信(不管讀沒讀)，
 *   用 Message-ID 對 DB 去重(已入庫就跳過)，而且完全不碰 Gmail 的讀取狀態。
 *
 * 必要 env（在 Zeabur 設）：
 *   INBOUND_GMAIL_USER          收信 Gmail（haiwangzi.northeast.coast@gmail.com）
 *   INBOUND_GMAIL_APP_PASSWORD  該 Gmail 的 App Password
 *   （未設則 fallback 用 GMAIL_USER / GMAIL_APP_PASSWORD）
 */

const HOST = "imap.gmail.com";
const LOOKBACK_DAYS = 7; // 掃近 7 天的信，靠 messageId 去重，重掃不會重複入庫

export function inboundImapConfigured(): boolean {
  return Boolean(
    (process.env.INBOUND_GMAIL_USER || process.env.GMAIL_USER) &&
      (process.env.INBOUND_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD),
  );
}

export interface PollResult {
  ok: boolean;
  scanned: number;  // 近 N 天本網域信總數（envelope 掃描）
  ingested: number; // 這次新入庫
  dedup: number;    // 已在 DB、跳過
  skipped: number;  // 解析/處理失敗
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
  return `${toText} ${deliveredTo}`.toLowerCase().includes("haiwangzi.xyz");
}

/** v531：跑一次收信並寫一筆紀錄（手動/排程共用）。log 失敗不影響收信。 */
export async function runAndLogPoll(trigger: "cron" | "manual"): Promise<PollResult> {
  const r = await pollInboundGmail();
  try {
    await prisma.emailPollLog.create({
      data: { trigger, scanned: r.scanned, ingested: r.ingested, dedup: r.dedup, skipped: r.skipped, ok: r.ok, error: r.error ?? null },
    });
  } catch { /* 寫 log 失敗忽略 */ }
  return r;
}

export async function pollInboundGmail(limit = 50): Promise<PollResult> {
  if (!inboundImapConfigured()) {
    return { ok: false, scanned: 0, ingested: 0, dedup: 0, skipped: 0, error: "IMAP 未設定（缺 INBOUND_GMAIL_USER / INBOUND_GMAIL_APP_PASSWORD）" };
  }
  const user = (process.env.INBOUND_GMAIL_USER || process.env.GMAIL_USER)!;
  const pass = (process.env.INBOUND_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD)!.replace(/\s+/g, "");
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5);

  const client = new ImapFlow({ host: HOST, port: 993, secure: true, auth: { user, pass }, logger: false });
  let scanned = 0, ingested = 0, dedup = 0, skipped = 0;

  await client.connect();
  // 掃 INBOX + 垃圾信匣（轉寄信常被 Gmail 判垃圾）。Spam 匣偵測：\Junk → 路徑 regex 兜底。
  const folders = ["INBOX"];
  try {
    const boxes = await client.list();
    const spam =
      boxes.find((mb) => mb.specialUse === "\\Junk") ??
      boxes.find((mb) => /(\[Gmail\]|\[Google Mail\])\/Spam$/i.test(mb.path)) ??
      boxes.find((mb) => /\/(Spam|Junk)$/i.test(mb.path));
    if (spam && !folders.includes(spam.path)) folders.push(spam.path);
  } catch { /* 只掃 INBOX */ }

  try {
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder);
      try {
        // 1) 先用 envelope 便宜地撈近 N 天本網域信的 (uid, messageId)
        const candidates: { uid: number; messageId: string }[] = [];
        for await (const msg of client.fetch({ to: "haiwangzi.xyz", since }, { uid: true, envelope: true })) {
          const mid = msg.envelope?.messageId;
          if (mid) candidates.push({ uid: msg.uid, messageId: mid });
          if (candidates.length >= limit) break;
        }
        scanned += candidates.length;

        // 2) 一次查 DB：哪些 messageId 已入庫 or 已被刪除(墓碑) → 跳過，不重複下載
        const ids = candidates.map((c) => c.messageId);
        const existing = new Set<string>();
        if (ids.length) {
          const [inDb, tombs] = await Promise.all([
            prisma.emailMessage.findMany({ where: { messageId: { in: ids } }, select: { messageId: true } }),
            prisma.emailDeletedMsgId.findMany({ where: { messageId: { in: ids } }, select: { messageId: true } }),
          ]);
          for (const m of inDb) existing.add(m.messageId);
          for (const t of tombs) existing.add(t.messageId);
        }

        // 3) 只下載＋解析＋入庫「新的」；完全不改 Gmail 讀取狀態
        for (const c of candidates) {
          if (existing.has(c.messageId)) { dedup++; continue; }
          try {
            const dl = await client.download(`${c.uid}`, undefined, { uid: true });
            if (!dl?.content) { skipped++; continue; }
            const parsed = await simpleParser(dl.content);

            const toText = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]).map((t) => t.text).join(",") : "";
            const deliveredTo = String(parsed.headers.get("delivered-to") ?? parsed.headers.get("x-forwarded-to") ?? "");
            if (!isForDomain(toText, deliveredTo)) { skipped++; continue; }

            const from = firstAddr(parsed.from);
            if (!from) { skipped++; continue; }

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
              messageId: c.messageId, // 用 envelope 的 Message-ID，與去重一致
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
          } catch {
            skipped++; // 單封失敗不影響其它
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
