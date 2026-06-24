/**
 * v334：前台客戶活動紀錄 helper
 *
 * 共用既有 audit_log 表，但 actor_role = "customer"，方便 admin 後台查詢區分。
 * Fire-and-forget — 任何失敗都不會中斷主流程（套 try/catch）。
 *
 * 使用：
 *   import { logCustomerActivity } from "@/lib/customer-activity";
 *
 *   // 在 endpoint handler 內：
 *   await logCustomerActivity({
 *     req,
 *     user: { lineUserId, realName, displayName },
 *     action: "customer.booking.create",
 *     targetType: "booking",
 *     targetId: booking.id,
 *     targetLabel: booking.code,
 *     metadata: { type: "daily", amount: 1000 },
 *   });
 */
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface CustomerActivityParams {
  req: NextRequest | Request;
  user?: {
    lineUserId: string;
    realName?: string | null;
    displayName?: string | null;
  } | null;
  action: string;            // 如 "customer.booking.create"
  targetType?: string;       // "booking" / "wish" / "refund" ...
  targetId?: string;
  targetLabel?: string;      // 顯示用 (booking.code 等)
  metadata?: Record<string, unknown>;
  // v644：降噪 —— 同一 actor+action 在此分鐘數內已記過就跳過（如 customer.login 每次 /api/me 都打）
  throttleMinutes?: number;
}

/** 從 request headers 抓出 client IP（兼顧 proxy / Zeabur） */
export function extractIp(req: NextRequest | Request): string | null {
  // 1. CF-Connecting-IP (Cloudflare)
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  // 2. X-Forwarded-For (Zeabur / Vercel proxy) — 取最左邊
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // 3. X-Real-IP
  const xreal = req.headers.get("x-real-ip");
  if (xreal) return xreal.trim();
  // 4. fallback null
  return null;
}

export function extractUserAgent(req: NextRequest | Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

export async function logCustomerActivity(params: CustomerActivityParams): Promise<void> {
  try {
    // v644：節流。同一 actor + action 在 throttleMinutes 內已記過 → 跳過，避免高頻動作（如登入）灌爆 audit_log。
    if (params.throttleMinutes && params.throttleMinutes > 0 && params.user?.lineUserId) {
      const since = new Date(Date.now() - params.throttleMinutes * 60_000);
      const recent = await prisma.auditLog.findFirst({
        where: {
          actorId: params.user.lineUserId,
          action: params.action,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (recent) return; // 近期已記過，跳過
    }
    const ip = extractIp(params.req);
    const ua = extractUserAgent(params.req);
    await prisma.auditLog.create({
      data: {
        actorId: params.user?.lineUserId,
        actorName: params.user?.realName ?? params.user?.displayName ?? null,
        actorRole: "customer",
        actorIp: ip,
        actorUserAgent: ua,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    // 失敗不阻斷主流程
    console.error("[customer-activity]", params.action, e);
  }
}
