import { NextRequest } from "next/server";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "./prisma";
import { genMemberCode } from "./code-gen";
import { normalizeVipTiers, VIP_TIERS } from "./vip-tier";
import { grantVipUpgradeRewards } from "./vip-upgrade-rewards";
import type { User, UserRole } from "@prisma/client";

// LINE 的 JWKS 公開金鑰,用來驗 idToken 的簽章
const JWKS = createRemoteJWKSet(
  new URL("https://api.line.me/oauth2/v2.1/certs"),
);

export type AuthResult =
  | { ok: true; user: User; lineUserId: string }
  | { ok: false; status: number; message: string };

/**
 * 從 request 拿 Bearer token，依 issuer 決定驗證路徑：
 *  - iss = "haiwangzi-admin-web" → admin web JWT（HS256，伺服器端 secret）
 *  - 其他 → LINE idToken（RS256，JWKS 驗簽）
 *
 * 注意：issuer 檢查只是 decode（不驗簽），防止 admin token 誤跑進 LINE JWKS
 * 讓錯誤訊息清晰（session 過期 vs idToken 無效）
 */
export async function authFromRequest(req: NextRequest): Promise<AuthResult> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    if (looksLikeAdminWebJwt(token)) {
      // admin web token：直接驗，不 fallthrough 到 LINE JWKS
      return await tryVerifyAdminWebJwt(token);
    }
    // 其餘視為 LINE idToken
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

/**
 * 用不驗簽的方式 decode JWT payload，檢查 iss 是否為 admin web token。
 * 避免 admin token 被誤送進 LINE JWKS 驗證。
 */
function looksLikeAdminWebJwt(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return payload?.iss === "haiwangzi-admin-web";
  } catch {
    return false;
  }
}

async function tryVerifyAdminWebJwt(token: string): Promise<AuthResult> {
  const secret = process.env.JWT_SECRET;
  if (!secret)
    return { ok: false, status: 500, message: "JWT_SECRET not configured" };

  // 先只驗簽（signature + expiry），DB 查詢分開處理讓錯誤更清晰
  let lineUserId: string | undefined;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, {
      issuer: "haiwangzi-admin-web",
    });
    lineUserId = payload.sub;
  } catch {
    // 簽章錯誤或 token 過期 → 請重新登入
    return {
      ok: false,
      status: 401,
      message: "session expired, please log in again",
    };
  }

  if (!lineUserId)
    return { ok: false, status: 401, message: "invalid admin token (no sub)" };

  // DB 查詢（DB 錯誤不應誤導成 LINE auth 錯誤）
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user)
    return { ok: false, status: 401, message: "admin user not found" };
  // 軟刪除檢查
  if (user.deletedAt) {
    return { ok: false, status: 403, message: "user_deleted: 此帳號已被停用" };
  }
  await prisma.user.update({
    where: { lineUserId },
    data: { lastActiveAt: new Date() },
  });
  return { ok: true, user, lineUserId };
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
    // 軟刪除檢查
    if (user.deletedAt) {
      return { ok: false, status: 403, message: "user_deleted: 此帳號已被停用" };
    }
    return { ok: true, user, lineUserId: String(lineUserId) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return { ok: false, status: 401, message: `idToken invalid: ${msg}` };
  }
}

/** 第一次看到的 LINE userId 自動建 User row（新用戶自動產生會員編號）*/
async function getOrCreateUser(
  lineUserId: string,
  displayName: string,
): Promise<User> {
  // 先看是否已存在，避免每次 auth 都無謂產生 code
  const existing = await prisma.user.findUnique({ where: { lineUserId } });
  if (existing) {
    return await prisma.user.update({
      where: { lineUserId },
      data: { lastActiveAt: new Date() },
    });
  }
  const code = await genMemberCode();
  const user = await prisma.user.upsert({
    where: { lineUserId },
    create: { lineUserId, displayName, code },
    update: { lastActiveAt: new Date() },
  });

  // 註冊禮金 — 把 LV1 的 upgradeCredit 視為「加入會員紅包」
  // 重複呼叫安全（grantVipUpgradeRewards 用 CreditTx refType=vip+refId=1 去重）
  try {
    const cfg = await prisma.siteConfig
      .findUnique({ where: { id: "default" } })
      .catch(() => null);
    const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;
    // oldLevel=0 → newLevel=1 讓 LV1 reward 命中
    await grantVipUpgradeRewards(lineUserId, 0, 1, tiers);
  } catch (e) {
    console.error("[signup credit grant]", e);
  }

  return user;
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
