/**
 * v420：客戶模板通知共用 helper
 *
 * fire-and-forget：不阻塞呼叫端、自帶 try/catch（任何失敗只 log，不影響主流程）。
 * 尊重每位客戶的 notifyByLine / notifyByEmail opt-in。
 * 低頻事件用（退款/取消/駁回/升等/禮金/到期），一次查詢取 opt-in 旗標，無高頻負荷。
 */
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import { buildFlexByKeyAsync, type FlexTemplateKey } from "./flex";
import { sendEmail } from "./email/send";
import type { EmailContent } from "./email/templates";

export function notifyCustomer(opts: {
  /** 客戶 lineUserId */
  userId: string;
  templateKey: FlexTemplateKey;
  params: Record<string, unknown>;
  altText: string;
  /** email 內容：直接給 EmailContent，或給一個 (客戶名)=>EmailContent 的 builder；不給則不寄 email */
  email?: EmailContent | ((name: string) => EmailContent);
}): void {
  void (async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId: opts.userId },
        select: { notifyByLine: true, notifyByEmail: true, email: true, displayName: true, realName: true },
      });
      if (!user) return;

      // LINE flex
      if (user.notifyByLine ?? true) {
        const lineClient = getLineClient();
        if (lineClient) {
          const flex = await buildFlexByKeyAsync(opts.templateKey, opts.params, opts.altText);
          await lineClient.pushMessage({ to: opts.userId, messages: [flex] });
        }
      }

      // Email
      if (opts.email && (user.notifyByEmail ?? true) && user.email) {
        const name = user.realName ?? user.displayName ?? "您";
        const content = typeof opts.email === "function" ? opts.email(name) : opts.email;
        await sendEmail({ to: user.email, subject: content.subject, text: content.text, html: content.html });
      }
    } catch (e) {
      console.error(`[notifyCustomer ${opts.templateKey}]`, e);
    }
  })();
}
