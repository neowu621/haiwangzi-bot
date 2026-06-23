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
    const iss = decodeIssuer(token);
    if (iss === "haiwangzi-admin-web") {
      // admin web token：直接驗，不 fallthrough 到 LINE JWKS
      return await tryVerifyAdminWebJwt(token);
    }
    if (iss === MEMBER_WEB_ISSUER) {
      // v481：瀏覽器會員 web session（LINE Login 換來的 JWT）
      return await tryVerifyMemberWebJwt(token);
    }
    // 其餘視為 LINE idToken
    return await verifyIdToken(token);
  }

  // v481：瀏覽器會員 — httpOnly cookie session（/pclogin 等瀏覽器頁面用）
  const memberCookie = req.cookies.get(MEMBER_WEB_COOKIE)?.value;
  if (memberCookie) {
    return await tryVerifyMemberWebJwt(memberCookie);
  }

  // dev fallback：只在「真的非 production」才開啟。
  // v293 安全強化：production 環境即使 DEV_MODE_ENABLED=1 也拒絕；避免誤設導致任何人冒充任意身份
  const devEnabled = process.env.NODE_ENV !== "production";
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

// v481：瀏覽器會員 web session 常數
export const MEMBER_WEB_ISSUER = "haiwangzi-member-web";
export const MEMBER_WEB_COOKIE = "hwz_member";

/**
 * 用不驗簽的方式 decode JWT 的 iss（只看 issuer，不信任內容）。
 * 用來分流：admin web / member web / LINE idToken 各走不同驗證路徑。
 */
function decodeIssuer(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf-8"),
    );
    return typeof payload?.iss === "string" ? payload.iss : null;
  } catch {
    return null;
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

// v481：瀏覽器會員 web session JWT（LINE Login 驗證成功後簽發；放 httpOnly cookie，30 天）
export async function createMemberWebJwt(lineUserId: string): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  const key = new TextEncoder().encode(secret);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(lineUserId)
    .setIssuer(MEMBER_WEB_ISSUER)
    .setExpirationTime("30d")
    .sign(key);
}

async function tryVerifyMemberWebJwt(token: string): Promise<AuthResult> {
  const secret = process.env.JWT_SECRET;
  if (!secret)
    return { ok: false, status: 500, message: "JWT_SECRET not configured" };
  let lineUserId: string | undefined;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { issuer: MEMBER_WEB_ISSUER });
    lineUserId = payload.sub;
  } catch {
    return { ok: false, status: 401, message: "session expired, please log in again" };
  }
  if (!lineUserId)
    return { ok: false, status: 401, message: "invalid member token (no sub)" };
  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) return { ok: false, status: 401, message: "member not found" };
  if (user.deletedAt)
    return { ok: false, status: 403, message: "user_deleted: 此帳號已被停用" };
  await prisma.user.update({
    where: { lineUserId },
    data: { lastActiveAt: new Date() },
  });
  return { ok: true, user, lineUserId };
}

async function verifyIdToken(idToken: string): Promise<AuthResult> {
  // v293：production 強制要求 audience 環境變數，避免「未設定 = 跳過 audience 驗證」
  // 任何 LINE channel 簽出的 idToken 都能登入此系統的漏洞
  const audience = process.env.LINE_LIFF_CHANNEL_ID;
  if (process.env.NODE_ENV === "production" && !audience) {
    return {
      ok: false,
      status: 500,
      message: "LINE_LIFF_CHANNEL_ID env not configured (server misconfig)",
    };
  }
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: "https://access.line.me",
      audience, // 必驗 audience（dev 環境可選）
      clockTolerance: 120, // v351：容忍 120 秒時鐘誤差，避免剛過期/微小 skew 誤殺
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

/**
 * v489：驗證 LINE Login（瀏覽器 OAuth）回傳的 id_token。
 *   改用 LINE 官方 verify 端點（https://api.line.me/oauth2/v2.1/verify）—
 *   它會驗簽章 + audience(client_id) + exp + issuer，不必猜 LINE 的簽章演算法
 *   （Login 與 LIFF 的 id_token 簽法可能不同，本機 JWKS 驗會踩雷）。
 *   驗成功 → upsert user（getOrCreateUser，含新會員紅包）→ 回 lineUserId + displayName + email。
 */
export async function verifyLineLoginIdToken(
  idToken: string,
  clientId: string,
): Promise<
  | { ok: true; lineUserId: string; displayName: string; email: string | null }
  | { ok: false; message: string }
> {
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
    });
    const json = (await res.json()) as {
      sub?: string;
      name?: string;
      email?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok) {
      return { ok: false, message: json.error_description ?? json.error ?? `verify ${res.status}` };
    }
    const lineUserId = json.sub;
    if (!lineUserId) return { ok: false, message: "no sub in verify response" };
    const displayName = json.name ?? `User ${String(lineUserId).slice(0, 8)}`;
    const email = json.email ?? null;
    await getOrCreateUser(String(lineUserId), displayName);
    return { ok: true, lineUserId: String(lineUserId), displayName, email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "verify failed";
    return { ok: false, message: `id_token verify failed: ${msg}` };
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

  // 註冊抵用金 — 把 LV1 的 upgradeCredit 視為「加入會員紅包」
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
  allowed: Array<"customer" | "coach" | "boss" | "admin" | "assistant" | "it">,
): { ok: true } | { ok: false; status: number; message: string } {
  const effectiveRoles = getUserRoles(user);
  const allowedSet = new Set(allowed);
  // v622：IT = 技術全權（比照老闆，通過所有端點含 boss-only），方便測試/維護。
  if (effectiveRoles.includes("it")) return { ok: true };
  // v175 安全修正：移除「admin/boss 永遠通過」的 superuser bypass
  // 標記為 boss-only 的端點 admin 不應該能呼叫，反之亦然
  // boss 仍然可以呼叫 admin 端點（因為他是更高的角色）→ 維持向下兼容
  if (allowed.includes("admin") && effectiveRoles.includes("boss")) return { ok: true };
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
