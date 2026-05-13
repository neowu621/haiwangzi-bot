import nodemailer, { type Transporter } from "nodemailer";

// Gmail SMTP via App Password
//
// 必要 env：
//   GMAIL_USER              寄件 Gmail 地址（你自己的 Gmail，例：neowu62@gmail.com）
//   GMAIL_APP_PASSWORD      Gmail App Password（16 字英數，*不是* Google 帳戶密碼）
//                           https://myaccount.google.com/apppasswords
//   EMAIL_FROM (optional)   顯示寄件人，預設 "海王子潛水團 <GMAIL_USER>"
//   EMAIL_REPLY_TO (opt)    回覆 to 地址
//
// 沒設 env 時自動 no-op (dev 安全)；正式環境必須在 Zeabur dashboard 設

const GMAIL_USER = process.env.GMAIL_USER ?? "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? "";

let _transporter: Transporter | null = null;

export function emailConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  if (!emailConfigured()) {
    throw new Error(
      "Email 未設定：請在環境變數加 GMAIL_USER + GMAIL_APP_PASSWORD",
    );
  }
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      // Gmail App Password 接受 "abcd efgh ijkl mnop" 或 "abcdefghijklmnop" 兩種格式
      pass: GMAIL_APP_PASSWORD.replace(/\s+/g, ""),
    },
  });
  return _transporter;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

const FROM_DEFAULT = process.env.EMAIL_FROM
  ? process.env.EMAIL_FROM
  : GMAIL_USER
    ? `"海王子潛水團" <${GMAIL_USER}>`
    : "";

const REPLY_TO_DEFAULT = process.env.EMAIL_REPLY_TO ?? GMAIL_USER ?? "";

/**
 * 寄信。沒設 env 時不 throw，回 { ok:false, skipped:true } 方便 cron 容錯。
 * 收件人 email 為空也直接 skip（user 沒填 email）。
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  if (!params.to || !params.to.includes("@")) {
    return { ok: false, skipped: true, reason: "no recipient email" };
  }
  if (!emailConfigured()) {
    // dev / 未設定環境 — 只 log
    console.log("[email] (skipped, no GMAIL_* env)", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, skipped: true, reason: "GMAIL_* env not configured" };
  }
  try {
    const info = await getTransporter().sendMail({
      from: FROM_DEFAULT,
      to: params.to,
      replyTo: params.replyTo ?? REPLY_TO_DEFAULT,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log("[email] sent", {
      to: params.to,
      subject: params.subject,
      messageId: info.messageId,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] FAILED", { to: params.to, error: msg });
    return { ok: false, error: msg };
  }
}
