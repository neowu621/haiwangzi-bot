// v355：常數時間字串比對，避免共享密鑰（CRON_SECRET / ADMIN_WEB_SECRET）被 timing 分析逐位元還原
import { createHash, timingSafeEqual } from "crypto";

/**
 * 常數時間比較兩個字串。
 * 先各自 SHA-256（正規化長度，避免洩漏長度差），再 timingSafeEqual。
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}
