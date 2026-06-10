// v296：公開付款連結 — token 產生、URL 建構、驗證
import crypto from "node:crypto";

/** 產生 64-char hex token（32 bytes 隨機）*/
export function generatePayLinkToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** 建構公開付款 URL：/pay/<bookingId>?t=<token> */
export function buildPayLinkUrl(bookingId: string, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "https://haiwangzi.xyz";
  return `${base.replace(/\/$/, "")}/pay/${bookingId}?t=${token}`;
}

/** Booking-style 對照表用，給 page 顯示用 */
export const PAY_LINK_EXPIRY_DAYS = 30;
