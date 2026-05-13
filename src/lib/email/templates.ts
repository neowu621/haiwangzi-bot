// Email 模板 — 純函式回傳 { subject, text, html }
// 設計原則：
//  - 簡單的 inline-style HTML（很多 email client 不吃 <style> tag）
//  - 一定要有 text 版本（spam filter 看的）
//  - 全繁體中文，避免被歸類為垃圾信
//  - 不要塞太多圖（也不要 hot-link，會被擋）

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const BRAND_PHOSPHOR = "#00D9CB";
const BRAND_DEEP = "#0A2342";
const BRAND_MID = "#1B3A5C";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fa;font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#0A2342;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;padding:20px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(10,35,66,0.08);">
        <tr><td style="background:linear-gradient(135deg,${BRAND_DEEP} 0%,${BRAND_MID} 100%);padding:24px 28px;color:#fff;">
          <div style="font-size:11px;letter-spacing:0.3em;color:${BRAND_PHOSPHOR};">NEIL OCEAN PRINCE</div>
          <div style="font-size:20px;font-weight:bold;letter-spacing:0.1em;margin-top:4px;">東北角海王子潛水團</div>
        </td></tr>
        <tr><td style="padding:28px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:#f8f9fb;padding:16px 28px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px 0;">這封信由系統自動發送，請勿直接回覆。</p>
          <p style="margin:0;">若有問題請在 LINE 官方帳號留言聯絡我們 🤿</p>
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
    `如要取消或修改，請在 LINE 官方帳號告訴我們。\n\n— 海王子潛水團`;

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
    <p style="font-size:12px;color:#6b7280;margin:20px 0 0 0;">預約編號：${params.bookingId.slice(0, 8)}</p>
    `,
  );
  return { subject, text, html };
}

export function depositReminderEmail(params: {
  name: string;
  tourTitle: string;
  deposit: number;
  deadline: string | null;
  bankAccount: string;
  bookingUrl: string;
}): EmailContent {
  const subject = `🔔 訂金繳費提醒｜${params.tourTitle}`;
  const lines: Array<[string, string]> = [
    ["團名", params.tourTitle],
    ["訂金", `NT$ ${params.deposit.toLocaleString()}`],
  ];
  if (params.deadline) lines.push(["繳費截止", params.deadline]);
  lines.push(["匯款帳號", params.bankAccount]);

  const text =
    `Hi ${params.name},\n\n感謝你預約「${params.tourTitle}」🤿\n\n` +
    `為了保留你的名額，請於 7 天內 完成訂金匯款：\n\n` +
    lines.map(([k, v]) => `  ${k}：${v}`).join("\n") +
    `\n\n匯款後請到 LIFF App 上傳轉帳截圖：\n${params.bookingUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">感謝你預約「<b>${escapeHtml(params.tourTitle)}</b>」🤿</p>
    <div style="margin:16px 0;padding:14px;background:#fff8e6;border-left:4px solid #FFB800;border-radius:4px;">
      <div style="font-size:13px;font-weight:bold;color:#b45309;">⚠ 請於 7 天內完成訂金匯款以保留名額</div>
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.bookingUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">上傳轉帳截圖 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

export function finalReminderEmail(params: {
  name: string;
  tourTitle: string;
  remaining: number;
  deadline: string | null;
  daysLeft: number;
  bankAccount: string;
  bookingUrl: string;
}): EmailContent {
  const subject = `💰 尾款繳費提醒｜${params.tourTitle}（出發前 ${params.daysLeft} 天）`;
  const lines: Array<[string, string]> = [
    ["團名", params.tourTitle],
    ["未付", `NT$ ${params.remaining.toLocaleString()}`],
  ];
  if (params.deadline) lines.push(["繳費截止", params.deadline]);
  lines.push(["匯款帳號", params.bankAccount]);

  const text =
    `Hi ${params.name},\n\n你的「${params.tourTitle}」即將出發！\n` +
    `請於出發前 ${params.daysLeft} 天完成尾款匯款：\n\n` +
    lines.map(([k, v]) => `  ${k}：${v}`).join("\n") +
    `\n\n匯款後請到 LIFF App 上傳轉帳截圖：\n${params.bookingUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">你的「<b>${escapeHtml(params.tourTitle)}</b>」即將出發 🤿</p>
    <div style="margin:16px 0;padding:14px;background:#fff0eb;border-left:4px solid #FF7B5A;border-radius:4px;">
      <div style="font-size:13px;font-weight:bold;color:#9a3412;">⏰ 還剩 ${params.daysLeft} 天，請完成尾款</div>
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}
    </table>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.bookingUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">上傳轉帳截圖 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

export function tripGuideEmail(params: {
  name: string;
  date: string;
  time?: string;
  site: string;
  meetingPoint?: string | null;
  weather?: string;
  notes?: string | null;
  daysLeft: number;
}): EmailContent {
  const subject = `🤿 行前通知｜${params.date}${params.time ? " " + params.time : ""}（${params.daysLeft} 天後出發）`;
  const lines: Array<[string, string]> = [
    ["日期", params.date + (params.time ? ` ${params.time}` : "")],
    ["潛點", params.site],
  ];
  if (params.meetingPoint) lines.push(["集合地點", params.meetingPoint]);
  if (params.weather) lines.push(["預報海況", params.weather]);

  const checklist = [
    "證照卡 + 潛水紀錄",
    "防寒衣（建議 5mm，水溫低時用 7mm）",
    "防曬油、毛巾、換洗衣物",
    "暈船藥（若會暈船請出發前 30 分鐘服用）",
    "保險證件",
  ];

  const text =
    `Hi ${params.name},\n\n出發前 ${params.daysLeft} 天行前通知 🤿\n\n` +
    lines.map(([k, v]) => `  ${k}：${v}`).join("\n") +
    `\n\n【裝備清單】\n` +
    checklist.map((c) => `  □ ${c}`).join("\n") +
    (params.notes ? `\n\n【場次備註】\n${params.notes}` : "") +
    `\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:${BRAND_PHOSPHOR};font-weight:bold;">
      🤿 還剩 ${params.daysLeft} 天就要出發！
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}
    </table>
    <div style="margin:20px 0;padding:14px;background:#f1f5f9;border-radius:8px;">
      <div style="font-size:13px;font-weight:bold;color:${BRAND_DEEP};margin-bottom:8px;">📋 裝備清單</div>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:#374151;">
        ${checklist.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul>
    </div>
    ${
      params.notes
        ? `<div style="margin:16px 0;padding:14px;background:#e6fffd;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;font-size:13px;">
            <b>場次備註：</b><br>${escapeHtml(params.notes).replace(/\n/g, "<br>")}
          </div>`
        : ""
    }
    `,
  );
  return { subject, text, html };
}

export function weatherCancelEmail(params: {
  name: string;
  date: string;
  time: string;
  site: string;
  reason: string;
  options?: string;
  url?: string;
}): EmailContent {
  const subject = `⚠ 場次取消（海況不佳）｜${params.date} ${params.time}`;
  const optionsText = params.options ?? "1. 改期至下次同類型場次\n2. 全額退費";

  const text =
    `Hi ${params.name},\n\n很抱歉，您 ${params.date} ${params.time} 的場次必須取消 😞\n\n` +
    `潛點：${params.site}\n原因：${params.reason}\n\n` +
    `【後續處理選項】\n${optionsText}\n\n` +
    `請至 LIFF App 查看訂單狀態${params.url ? `：${params.url}` : ""}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#9a3412;font-weight:bold;">
      ⚠ 很抱歉，您的場次必須取消
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">日期</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.date)} ${escapeHtml(params.time)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">潛點</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.site)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">原因</td><td style="padding:8px 0;">${escapeHtml(params.reason)}</td></tr>
    </table>
    <div style="margin:20px 0;padding:14px;background:#fff8e6;border-left:4px solid #FFB800;border-radius:4px;">
      <div style="font-size:13px;font-weight:bold;color:#b45309;margin-bottom:6px;">後續處理選項</div>
      <div style="font-size:13px;color:#374151;white-space:pre-line;">${escapeHtml(optionsText)}</div>
    </div>
    ${
      params.url
        ? `<p style="margin:20px 0 0 0;text-align:center;">
            <a href="${escapeHtml(params.url)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">查看訂單 →</a>
          </p>`
        : ""
    }
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

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
