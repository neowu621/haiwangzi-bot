import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findThreadForInbound } from "@/lib/email-threading";

/**
 * v521：收信入庫共用邏輯 — Postmark inbound webhook 與 Gmail IMAP 讀信器共用。
 * 負責：去重(messageId) → threading → 寫 thread + INBOUND message。
 * 附件上傳(R2)由呼叫端先做好、傳 metadata 進來，這裡只管寫 DB。
 */
export interface InboundAttachmentMeta {
  filename: string;
  contentType: string;
  size: number;
  key?: string;     // R2 物件 key（有上傳才有）
  bucket?: string;  // "private"
}

export interface InboundEmail {
  messageId: string;
  inReplyTo?: string | null;
  references?: string | null;
  fromEmail: string;
  fromName?: string;
  to?: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: InboundAttachmentMeta[];
}

export type IngestResult =
  | { ok: true; dedup: true; threadId?: string }
  | { ok: true; dedup: false; threadId: string };

export async function ingestInboundEmail(m: InboundEmail): Promise<IngestResult> {
  // 1) 冪等去重（at-least-once，同一封可能進來兩次）
  const exists = await prisma.emailMessage.findUnique({
    where: { messageId: m.messageId },
    select: { threadId: true },
  });
  if (exists) return { ok: true, dedup: true, threadId: exists.threadId };

  const subject = m.subject || "(無主旨)";

  // 2) threading：找既有對話串
  const threadId = await findThreadForInbound({
    inReplyTo: m.inReplyTo ?? null,
    references: m.references ?? null,
    customerEmail: m.fromEmail,
    subject,
  });

  // 3) 寫入（命中→掛同串並更新；沒命中→開新串）
  try {
    const tid = await prisma.$transaction(async (tx) => {
      const thread = threadId
        ? await tx.emailThread.update({
            where: { id: threadId },
            data: { status: "WAITING", lastMessageAt: new Date() },
          })
        : await tx.emailThread.create({
            data: {
              subject,
              customerEmail: m.fromEmail,
              customerName: m.fromName,
              status: "WAITING",
              lastMessageAt: new Date(),
            },
          });
      await tx.emailMessage.create({
        data: {
          threadId: thread.id,
          direction: "INBOUND",
          fromAddr: m.fromEmail,
          toAddr: m.to ?? "service@haiwangzi.xyz",
          subject,
          bodyText: m.text ?? undefined,
          bodyHtml: m.html ?? undefined,
          messageId: m.messageId,
          inReplyTo: m.inReplyTo ?? undefined,
          references: m.references ?? undefined,
          status: "RECEIVED",
          attachments: (m.attachments ?? []) as unknown as Prisma.InputJsonValue,
        },
      });
      return thread.id;
    });
    return { ok: true, dedup: false, threadId: tid };
  } catch (e) {
    // 競態：messageId @unique 撞到 → 視為 dedup
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      return { ok: true, dedup: true };
    }
    throw e;
  }
}
