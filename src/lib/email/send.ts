import nodemailer, { type Transporter } from "nodemailer";
import { getSocialFooter } from "../social-footer"; // v344
import { prisma } from "../prisma";
import { sendViaZsend, zsendConfigured } from "./zsend"; // v470：ZSend 備用路徑

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

/** Gmail SMTP 是否設定齊全 */
export function gmailConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

/** 任一寄信路徑可用即視為已設定（Gmail 或 ZSend 備用）*/
export function emailConfigured(): boolean {
  return gmailConfigured() || zsendConfigured();
}

// v470：Email 發送路徑（後台可選）。
//   gmail   = 只用 Gmail（現況預設）
//   zsend   = 只用 ZSend
//   fallback= 主要 Gmail，失敗自動改用 ZSend（備用）
export type EmailProvider = "gmail" | "zsend" | "fallback";

async function resolveEmailProvider(): Promise<EmailProvider> {
  try {
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: "default" },
      select: { emailProvider: true } as never,
    });
    const v = (cfg as unknown as { emailProvider?: string } | null)?.emailProvider;
    if (v === "zsend" || v === "fallback" || v === "gmail") return v;
  } catch {
    /* DB 讀不到 → 用預設 gmail */
  }
  return "gmail";
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
    // 防卡死：SMTP 連線 / 握手 / 傳輸逾時（避免卡住 worker）
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return _transporter;
}

// v784：Email 寄信診斷（給 /api/healthz?email=1 用）。
//   只回布林與錯誤訊息，不外洩任何金鑰值。verify() 會實際對 Gmail SMTP 登入(不寄信)，
//   能區分「env 沒設」vs「App Password 錯/被撤銷」。
export async function verifyEmailTransport(): Promise<{
  gmailUserSet: boolean;
  gmailPasswordSet: boolean;
  gmailConfigured: boolean;
  zsendConfigured: boolean;
  verify: "ok" | "skipped" | string;
}> {
  const base = {
    gmailUserSet: Boolean(GMAIL_USER),
    gmailPasswordSet: Boolean(GMAIL_APP_PASSWORD),
    gmailConfigured: gmailConfigured(),
    zsendConfigured: zsendConfigured(),
  };
  if (!gmailConfigured()) return { ...base, verify: "skipped" };
  try {
    await getTransporter().verify();
    return { ...base, verify: "ok" };
  } catch (e) {
    return { ...base, verify: e instanceof Error ? e.message : String(e) };
  }
}

export interface SendEmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: SendEmailAttachment[];
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
    console.log("[email] (skipped, no email provider configured)", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, skipped: true, reason: "no email provider configured (GMAIL_* / ZSEND_*)" };
  }
  // v344：在 html 結尾自動附加社群連結 footer（FB / YT / IG）
  let htmlWithFooter = params.html;
  if (htmlWithFooter) {
    try {
      const footer = await getSocialFooter();
      if (footer.emailHtml) htmlWithFooter = htmlWithFooter + footer.emailHtml;
    } catch {
      // footer 失敗不影響主訊息
    }
  }
  const finalParams = { ...params, html: htmlWithFooter };

  // v470：依後台設定選發送路徑
  const provider = await resolveEmailProvider();

  // ZSend 只用 ZSend
  if (provider === "zsend") {
    if (!zsendConfigured()) return { ok: false, error: "已選 ZSend 但未設定 ZSEND_API_KEY / ZSEND_FROM" };
    return toResult(await sendViaZsend(finalParams), "zsend", params);
  }

  // fallback：先 Gmail，失敗或未設定再 ZSend
  if (provider === "fallback") {
    if (gmailConfigured()) {
      const g = await sendViaGmail(finalParams);
      if (g.ok) return g;
      console.warn("[email] Gmail 失敗，改用 ZSend 備用", { error: g.error });
    }
    if (zsendConfigured()) return toResult(await sendViaZsend(finalParams), "zsend(fallback)", params);
    return { ok: false, error: "Gmail 與 ZSend 皆無法寄送" };
  }

  // 預設 gmail
  if (gmailConfigured()) return sendViaGmail(finalParams);
  // gmail 未設定但 zsend 可用 → 用 zsend 保底
  if (zsendConfigured()) return toResult(await sendViaZsend(finalParams), "zsend(auto)", params);
  return { ok: false, error: "Gmail 未設定" };
}

function toResult(
  r: { ok: boolean; messageId?: string; error?: string },
  via: string,
  params: SendEmailParams,
): SendEmailResult {
  if (r.ok) {
    console.log("[email] sent", { to: params.to, subject: params.subject, via, messageId: r.messageId });
  } else {
    console.error("[email] FAILED", { to: params.to, via, error: r.error });
  }
  return r;
}

/** Gmail SMTP 寄送（原 sendEmail 邏輯） */
async function sendViaGmail(params: SendEmailParams): Promise<SendEmailResult> {
  try {
    const info = await getTransporter().sendMail({
      from: FROM_DEFAULT,
      to: params.to,
      replyTo: params.replyTo ?? REPLY_TO_DEFAULT,
      subject: params.subject,
      text: params.text,
      html: params.html,
      attachments: params.attachments,
    });
    console.log("[email] sent", { to: params.to, subject: params.subject, via: "gmail", messageId: info.messageId });
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[email] FAILED", { to: params.to, via: "gmail", error: msg });
    return { ok: false, error: msg };
  }
}
