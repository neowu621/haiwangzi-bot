import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findThreadForInbound } from "@/lib/email-threading";
import { deleteObject } from "@/lib/r2";

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

/**
 * v529：刪除對話串（含其所有信件 + R2 附件）。手動刪除與自動清除共用。
 *   EmailMessage 對 thread 是 onDelete:Cascade，刪 thread 會連信一起刪；
 *   R2 附件物件 DB 不會自動清，這裡先撈出 key 盡力刪除（失敗不影響 DB 刪除）。
 */
export async function purgeEmailThreads(ids: string[]): Promise<{ deletedThreads: number; deletedAttachments: number }> {
  if (!ids.length) return { deletedThreads: 0, deletedAttachments: 0 };
  let deletedAttachments = 0;
  const msgs = await prisma.emailMessage.findMany({
    where: { threadId: { in: ids } },
    select: { attachments: true, messageId: true, direction: true },
  });
  // 清 R2 附件
  for (const m of msgs) {
    const atts = Array.isArray(m.attachments) ? (m.attachments as unknown[]) : [];
    for (const a of atts) {
      const key = a && typeof a === "object" ? (a as { key?: string }).key : undefined;
      if (key) {
        try { await deleteObject("email", key); deletedAttachments++; } catch { /* 盡力刪，失敗不擋 */ }
      }
    }
  }
  // v532：把「收進來的(INBOUND)」訊息 Message-ID 記進墓碑 → 下次收信不會又被當新信收回來
  const inboundIds = msgs.filter((m) => m.direction === "INBOUND").map((m) => m.messageId);
  if (inboundIds.length) {
    await prisma.emailDeletedMsgId.createMany({
      data: inboundIds.map((messageId) => ({ messageId })),
      skipDuplicates: true,
    }).catch(() => { /* 墓碑寫入失敗不擋刪除 */ });
  }
  const res = await prisma.emailThread.deleteMany({ where: { id: { in: ids } } });
  return { deletedThreads: res.count, deletedAttachments };
}

export async function ingestInboundEmail(m: InboundEmail): Promise<IngestResult> {
  // 1) 冪等去重（at-least-once，同一封可能進來兩次）
  const exists = await prisma.emailMessage.findUnique({
    where: { messageId: m.messageId },
    select: { threadId: true },
  });
  if (exists) return { ok: true, dedup: true, threadId: exists.threadId };

  // 1.5) v532：已被後台刪除過的信 → 不要再收回來
  const tomb = await prisma.emailDeletedMsgId.findUnique({ where: { messageId: m.messageId }, select: { messageId: true } });
  if (tomb) return { ok: true, dedup: true };

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
