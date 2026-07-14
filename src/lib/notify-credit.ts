// v610：抵用金異動統一通知 —— 任何抵用金變更（入帳 / 扣抵 / 退還 / 作廢）都通知會員。
//
// 通道由 SiteConfig 控制（後台可調）：creditNotifyLine / creditNotifyEmail / creditNotifyInApp
//   預設：LINE 關、Email 開、站內 開。
// LINE/Email 仍尊重會員個人 opt-in（notifyByLine / notifyByEmail）；站內一律寫。
//
// fire-and-forget：不阻塞呼叫端、自帶 try/catch（失敗只 log）。
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import { sendEmail } from "./email/send";

const LINE_OA = "https://line.me/R/ti/p/%40894bpmew"; // 小編 LINE（Email 按鈕導向）

const REASON_LABEL: Record<string, string> = {
  birthday: "生日禮金",
  vip_upgrade: "VIP 升等獎勵",
  vip_overflow: "VIP 回饋",
  refund: "退款／退還",
  used: "訂單折抵",
  admin_adjust: "客服調整",
  first_order_reward: "首單獎勵",
  signup_reward: "註冊禮金",
  early_bird: "早鳥回饋",
  expired: "到期作廢",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
}

export function notifyCreditChange(args: {
  userId: string;
  amount: number; // + 入帳 / - 扣抵
  balanceAfter: number;
  reason: string;
  note?: string | null;
  expiresAt?: Date | null;
}): void {
  void (async () => {
    try {
      if (!args.amount) return; // 0 不通知

      const cfg = await prisma.siteConfig.findUnique({
        where: { id: "default" },
        select: { creditNotifyLine: true, creditNotifyEmail: true, creditNotifyInApp: true } as never,
      });
      const c = cfg as unknown as { creditNotifyLine?: boolean; creditNotifyEmail?: boolean; creditNotifyInApp?: boolean } | null;
      const wantLine = c?.creditNotifyLine ?? false;
      const wantEmail = c?.creditNotifyEmail ?? true;
      const wantInApp = c?.creditNotifyInApp ?? true;
      if (!wantLine && !wantEmail && !wantInApp) return;

      const user = await prisma.user.findUnique({
        where: { lineUserId: args.userId },
        select: { notifyByLine: true, notifyByEmail: true, email: true, displayName: true, realName: true },
      });
      if (!user) return;

      const isAdd = args.amount > 0;
      const abs = Math.abs(args.amount).toLocaleString();
      const sign = isAdd ? "+" : "−";
      const rLabel = REASON_LABEL[args.reason] ?? "";
      const title = isAdd ? "🎁 抵用金入帳通知" : "抵用金異動通知";
      const line1 = isAdd
        ? `您獲得抵用金 ${sign}NT$${abs}${rLabel ? `（${rLabel}）` : ""}`
        : `您的抵用金異動 ${sign}NT$${abs}${rLabel ? `（${rLabel}）` : ""}`;
      const line2 = `目前抵用金餘額：NT$${args.balanceAfter.toLocaleString()}`;
      const line3 = isAdd && args.expiresAt ? `有效期限：${fmtDate(args.expiresAt)}` : isAdd ? "有效期限：永久" : "";
      // v846：入帳時建議下次潛水使用（只在有餘額可用時提示）
      const suggest = isAdd && args.balanceAfter > 0 ? "💡 下次潛水預約時可直接折抵，記得使用喔！" : "";
      const bodyText = [line1, line2, line3, suggest].filter(Boolean).join("\n");

      // ── LINE ──
      if (wantLine && (user.notifyByLine ?? true)) {
        try {
          const client = getLineClient();
          if (client) {
            await client.pushMessage({ to: args.userId, messages: [{ type: "text", text: `${title}\n\n${bodyText}` }] });
          }
        } catch (e) {
          console.error("[notifyCreditChange line]", e);
        }
      }

      // ── Email ──
      if (wantEmail && (user.notifyByEmail ?? true) && user.email) {
        try {
          const who = user.realName ?? user.displayName ?? "會員";
          const html = `
<div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;color:#0A2342">
  <h2 style="color:#0A2342;font-size:18px;margin:0 0 4px">${title}</h2>
  <p style="color:#6b7280;font-size:13px;margin:0 0 16px">${who} 您好，您的抵用金有一筆異動：</p>
  <div style="background:#fff8ec;border:1px solid #f3d8a0;border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:22px;font-weight:800;color:${isAdd ? "#0a8f86" : "#c0392b"}">${sign}NT$${abs}</div>
    ${rLabel ? `<div style="font-size:13px;color:#9a6a18;margin-top:2px">${rLabel}</div>` : ""}
    <div style="font-size:14px;color:#0A2342;margin-top:10px">目前抵用金餘額：<b>NT$${args.balanceAfter.toLocaleString()}</b></div>
    ${line3 ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">${line3}</div>` : ""}
    ${suggest ? `<div style="font-size:12.5px;color:#0a8f86;font-weight:700;margin-top:10px">${suggest}</div>` : ""}
  </div>
  <a href="${LINE_OA}" style="display:inline-block;background:#06c755;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:8px;font-size:14px">有問題？聯絡小編 →</a>
</div>`;
          await sendEmail({ to: user.email, subject: `${title} — 東北角海王子潛水`, text: bodyText, html });
        } catch (e) {
          console.error("[notifyCreditChange email]", e);
        }
      }

      // ── 站內 ──
      if (wantInApp) {
        try {
          await prisma.notification.create({
            data: {
              userId: args.userId,
              templateKey: "credit_change",
              title,
              body: bodyText,
              // v846：入帳且有餘額 → 導「預約潛水」直接使用；其餘導「我的抵用金」
              linkUrl: isAdd && args.balanceAfter > 0 ? "/liff/booking" : "/liff/my",
              icon: isAdd ? "🎁" : "💳",
            },
          });
        } catch (e) {
          console.error("[notifyCreditChange inApp]", e);
        }
      }
    } catch (e) {
      console.error("[notifyCreditChange]", e);
    }
  })();
}
