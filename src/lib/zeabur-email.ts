import { createHmac, timingSafeEqual } from "node:crypto";
import { sendViaZsend } from "@/lib/email/zsend";

/**
 * 客服信箱 console 的寄信封裝。
 *
 * v521 重構：專案早就有 ZSend 寄信（src/lib/email/zsend.ts，用既有且已在 Zeabur 設好的
 *   ZSEND_API_KEY / ZSEND_FROM / ZSEND_API_ENDPOINT），這裡不再自建第二套 HTTP / 環境變數，
 *   而是「沿用」sendViaZsend，只額外帶 console threading 需要的自訂 RFC 標頭。
 */
export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** threading：原信的 Message-ID，讓客人端接同一串 */
  inReplyTo?: string;
  references?: string;
}

export interface SendEmailResult {
  providerId: string; // ZSend 回傳的 id，用來日後比對 status webhook 的 email.id
  messageId: string;  // 我們自己給的 RFC Message-ID（threading / 去重用）
}

export async function sendViaZeaburEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  // 自己產一個 Message-ID，方便之後 threading / 去重
  const messageId = `<${cryptoRandom()}@haiwangzi.xyz>`;

  // v532 修正：SES 不允許自訂 Message-ID（保留標頭，由 SES 自己產），帶了會 400
  //   "header 'Message-ID' is not allowed (reserved by SES)"。
  //   只帶 In-Reply-To / References（這兩個 SES 允許）讓客人端接成同一串；
  //   我們自己產的 messageId 僅供 DB 內部記錄/去重用，不送進 SES。
  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references) headers["References"] = input.references;

  const r = await sendViaZsend({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers,
  });
  if (!r.ok) throw new Error(r.error ?? "ZSend send failed");

  return { providerId: r.providerId ?? "", messageId };
}

/**
 * 驗證 Zeabur Email status webhook 的簽章。
 * header: X-ZSend-Signature: sha256=<hex>, X-ZSend-Timestamp: <unix>
 * 簽章訊息 = `${timestamp}.${rawBody}`，HMAC-SHA256 with ZSEND_WEBHOOK_SECRET。
 *
 * ⚠️ 一定要傳「原始 raw body 字串」進來，不能是 JSON.parse 後再 stringify 的版本。
 */
export function verifyZeaburSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret = process.env.ZSEND_WEBHOOK_SECRET ?? "",
): boolean {
  if (!secret) return false;
  if (!signatureHeader || !timestampHeader) return false;

  // 防重放：時間戳需在 ±5 分鐘內
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(`${timestampHeader}.${rawBody}`).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false; // 長度不同直接拒，避免 timingSafeEqual 拋錯
  return timingSafeEqual(a, b);
}

function cryptoRandom(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
