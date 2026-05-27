import { NextRequest } from "next/server";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
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
    const token = auth.slice(7);
    // Try our own admin web JWT first
    const ownResult = await tryVerifyAdminWebJwt(token);
    if (ownResult.ok) return ownResult;
    // Fall back to LINE idToken verification
    return await verifyIdToken(token);
  }

  // dev fallback：本地（NODE_ENV !== production）或顯式開啟 DEV_MODE_ENABLED=1 才允許
  // 允許用 ?lineUserId=Uxxx 在 query 帶入身分；用於 dev personas 跳過 LINE 登入
  const devEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_MODE_ENABLED === "1";
  if (devEnabled) {
    const url = new URL(req.url);
    const lineUserId = url.searchParams.get("lineUserId");
    if (lineUserId) {
      const user = await getOrCreateUser(lineUserId, "Dev User");
      return { ok: true, user, lineUserId };
    }
  }

  return { ok: false, status: 401, message: "missing idToken" };
}

async function tryVerifyAdminWebJwt(token: string): Promise<AuthResult> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { ok: false, status: 401, message: "no JWT_SECRET" };
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      issuer: "haiwangzi-admin-web",
    });
    const lineUserId = payload.sub;
    if (!lineUserId) return { ok: false, status: 401, message: "no sub" };
    const user = await prisma.user.findUnique({ where: { lineUserId } });
    if (!user) return { ok: false, status: 401, message: "user not found" };
    await prisma.user.update({ where: { lineUserId }, data: { lastActiveAt: new Date() } });
    return { ok: true, user, lineUserId };
  } catch {
    return { ok: false, status: 401, message: "not an admin web token" };
  }
}

export async function createAdminWebJwt(lineUserId: string): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(lineUserId)
    .setIssuer("haiwangzi-admin-web")
    .setExpirationTime("7d")
    .sign(key);
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
  // admin / boss 永遠通過（superuser）
  if (effectiveRoles.includes("admin") || effectiveRoles.includes("boss")) return { ok: true };
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
