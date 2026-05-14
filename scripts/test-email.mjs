// One-off test script — 用本地 GMAIL 帳密直接寄測試信
// 不寫進 git（已加 .gitignore），避免暴露 App Password
import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER || "neowu62@gmail.com";
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "rmnnlxkwwrmxcbbl").replace(/\s+/g, "");
const TO = process.argv[2] || "neowu@msi.com";

console.log(`[test-email] user=${GMAIL_USER} → to=${TO}`);

// 改用 587 + STARTTLS，因為某些網路會擋 465
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  connectionTimeout: 15000,
});

try {
  console.log("[test-email] verifying SMTP connection...");
  await transporter.verify();
  console.log("[test-email] ✓ SMTP connection OK");

  console.log("[test-email] sending...");
  const info = await transporter.sendMail({
    from: `"海王子潛水團" <${GMAIL_USER}>`,
    to: TO,
    subject: "✅ 海王子潛水團 Email 測試信 (autonomous overnight test)",
    text: `Hi,

這是過夜自主測試寄出的信。
時間：${new Date().toISOString()}
寄件：${GMAIL_USER}
通道：Gmail SMTP via nodemailer

如果你收到這封信 → 代表 GMAIL_USER + GMAIL_APP_PASSWORD 帳密正確，
未來在 Zeabur 設好相同 env vars 後，網站上的「寄測試信」按鈕也會成功。

— 海王子潛水團`,
    html: `<html><body style="font-family:sans-serif;background:#f4f6fa;padding:20px;">
<table style="background:#fff;border-radius:12px;padding:20px;max-width:600px;margin:auto;box-shadow:0 4px 16px rgba(10,35,66,0.08);">
<tr><td style="background:linear-gradient(135deg,#0A2342 0%,#1B3A5C 100%);color:#fff;padding:20px;border-radius:8px;">
<div style="font-size:11px;letter-spacing:0.3em;color:#00D9CB;">NEIL OCEAN PRINCE</div>
<div style="font-size:18px;font-weight:bold;margin-top:4px;">東北角海王子潛水團</div>
</td></tr>
<tr><td style="padding:20px;">
<p>Hi,</p>
<p style="color:#00D9CB;font-weight:bold;">✓ 過夜自主測試 Email 通道</p>
<p>如果您收到這封信，代表 Gmail SMTP 帳密正確。</p>
<table style="font-size:13px;line-height:1.8;">
<tr><td style="color:#6b7280;">時間</td><td>${new Date().toISOString()}</td></tr>
<tr><td style="color:#6b7280;">寄件</td><td>${GMAIL_USER}</td></tr>
<tr><td style="color:#6b7280;">收件</td><td>${TO}</td></tr>
<tr><td style="color:#6b7280;">通道</td><td>Gmail SMTP + nodemailer</td></tr>
</table>
<div style="margin-top:16px;padding:12px;background:#e6fffd;border-left:4px solid #00D9CB;border-radius:4px;font-size:12px;color:#0A2342;">
未來在 Zeabur 設好 GMAIL_USER + GMAIL_APP_PASSWORD 後，網站上的「📧 寄測試信」按鈕也會成功。
</div>
</td></tr>
</table></body></html>`,
  });

  console.log("[test-email] ✓ SENT!");
  console.log("  messageId:", info.messageId);
  console.log("  response: ", info.response);
  console.log("  accepted: ", info.accepted);
  console.log("  rejected: ", info.rejected);
} catch (e) {
  console.error("[test-email] ✗ FAILED");
  console.error("  error:", e.message);
  if (e.code) console.error("  code:", e.code);
  if (e.response) console.error("  response:", e.response);
  process.exit(1);
}
