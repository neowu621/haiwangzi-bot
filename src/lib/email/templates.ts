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
    `Hi ${params.name},\n\n感謝你預約「${params.tourTitle}」🔱\n\n` +
    `為了保留你的名額，請於 7 天內 完成訂金匯款：\n\n` +
    lines.map(([k, v]) => `  ${k}：${v}`).join("\n") +
    `\n\n匯款後請到 LIFF App 上傳轉帳截圖：\n${params.bookingUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">感謝你預約「<b>${escapeHtml(params.tourTitle)}</b>」🔱</p>
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
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;">你的「<b>${escapeHtml(params.tourTitle)}</b>」即將出發 🔱</p>
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
  const subject = `🔱 行前通知｜${params.date}${params.time ? " " + params.time : ""}（${params.daysLeft} 天後出發）`;
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
    `Hi ${params.name},\n\n出發前 ${params.daysLeft} 天行前通知 🔱\n\n` +
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
      🔱 還剩 ${params.daysLeft} 天就要出發！
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

// 付款證明駁回
export function paymentRejectEmail(params: {
  name: string;
  bookingTitle: string;
  reason?: string;
  liffUrl: string;
}): EmailContent {
  const subject = `🚫 付款證明需重傳｜${params.bookingTitle}`;
  const text =
    `Hi ${params.name},\n\n您上傳的轉帳證明未能核對通過 🚫\n\n` +
    `訂單：${params.bookingTitle}\n` +
    (params.reason ? `原因：${params.reason}\n` : "") +
    `\n請依正確金額重新上傳轉帳截圖：\n${params.liffUrl}\n\n如有疑問歡迎 LINE 聯繫我們。\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#9a3412;font-weight:bold;">🚫 付款證明需要重傳</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">訂單</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.bookingTitle)}</td></tr>
      ${params.reason ? `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">原因</td><td style="padding:8px 0;color:#9a3412;">${escapeHtml(params.reason)}</td></tr>` : ""}
    </table>
    <div style="margin:16px 0;padding:14px;background:#fff0eb;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;font-size:13px;color:${BRAND_DEEP};">
      您上傳的轉帳證明未能核對通過，請依正確金額重新上傳轉帳截圖。如有疑問歡迎 LINE 聯繫我們。
    </div>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.liffUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">重新上傳截圖 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

// 訂單取消通知
export function bookingCancelEmail(params: {
  name: string;
  bookingTitle: string;
  reason?: string;
  liffUrl: string;
}): EmailContent {
  const subject = `❌ 預約已取消｜${params.bookingTitle}`;
  const text =
    `Hi ${params.name},\n\n您的這筆預約已取消 ❌\n\n` +
    `訂單：${params.bookingTitle}\n` +
    (params.reason ? `原因：${params.reason}\n` : "") +
    `\n若有任何疑問，歡迎直接 LINE 與我們聯繫。\n查看我的預約：\n${params.liffUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#9a3412;font-weight:bold;">❌ 您的預約已取消</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">訂單</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.bookingTitle)}</td></tr>
      ${params.reason ? `<tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">原因</td><td style="padding:8px 0;color:#9a3412;">${escapeHtml(params.reason)}</td></tr>` : ""}
    </table>
    <div style="margin:16px 0;padding:14px;background:#f1f5f9;border-radius:8px;font-size:13px;color:${BRAND_DEEP};">
      您的這筆預約已取消。若有任何疑問，歡迎直接 LINE 與我們聯繫。
    </div>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.liffUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">查看我的預約 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

// 退款完成通知
export function refundCompleteEmail(params: {
  name: string;
  bookingTitle: string;
  amount: number;
  method: "cash" | "credit";
}): EmailContent {
  const methodLabel = params.method === "credit" ? "🎁 抵用金" : "💵 現金退費";
  const subject = `✅ 退款已完成 NT$ ${params.amount.toLocaleString()}｜${params.bookingTitle}`;
  const text =
    `Hi ${params.name},\n\n您的退款已處理完成 ✅\n\n` +
    `訂單：${params.bookingTitle}\n` +
    `退款方式：${methodLabel}\n` +
    `退款金額：NT$ ${params.amount.toLocaleString()}\n\n感謝您的耐心。\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:${BRAND_PHOSPHOR};font-weight:bold;">✅ 您的退款已完成</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;vertical-align:top;">訂單</td><td style="padding:8px 0;font-weight:600;">${escapeHtml(params.bookingTitle)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">退款方式</td><td style="padding:8px 0;font-weight:600;">${methodLabel}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">退款金額</td><td style="padding:8px 0;font-weight:600;font-size:16px;color:${BRAND_PHOSPHOR};">NT$ ${params.amount.toLocaleString()}</td></tr>
    </table>
    <div style="margin:20px 0 0 0;padding:14px;background:#e6fffd;border-left:4px solid ${BRAND_PHOSPHOR};border-radius:4px;font-size:13px;color:${BRAND_DEEP};">
      您的退款已處理完成，感謝您的耐心。
    </div>
    `,
  );
  return { subject, text, html };
}

