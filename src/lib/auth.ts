import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "./prisma";
import type { User, UserRole } from "@prisma/client";

// LINE 的 JWKS 公開金鑰,用來驗 idToken 的簽章
const JWKS = createRemoteJWKSet(
  new URL("https://api.line.me/oauth2/v2.1/certs"),
);

export type AuthResult =
  | { ok: true; user: User; lineUserId: string }
  | { ok: false; status: number; message: string };

/**
 * 從 request 拿 LIFF idToken,驗簽 + 取/建 User row
 *
 * 兩種模式:
 *  1. Authorization: Bearer <idToken>      (LIFF API 呼叫時 client 會帶)
 *  2. ?lineUserId=Uxxx (dev only,production 不允許)
 */
export async function authFromRequest(req: NextRequest): Promise<AuthResult> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const idToken = auth.slice(7);
    return await verifyIdToken(idToken);
  }

  // dev fallback
  if (process.env.NODE_ENV !== "production") {
    const url = new URL(req.url);
    const lineUserId = url.searchParams.get("lineUserId");
    if (lineUserId) {
      const user = await getOrCreateUser(lineUserId, "Dev User");
      return { ok: true, user, lineUserId };
    }
  }

  return { ok: false, status: 401, message: "missing idToken" };
}

async function verifyIdToken(idToken: string): Promise<AuthResult> {
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: "https://access.line.me",
      audience: process.env.LINE_LIFF_CHANNEL_ID, // optional 驗 audience
    });
    const lineUserId = payload.sub;
    const displayName =
      (payload.name as string | undefined) ??
      `User ${String(lineUserId).slice(0, 8)}`;
    if (!lineUserId) {
      return { ok: false, status: 401, message: "no sub in idToken" };
    }
    const user = await getOrCreateUser(String(lineUserId), displayName);
    return { ok: true, user, lineUserId: String(lineUserId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return { ok: false, status: 401, message: `idToken invalid: ${msg}` };
  }
}

/** 第一次看到的 LINE userId 自動建 User row */
async function getOrCreateUser(
  lineUserId: string,
  displayName: string,
): Promise<User> {
  return await prisma.user.upsert({
    where: { lineUserId },
    create: { lineUserId, displayName },
    update: { lastActiveAt: new Date() },
  });
}

/**
 * 取一個 user 的有效角色清單。
 * 新欄位 `roles[]` 為主；若為空陣列（尚未遷移）就 fallback 到舊的單一 `role`
 */
export function getUserRoles(user: User): UserRole[] {
  if (user.roles && user.roles.length > 0) return user.roles;
  return [user.role];
}

/** 檢查角色,不夠就回 403 — 支援多重身分：只要有任何一個 role 在 allowed 內就過 */
export function requireRole<T extends User>(
  user: T,
  allowed: Array<"customer" | "coach" | "boss" | "admin">,
): { ok: true } | { ok: false; status: number; message: string } {
  const effectiveRoles = getUserRoles(user);
  const allowedSet = new Set(allowed);
  // admin 永遠通過（superuser）
  if (effectiveRoles.includes("admin")) return { ok: true };
  const matched = effectiveRoles.some((r) => allowedSet.has(r));
  if (!matched) {
    return {
      ok: false,
      status: 403,
      message: `requires role: ${allowed.join("|")}, got: ${effectiveRoles.join(",")}`,
    };
  }
  return { ok: true };
}
