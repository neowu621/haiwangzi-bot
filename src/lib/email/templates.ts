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

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
