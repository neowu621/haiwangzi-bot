// v561：把客人傳到 LINE 官方帳號的文字訊息,收進客服信箱(channel=line 的對話串)。
//   一位 LINE 客人共用一條「未結案」對話串;後台可在客服信箱用 LINE push 直接回。
import { prisma } from "@/lib/prisma";

export async function ingestLineMessage(p: {
  lineUserId: string;
  displayName?: string | null;
  text: string;
  lineMessageId: string;
}): Promise<void> {
  const messageId = `<line-${p.lineMessageId}@line>`;
  // 去重(同一則 LINE message 只收一次)
  const exists = await prisma.emailMessage.findUnique({ where: { messageId }, select: { id: true } });
  if (exists) return;

  const name = p.displayName || `LINE 用戶 ${p.lineUserId.slice(0, 6)}`;
  const snippet = p.text.replace(/\s+/g, " ").slice(0, 60) || "（LINE 訊息）";

  // 找這位 LINE 客人「未結案」的對話串,沒有就開新的
  let thread = await prisma.emailThread.findFirst({
    where: { channel: "line", lineUserId: p.lineUserId, status: { not: "CLOSED" } },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!thread) {
    thread = await prisma.emailThread.create({
      data: {
        subject: `LINE：${snippet}`,
        customerEmail: `line:${p.lineUserId}`, // LINE 無 email → sentinel
        customerName: name,
        channel: "line",
        lineUserId: p.lineUserId,
        status: "WAITING",
        tags: ["LINE 詢問"],
        lastMessageAt: new Date(),
      },
    });
  }

  await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      channel: "line",
      fromAddr: p.lineUserId,
      toAddr: "line-oa",
      subject: thread.subject,
      bodyText: p.text,
      messageId,
      status: "RECEIVED",
    },
  });

  await prisma.emailThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), status: "WAITING", customerName: name },
  });
}
