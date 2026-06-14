import { prisma } from "@/lib/prisma";

/**
 * 對話串比對 — 來源：haiwangzi-email-console bundle（src/lib/threading.ts）。
 * 調整：改用專案共用的 prisma 單例（@/lib/prisma），不再各自 new PrismaClient()。
 */

/** 正規化主旨，去掉 Re:/Fwd:/回覆: 前綴與空白，用於 fallback 比對 */
export function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(\s*(re|fwd|fw|回覆|轉寄)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

/**
 * 找出 inbound 信應該掛到哪個 thread。
 * 1) In-Reply-To / References 命中既有 messageId → 同串
 * 2) 同寄件人 + 正規化主旨 + 近 30 天 → 同串
 * 3) 都沒有 → 回 null（呼叫端開新串）
 */
export async function findThreadForInbound(params: {
  inReplyTo?: string | null;
  references?: string | null;
  customerEmail: string;
  subject: string;
}): Promise<string | null> {
  // 1) header 比對
  const refIds = [
    params.inReplyTo,
    ...(params.references?.split(/\s+/) ?? []),
  ].filter(Boolean) as string[];

  if (refIds.length) {
    const msg = await prisma.emailMessage.findFirst({
      where: { messageId: { in: refIds } },
      select: { threadId: true },
    });
    if (msg) return msg.threadId;
  }

  // 2) 寄件人 + 主旨 fallback
  const since = new Date(Date.now() - 30 * 864e5);
  const candidates = await prisma.emailThread.findMany({
    where: { customerEmail: params.customerEmail, lastMessageAt: { gte: since } },
    select: { id: true, subject: true },
    orderBy: { lastMessageAt: "desc" },
    take: 10,
  });
  const norm = normalizeSubject(params.subject);
  const hit = candidates.find((c) => normalizeSubject(c.subject) === norm);
  return hit?.id ?? null;
}
