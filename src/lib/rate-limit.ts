import { NextRequest, NextResponse } from "next/server";

/**
 * 簡單的 in-memory rate limiter（每個 Zeabur instance 各自計）
 *
 * 設計取捨：
 * - 不用 DB：避免每次請求都查 DB（成本太高）
 * - 不用 Redis：少一個依賴
 * - in-memory：單 instance 已足夠擋住基本 brute-force
 * - 重啟會 reset：可接受，反正攻擊者也不知道何時 reset
 *
 * 若未來 scale 到多 instance，再考慮接 Redis 或 Cloudflare Worker
 */

interface RateLimitState {
  count: number;
  resetAt: number; // ms timestamp
}

// 各 endpoint 獨立 counter
const buckets = new Map<string, RateLimitState>();

// 每分鐘清一次過期 entries 避免記憶體膨脹
let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, state] of buckets.entries()) {
      if (state.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
}

export interface RateLimitOptions {
  /** 識別字串（會與 IP/userId 組合成 key）*/
  scope: string;
  /** 時間窗口（毫秒）*/
  windowMs: number;
  /** 窗口內最大次數 */
  max: number;
  /** 額外識別碼（例如 userId）；不傳就用 IP */
  identifier?: string;
}

/**
 * 從 request 取出客戶端 IP（Zeabur 透過 proxy，看 x-forwarded-for header）
 * v772：匯出供其他模組（如 AI 客服的 denial-of-wallet 閘）共用同一套取 IP 邏輯。
 */
export function getClientIp(req: NextRequest): string {
  // v355：優先用代理（Zeabur 邊緣）填入的 x-real-ip —— 客戶端無法偽造。
  //   x-forwarded-for 最左欄是客戶端可任意塞的值，拿來當 rate-limit key 會被輪換繞過；
  //   退而求其次取 XFF 最右欄（最接近我方代理）。
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * 檢查 rate limit。回 null 代表通過；回 NextResponse 代表被擋。
 *
 * 用法：
 *   const limited = checkRateLimit(req, { scope: "admin-login", windowMs: 60_000, max: 5 });
 *   if (limited) return limited;
 */
export function checkRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): NextResponse | null {
  ensureCleanup();
  const id = opts.identifier ?? getClientIp(req);
  const key = `${opts.scope}:${id}`;
  const now = Date.now();
  const state = buckets.get(key);

  if (!state || state.resetAt < now) {
    // 新窗口開始
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return null;
  }

  state.count += 1;
  if (state.count > opts.max) {
    const retryAfterSec = Math.ceil((state.resetAt - now) / 1000);
    return NextResponse.json(
      {
        error: "too_many_requests",
        message: `請求過於頻繁，請 ${retryAfterSec} 秒後再試`,
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(opts.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(state.resetAt / 1000)),
        },
      },
    );
  }

  return null;
}

// ── 預設規則 ────────────────────────────────────────
export const RATE_LIMIT = {
  /** 管理密碼登入：5 次/分鐘（防暴力破解）*/
  ADMIN_LOGIN: { scope: "admin-login", windowMs: 60_000, max: 5 },
  /** 客戶下單：30 次/分鐘 */
  BOOKING: { scope: "booking", windowMs: 60_000, max: 30 },
  /** LIFF 一般 API：60 次/分鐘 */
  LIFF_API: { scope: "liff-api", windowMs: 60_000, max: 60 },
} as const;
