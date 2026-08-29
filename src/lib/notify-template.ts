/**
 * v420：客戶模板通知共用 helper
 * v480：全面改為「模板驅動」— LINE / Email / 站內通知 三通道內容
 *   全部由後台 /admin/templates 填寫的欄位 + message-content 單一組稿來源產生，
 *   保證後台「填寫資料」＝「實際發送內容」。
 *
 * fire-and-forget：不阻塞呼叫端、自帶 try/catch（任何失敗只 log，不影響主流程）。
 *
 * 通道開關（兩層，皆須通過）：
 *   1. 模板層：/admin/templates 的 LINE / Email / 站內 開關（未設則用 META 預設）
 *   2. 會員層：notifyByLine / notifyByEmail opt-in（站內通知不受會員 opt-in 控制）
 */
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import {
  buildFlexWithOverride,
  FLEX_TEMPLATE_LABELS,
  FLEX_TEMPLATE_META,
  type FlexTemplateKey,
} from "./flex";
import {
  composeEmail,
  composeFullBody,
  msgField,
  resolveLinkUrl,
  MSG_EDITABLE_FIELDS, // v862：判斷模板有沒有「按鈕文字」欄位
} from "./message-content";
import { sendEmail } from "./email/send";
import { logMessage, type MsgRef } from "./message-log"; // v473：發送紀錄 / v1053：訂單關聯
import { isQuietHours, quietHoursNote } from "./quiet-hours"; // v1069：安靜時段不推 LINE

// v600：Email 按鈕一律導小編 LINE 官方帳號 —— LIFF 連結被 Zeabur/SES awstrack 點擊追蹤
//   包成 awstrack.me 轉址後,LINE 深層連結會打不開;line.me/R/ti/p 通用連結較耐包裝。
//   (LINE flex 仍用原 LIFF,在 LINE 內正常;只有 Email 改導 OA。)
const EMAIL_LINK = "https://line.me/R/ti/p/%40894bpmew";

