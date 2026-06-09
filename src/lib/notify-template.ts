/**
 * v420：客戶模板通知共用 helper
 *
 * fire-and-forget：不阻塞呼叫端、自帶 try/catch（任何失敗只 log，不影響主流程）。
 * 尊重每位客戶的 notifyByLine / notifyByEmail opt-in。
 * 低頻事件用（退款/取消/駁回/升等/禮金/到期），一次查詢取 opt-in 旗標，無高頻負荷。
 *
 * 第三通道（站內訊息通知）：除了 LINE flex + Email，再寫一筆 Notification 進 App 內通知中心。
 * 站內通知預設「全開」、不受會員 opt-in（notifyByLine/notifyByEmail）控制 —
 * 即使客戶關掉 LINE/Email 通知，仍能在 App 內看到歷史通知。
 */
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import {
  buildFlexByKeyAsync,
  FLEX_TEMPLATE_LABELS,
  FLEX_TEMPLATE_META,
  type FlexTemplateKey,
} from "./flex";
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
  /**
   * 站內通知（第三通道）覆寫。
   *   - 省略：自動以 fallback 帶入（title/body/linkUrl 由 label/altText/params.liffUrl 推導）。
   *   - 物件：覆寫個別欄位（未給的欄位仍走 fallback）。
   *   - false：不寫站內通知。
   */
  inApp?: { title?: string; body?: string; linkUrl?: string } | false;
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

      // 站內訊息通知（第三通道）— 預設全開、不受 opt-in 控制；inApp:false 才略過
      if (opts.inApp !== false) {
        try {
          const fallbackTitle = FLEX_TEMPLATE_LABELS[opts.templateKey] ?? "通知";
          const fallbackLink =
            typeof opts.params.liffUrl === "string" ? opts.params.liffUrl : null;
          const icon = FLEX_TEMPLATE_META[opts.templateKey]?.icon ?? null;
          await prisma.notification.create({
            data: {
              userId: opts.userId,
              templateKey: opts.templateKey,
              title: opts.inApp?.title ?? fallbackTitle,
              body: opts.inApp?.body ?? opts.altText,
              linkUrl: opts.inApp?.linkUrl ?? fallbackLink,
              icon,
            },
          });
        } catch (e) {
          // 站內通知寫入失敗不應影響 LINE/Email；獨立 try/catch
          console.error(`[notifyCustomer inApp ${opts.templateKey}]`, e);
        }
      }
    } catch (e) {
      console.error(`[notifyCustomer ${opts.templateKey}]`, e);
    }
  })();
}
