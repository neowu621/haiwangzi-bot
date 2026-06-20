// Email 模板 — 純函式回傳 { subject, text, html }
// 設計原則：
//  - 簡單的 inline-style HTML（很多 email client 不吃 <style> tag）
//  - 一定要有 text 版本（spam filter 看的）
//  - 全繁體中文，避免被歸類為垃圾信
//  - 不要塞太多圖（也不要 hot-link，會被擋）

import { insuranceEmailSection, insuranceTextSection } from "@/lib/insurance"; // v582

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND_PHOSPHOR = "#00D9CB";
const BRAND_DEEP = "#0A2342";
const BRAND_MID = "#1B3A5C";
// v599：Email 按鈕一律導小編 LINE 官方帳號(LIFF 連結被 SES awstrack 追蹤包裝會打不開;line.me 轉址較耐包裝)
const LINE_OA = "https://line.me/R/ti/p/%40894bpmew";

function shell(title: string, bodyHtml: string): string {
  // v363：header 改純色（不用漸層，Outlook 也清楚顯示 logo）+ 加 color-scheme meta（深色模式不跑版）
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#1A2330;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f7" style="background-color:#eef2f7;">
    <tr><td align="center" style="padding:20px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e9f0;">
        <tr><td bgcolor="${BRAND_DEEP}" style="background-color:${BRAND_DEEP};padding:20px 28px;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;line-height:1.3;">🌊 東北角海王子潛水團</div>
          <div style="font-size:11px;letter-spacing:0.25em;color:${BRAND_PHOSPHOR};margin-top:3px;">SEA PRINCE DIVING</div>
        </td></tr>
        <tr><td style="padding:26px 28px;color:#1A2330;font-size:14px;line-height:1.7;">
          ${bodyHtml}
        </td></tr>
        <tr><td bgcolor="#f5f7fa" style="background-color:#f5f7fa;padding:16px 28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px 0;">這封信由系統自動發送，請勿直接回覆。</p>
          <p style="margin:0;">若有問題請在 LINE 官方帳號留言聯絡我們 🔱</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Templates ──────────────────────────────────────────────

export function testEmail(name: string): EmailContent {
  const subject = "✅ 海王子潛水團 Email 測試信";
  const text = `Hi ${name},

這是海王子潛水團的 Email 通知測試信。
如果你收到這封信，代表系統 Email 通道已經設定好了 🎉

— 海王子潛水團`;
  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 16px 0;">Hi ${escapeHtml(name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">這是海王子潛水團的 <b>Email 通知測試信</b>。</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">如果你收到這封信，代表系統 Email 通道已經設定好了 🎉</p>
    <div style="margin:24px 0;padding:16px;background:#e6fffd;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;font-size:13px;color:${BRAND_DEEP};">
      未來預約確認、行前通知、訂金/尾款提醒，都會用這個 email 寄出。
    </div>
    `,
  );
  return { subject, text, html };
}

export function bookingConfirmEmail(params: {
  name: string;
  type: "daily" | "tour";
  date: string;
  startTime?: string;
  title?: string;
  sites?: string[];
  participants: number;
  totalAmount: number;
  paidAmount: number;
  bookingId: string;
  meetingPoint?: string | null;
  notes?: string | null;
}): EmailContent {
  const typeLabel = params.type === "daily" ? "日潛場次" : "潛水團";
  const subject = `✓ 預約確認｜${typeLabel} ${params.date}${params.startTime ? " " + params.startTime : ""}`;
  const remaining = params.totalAmount - params.paidAmount;

  const lines: Array<[string, string]> = [
    ["類型", typeLabel],
    ["日期", params.date + (params.startTime ? ` ${params.startTime}` : "")],
  ];
  if (params.title) lines.push(["團名", params.title]);
  if (params.sites && params.sites.length > 0)
    lines.push(["潛點", params.sites.join(" · ")]);
  lines.push(["人數", `${params.participants} 人`]);
  lines.push(["總金額", `NT$ ${params.totalAmount.toLocaleString()}`]);
  if (params.paidAmount > 0)
    lines.push(["已付", `NT$ ${params.paidAmount.toLocaleString()}`]);
  if (remaining > 0)
    lines.push(["未付", `NT$ ${remaining.toLocaleString()}`]);
  if (params.meetingPoint) lines.push(["集合地點", params.meetingPoint]);
  if (params.notes) lines.push(["備註", params.notes]);

  const text =
    `Hi ${params.name},\n\n` +
    `你的預約已確認 ✓\n\n` +
    lines.map(([k, v]) => `  ${k}：${v}`).join("\n") +
    `\n\n預約編號：${params.bookingId.slice(0, 8)}\n\n` +
    `如要取消或修改，請在 LINE 官方帳號告訴我們。` +
    insuranceTextSection() + // v582：建議加保個人海域險
    `\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 20px 0;color:${BRAND_PHOSPHOR};font-weight:bold;">✓ 你的預約已確認</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}
    </table>
    ${
      remaining > 0
        ? `<div style="margin:20px 0 0 0;padding:14px;background:#fff8e6;border-left:4px solid #FFB800;border-radius:4px;font-size:13px;">
            <b style="color:#b45309;">未付金額 NT$ ${remaining.toLocaleString()}</b><br>
            請於約定時間前完成付款，付款方式請參考 LINE 訊息或店家公告。
          </div>`
        : ""
    }
    ${insuranceEmailSection()}
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0 0;">預約編號：${params.bookingId.slice(0, 8)}</p>
    `,
  );
  return { subject, text, html };
}

export function paymentReceivedEmail(params: {
  name: string;
  type: "deposit" | "final" | "full";
  amount: number;
  totalPaid: number;
  totalAmount: number;
  bookingTitle: string;
  bookingId: string;
}): EmailContent {
  const typeLabel =
    params.type === "deposit"
      ? "訂金"
      : params.type === "final"
        ? "尾款"
        : "全額";
  const subject = `✓ ${typeLabel}收款確認 NT$ ${params.amount.toLocaleString()}｜${params.bookingTitle}`;
  const remaining = params.totalAmount - params.totalPaid;

  const text =
    `Hi ${params.name},\n\n收到您的${typeLabel}匯款 ✓\n\n` +
    `項目：${params.bookingTitle}\n` +
    `本次入帳：NT$ ${params.amount.toLocaleString()}\n` +
    `已付金額：NT$ ${params.totalPaid.toLocaleString()} / ${params.totalAmount.toLocaleString()}\n` +
    (remaining > 0 ? `未付金額：NT$ ${remaining.toLocaleString()}\n` : "全部結清 🎉\n") +
    `\n預約編號：${params.bookingId.slice(0, 8)}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:${BRAND_PHOSPHOR};font-weight:bold;">
      ✓ 已收到您的${typeLabel}匯款
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">項目</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.bookingTitle)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">本次入帳</td><td style="padding:8px 0;font-weight:600;color:${BRAND_PHOSPHOR};font-size:16px;">NT$ ${params.amount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">已付</td><td style="padding:8px 0;font-weight:600;">NT$ ${params.totalPaid.toLocaleString()} / ${params.totalAmount.toLocaleString()}</td></tr>
      ${remaining > 0 ? `<tr><td style="padding:8px 0;color:#6b7280;width:90px;">未付</td><td style="padding:8px 0;font-weight:600;color:#FF7B5A;">NT$ ${remaining.toLocaleString()}</td></tr>` : ""}
    </table>
    ${
      remaining === 0
        ? `<div style="margin:20px 0;padding:14px;background:#e6fffd;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;text-align:center;">
            <div style="font-size:14px;font-weight:bold;color:${BRAND_DEEP};">🎉 已全部結清，期待與您一起下水！</div>
          </div>`
        : ""
    }
    <p style="font-size:11px;color:#6b7280;margin:16px 0 0 0;">預約編號：${params.bookingId.slice(0, 8)}</p>
    `,
  );
  return { subject, text, html };
}

export function refundEmail(params: {
  name: string;
  bookingCode: string;
  bookingTitle: string;
  refundAmount: number;
  method: "cash" | "credit";
  creditAmount?: number; // method=credit 時實際入帳抵用金（可能 ≠ refundAmount，例 110%）
  newCreditBalance?: number;
  reason: string;
}): EmailContent {
  const methodLabel = params.method === "cash" ? "退現金" : "轉抵用金";
  const subject = `🔄 退款通知 NT$ ${params.refundAmount.toLocaleString()}（${methodLabel}）｜${params.bookingCode}`;

  const isBonus = params.method === "credit" && params.creditAmount && params.creditAmount > params.refundAmount;
  const bonusPct = isBonus ? Math.round((params.creditAmount! / params.refundAmount) * 100) : 100;

  const text =
    `Hi ${params.name},\n\n您的退款已處理 ✓\n\n` +
    `訂單編號：${params.bookingCode}\n` +
    `行程：${params.bookingTitle}\n` +
    `退款金額：NT$ ${params.refundAmount.toLocaleString()}\n` +
    `處理方式：${methodLabel}` +
    (params.method === "credit"
      ? `\n抵用金入帳：NT$ ${params.creditAmount?.toLocaleString()}${isBonus ? `（${bonusPct}% 優惠）` : ""}` +
        (params.newCreditBalance !== undefined ? `\n目前抵用金餘額：NT$ ${params.newCreditBalance.toLocaleString()}` : "") +
        `\n\n抵用金可於下次預約折抵使用。`
      : `\n\n現金退款將於 1-3 個工作天內處理完成，請留意您的帳戶。`) +
    `\n\n退款原因：${params.reason}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:${BRAND_PHOSPHOR};font-weight:bold;">
      🔄 您的退款已處理
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:100px;">訂單編號</td><td style="padding:8px 0;font-weight:600;font-family:monospace;">${escapeHtml(params.bookingCode)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">行程</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.bookingTitle)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">退款金額</td><td style="padding:8px 0;font-weight:600;font-size:16px;color:${BRAND_PHOSPHOR};">NT$ ${params.refundAmount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">處理方式</td><td style="padding:8px 0;font-weight:600;">${methodLabel}${isBonus ? `（${bonusPct}% 優惠）` : ""}</td></tr>
      ${
        params.method === "credit"
          ? `<tr><td style="padding:8px 0;color:#6b7280;">抵用金入帳</td><td style="padding:8px 0;font-weight:600;color:${BRAND_PHOSPHOR};">NT$ ${params.creditAmount?.toLocaleString()}</td></tr>` +
            (params.newCreditBalance !== undefined
              ? `<tr><td style="padding:8px 0;color:#6b7280;">目前餘額</td><td style="padding:8px 0;font-weight:600;">NT$ ${params.newCreditBalance.toLocaleString()}</td></tr>`
              : "")
          : ""
      }
    </table>
    ${
      params.method === "credit"
        ? `<div style="margin:20px 0;padding:14px;background:#e6fffd;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;">
            <div style="font-size:13px;color:${BRAND_DEEP};">💎 抵用金可於下次預約時折抵使用。</div>
          </div>`
        : `<div style="margin:20px 0;padding:14px;background:#fff7ed;border-left:4px solid #FF7B5A;border-radius:4px;">
            <div style="font-size:13px;color:${BRAND_DEEP};">💰 現金退款將於 1-3 個工作天內處理完成。</div>
          </div>`
    }
    <p style="font-size:12px;color:#6b7280;margin:16px 0 0 0;">
      <span style="color:#374151;">退款原因：</span>${escapeHtml(params.reason)}
    </p>
    `,
  );
  return { subject, text, html };
}

export function broadcastEmail(params: {
  name: string;
  subject: string;
  bodyText: string;
}): EmailContent {
  // 自由格式：admin broadcast UI 自行填 subject + body
  const text = `Hi ${params.name},\n\n${params.bodyText}\n\n— 海王子潛水團`;
  const html = shell(
    params.subject,
    `
    <p style="font-size:16px;margin:0 0 16px 0;">Hi ${escapeHtml(params.name)},</p>
    <div style="font-size:14px;line-height:1.7;color:#374151;white-space:pre-line;">${escapeHtml(params.bodyText)}</div>
    `,
  );
  return { subject: params.subject, text, html };
}

/**
 * v256：Email 驗證信
 * 點下方按鈕 → 後端標記 emailVerifiedAt → 首單付款完成後自動領 100 元抵用金
 */
export function emailVerifyEmail(params: {
  name: string;
  verifyUrl: string;
  rewardAmount?: number; // 首單獎勵金額（顯示在 CTA 下方文字，不寫死）
}): EmailContent {
  const reward = params.rewardAmount ?? 100;
  const subject = "請驗證您的 Email — 海王子潛水團";
  const text = `Hi ${params.name},

感謝您加入海王子潛水團 🐳

請點擊下方連結驗證您的 Email：
${params.verifyUrl}

驗證後：
✓ 收到場次提醒、付款確認、行前通知
✓ 完成第一筆訂單活動後，隔天自動獲得 NT$${reward} 抵用金（下次潛水可用，使用期限 30 天）

此連結 7 天內有效。若您未申請此驗證，請忽略本信。

— 海王子潛水團`;
  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 16px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 18px 0;">
      感謝您加入海王子潛水團 🐳<br>
      請點擊下方按鈕驗證您的 Email。
    </p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${escapeHtml(params.verifyUrl)}"
         style="display:inline-block;padding:14px 32px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:24px;font-weight:bold;font-size:15px;letter-spacing:0.05em;">
        ✓ 驗證 Email
      </a>
    </div>
    <div style="background:#f0f9f7;border-left:4px solid ${BRAND_PHOSPHOR};padding:14px 16px;border-radius:6px;margin:18px 0;font-size:13px;color:#374151;line-height:1.6;">
      <b>驗證後可獲得：</b><br>
      ✓ 收到場次提醒、付款確認、行前通知<br>
      ✓ 完成第一筆訂單活動後，隔天自動獲得 <b style="color:${BRAND_DEEP};">NT$${reward}</b> 抵用金（下次潛水可用，使用期限 30 天）
    </div>
    <p style="font-size:12px;color:#9ca3af;margin:18px 0 0 0;line-height:1.6;">
      此連結 7 天內有效。若您未申請此驗證，請忽略本信。<br>
      若按鈕無法點擊，請複製此連結至瀏覽器：<br>
      <span style="word-break:break-all;color:#6b7280;">${escapeHtml(params.verifyUrl)}</span>
    </p>
    `,
  );
  return { subject, text, html };
}

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