export function notifyCustomer(opts: {
  /** 客戶 lineUserId */
  userId: string;
  templateKey: FlexTemplateKey;
  /** 動態資料（場次/金額/連結等）— 與後台「內容主體」欄位一一對應 */
  params: Record<string, unknown>;
  /** 站內通知與 Email 按鈕連結覆寫；預設 params.url ?? params.liffUrl */
  linkUrl?: string;
  /** false = 不寫站內通知（罕用） */
  inApp?: false;
  /** true = LINE 已由呼叫端自行發送（例如 webhook reply），這裡只發 Email + 站內 */
  skipLine?: boolean;
  /** v1053：這則通知對應哪一筆訂單/場次 —— 三個通道的發送紀錄都會帶上，後台才查得到來源 */
  ref?: MsgRef | null;
  /**
   * v1069：true = 這是「系統自動發」的（cron 提醒、天氣取消、生日禮金…），
   * 安靜時段（09:00–22:00 以外）不推 LINE，改只走 Email + 站內。
   * 客戶自己剛做完動作而產生的回覆不要帶這個 —— 他正在等，該立刻收到。
   */
  respectQuietHours?: boolean;
}): void {
  void (async () => {
    try {
      const key = opts.templateKey;
      const user = await prisma.user.findUnique({
        where: { lineUserId: opts.userId },
        select: { notifyByLine: true, notifyByEmail: true, email: true, displayName: true, realName: true },
      });
      if (!user) return;

      // 模板 override（單次查詢；LINE flex / Email / 站內 全部共用）
      const tpl = await prisma.messageTemplate.findUnique({ where: { key } });
      const meta = FLEX_TEMPLATE_META[key];
      const lineOn = tpl?.lineEnabled ?? meta?.defaultLine ?? true;
      const emailOn = tpl?.emailEnabled ?? meta?.defaultEmail ?? true;
      const inAppOn = tpl?.inAppEnabled ?? meta?.defaultInApp ?? true;

      const who = user.realName ?? user.displayName ?? opts.userId;
      const label = FLEX_TEMPLATE_LABELS[key] ?? "通知";
      // 通知列文字（altText）＝後台「通知列文字」欄位（含預設）
      const altText = msgField(key, "altText", tpl) || label;
      // v794：站內通知連結 —— 後台填了「按鈕連結」(buttonUrl,任一模板)就用它；
      //   否則到場確認退回 Google 評論預設、其餘退回 resolveLinkUrl(params)。
      const savedBtnUrl = tpl?.buttonUrl && tpl.buttonUrl.length > 0 ? tpl.buttonUrl : null;
      const attendanceDefault =
        typeof opts.params?.reviewUrl === "string" && opts.params.reviewUrl
          ? opts.params.reviewUrl
          : "https://maps.app.goo.gl/L58ukZuJroo5vbjv5";
      const linkUrl =
        opts.linkUrl ??
        savedBtnUrl ??
        (key === "attendance_confirmed" ? attendanceDefault : resolveLinkUrl(opts.params));

      // v1032：站內通知 —— 客人已在 App 內，若連結是本站 LIFF 深連結就換成站內路徑
      //   （原本用 liff.line.me/... 會「重新開一次 App」，會閃爍/重載）
      const toInAppPath = (u: string | null): string | null => {
        if (!u) return u;
        const m = u.match(/^https?:\/\/liff\.line\.me\/[^/]+(\/.*)?$/);
        if (!m) return u; // 外部連結(如 Google 評論)照舊
        const path = (m[1] ?? "").replace(/^\/+/, "");
        return path ? `/liff/${path}` : "/liff/home";
      };

      // ── LINE flex ──
      // v1069：系統自動發送在安靜時段跳過 LINE（Email/站內照發，隔天看得到）
      const quiet = !!opts.respectQuietHours && isQuietHours();
      if (quiet) {
        logMessage({ channel: "line", templateKey: key, recipientId: opts.userId, recipient: who, title: altText, status: "skipped", error: quietHoursNote(), source: "notify", ref: opts.ref ?? null });
      }
      if (!quiet && !opts.skipLine && lineOn && (user.notifyByLine ?? true)) {
        const lineClient = getLineClient();
        if (lineClient) {
          try {
            const flex = buildFlexWithOverride(key, opts.params, altText, tpl);
            await lineClient.pushMessage({ to: opts.userId, messages: [flex] });
            logMessage({ channel: "line", templateKey: key, recipientId: opts.userId, recipient: who, title: altText, status: "sent", source: "notify", ref: opts.ref ?? null });
          } catch (e) {
            logMessage({ channel: "line", templateKey: key, recipientId: opts.userId, recipient: who, title: altText, status: "failed", error: e instanceof Error ? e.message : String(e), source: "notify", ref: opts.ref ?? null });
          }
        }
      }

      // ── Email（模板組稿：標題/副標/說明/動態主體/按鈕 與後台填寫一致）──
      if (emailOn && (user.notifyByEmail ?? true) && user.email) {
        // v600：Email 按鈕一律導小編 LINE OA(避開 awstrack 追蹤破壞 LIFF)
        const params = { ...opts.params, url: EMAIL_LINK };
        const content = composeEmail(key, params, tpl);
        const r = await sendEmail({ to: user.email, subject: content.subject, text: content.text, html: content.html });
        logMessage({ channel: "email", templateKey: key, recipientId: opts.userId, recipient: user.email, title: content.subject, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error ?? null, source: "notify", ref: opts.ref ?? null });
      }

      // ── 站內訊息通知（標題＝後台「標題」欄位；內文＝完整組稿）──
      // 不受會員 opt-in（notifyByLine/notifyByEmail）影響
      if (opts.inApp !== false && inAppOn) {
        try {
          const title = msgField(key, "title", tpl) || label;
          const body = composeFullBody(key, opts.params, tpl) || altText;
          const icon = meta?.icon ?? null;
          // v862：站內按鈕文字＝後台模板的「按鈕文字」（與 LINE/Email 同一份設定）。
          //   規則：模板有「按鈕文字」欄位但老闆清空 → 視為「這則不放按鈕」→ 站內不給連結，
          //   只顯示「訊息已閱讀，關閉」。模板根本沒有該欄位 → 留 null，前端用預設「前往查看 →」。
          const hasBtnField = (MSG_EDITABLE_FIELDS[key] ?? []).some((f) => f.key === "buttonLabel");
          const rawBtn = hasBtnField ? msgField(key, "buttonLabel", tpl).trim() : "";
          const suppressBtn = hasBtnField && rawBtn === "";
          const inAppLink = suppressBtn ? null : toInAppPath(linkUrl); // v1032：站內用站內路徑
          // v994：第二顆按鈕（目前僅到場確認：「有需要改善?告訴我們」→ 站內客服，帶場次自動起手）
          let link2: string | null = null;
          let btn2: string | null = null;
          const rawBtn2 = msgField(key, "button2Label", tpl).trim();
          if (key === "attendance_confirmed" && rawBtn2) {
            const sess = typeof opts.params?.bookingTitle === "string" ? opts.params.bookingTitle : "";
            // 站內：客人已在 App 內 → 用內部路徑導頁(非 liff.line.me 深連結)，帶場次自動起手
            link2 = `/liff/messages?fb=1&s=${encodeURIComponent(sess)}`;
            btn2 = rawBtn2;
          }
          await prisma.notification.create({
            data: {
              userId: opts.userId,
              templateKey: key,
              title,
              body,
              linkUrl: inAppLink,
              buttonLabel: inAppLink ? rawBtn || null : null,
              linkUrl2: link2,
              buttonLabel2: btn2,
              icon,
            },
          });
          logMessage({ channel: "inapp", templateKey: key, recipientId: opts.userId, recipient: who, title, status: "sent", source: "notify", ref: opts.ref ?? null });
        } catch (e) {
          // 站內通知寫入失敗不應影響 LINE/Email；獨立 try/catch
          console.error(`[notifyCustomer inApp ${key}]`, e);
        }
      }
    } catch (e) {
      console.error(`[notifyCustomer ${opts.templateKey}]`, e);
    }
  })();
}