// VIP 升等通知
export function vipUpgradeEmail(params: {
  name: string;
  tierName: string;
  tierEmoji?: string;
  benefits?: string;
  liffUrl: string;
}): EmailContent {
  const emoji = params.tierEmoji ?? "🌟";
  const subject = `🌟 恭喜升等 ${params.tierName}！｜海王子潛水團`;
  const text =
    `Hi ${params.name},\n\n恭喜升等 ${params.tierName}！🌟\n\n` +
    `謝謝你一直跟著海王子潛水，已為你升級會員等級，享有更多專屬優惠。\n\n` +
    `會員等級：${emoji} ${params.tierName}\n` +
    (params.benefits ? `\n專屬權益：\n${params.benefits}\n` : "") +
    `\n查看我的會員：\n${params.liffUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px 0;color:#b45309;font-weight:bold;">🌟 恭喜升等 ${escapeHtml(params.tierName)}！</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#374151;">謝謝你一直跟著海王子潛水，已為你升級會員等級，享有更多專屬優惠。</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">會員等級</td><td style="padding:8px 0;font-weight:600;color:#b45309;">${emoji} ${escapeHtml(params.tierName)}</td></tr>
    </table>
    ${
      params.benefits
        ? `<div style="margin:16px 0;padding:14px;background:#fff8e6;border-left:4px solid #FFB800;border-radius:4px;font-size:13px;color:${BRAND_DEEP};">
            <b>專屬權益：</b><br>${escapeHtml(params.benefits).replace(/\n/g, "<br>")}
          </div>`
        : ""
    }
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.liffUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">查看我的會員 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

// 生日禮金發放
export function birthdayCreditEmail(params: {
  name: string;
  amount: number;
  expiryDays: number; // 0 = 永久
  liffUrl: string;
}): EmailContent {
  const effectiveText = params.expiryDays > 0 ? `${params.expiryDays} 天內有效` : "永久有效";
  const subject = `🎂 生日快樂！生日禮金 NT$ ${params.amount.toLocaleString()} 已到帳`;
  const text =
    `Hi ${params.name},\n\n生日快樂！🎂\n\n` +
    `祝你生日快樂！我們準備了一份生日禮金給你，已存入你的帳戶。\n\n` +
    `生日禮金：NT$ ${params.amount.toLocaleString()}\n` +
    `使用期限：${effectiveText}\n\n` +
    `立即使用禮金：\n${params.liffUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 16px 0;color:#b45309;font-weight:bold;">🎂 生日快樂！</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#374151;">祝你生日快樂！我們準備了一份生日禮金給你，已存入你的帳戶。</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">生日禮金</td><td style="padding:8px 0;font-weight:600;font-size:16px;color:#b45309;">NT$ ${params.amount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:90px;">使用期限</td><td style="padding:8px 0;font-weight:600;">${effectiveText}</td></tr>
    </table>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.liffUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">立即使用禮金 →</a>
    </p>
    `,
  );
  return { subject, text, html };
}

// 抵用金到期提醒
export function creditExpiryEmail(params: {
  name: string;
  amount: number;
  expireDate: string;
  liffUrl: string;
}): EmailContent {
  const subject = `💳 抵用金即將到期（${params.expireDate}）｜海王子潛水團`;
  const text =
    `Hi ${params.name},\n\n抵用金即將到期 💳\n\n` +
    `提醒你，帳戶內的抵用金即將到期，記得在期限前預約使用，別讓優惠過期囉！\n\n` +
    `可用抵用金：NT$ ${params.amount.toLocaleString()}\n` +
    `到期日：${params.expireDate}\n\n` +
    `立即預約使用：\n${params.liffUrl}\n\n— 海王子潛水團`;

  const html = shell(
    subject,
    `
    <p style="font-size:16px;margin:0 0 8px 0;">Hi ${escapeHtml(params.name)},</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#9a3412;font-weight:bold;">💳 抵用金即將到期</p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px 0;color:#374151;">提醒你，帳戶內的抵用金即將到期，記得在期限前預約使用，別讓優惠過期囉！</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:100px;">可用抵用金</td><td style="padding:8px 0;font-weight:600;font-size:16px;color:${BRAND_PHOSPHOR};">NT$ ${params.amount.toLocaleString()}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;width:100px;">到期日</td><td style="padding:8px 0;font-weight:600;color:#FF7B5A;">${escapeHtml(params.expireDate)}</td></tr>
    </table>
    <p style="margin:20px 0 0 0;text-align:center;">
      <a href="${escapeHtml(params.liffUrl)}" style="display:inline-block;padding:12px 24px;background:${BRAND_PHOSPHOR};color:${BRAND_DEEP};text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">立即預約使用 →</a>
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
