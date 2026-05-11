import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { prisma } from "./prisma";
import type { User } from "@prisma/client";

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

/** 檢查角色,不夠就回 403 */
export function requireRole<T extends User>(
  user: T,
  allowed: Array<"customer" | "coach" | "admin">,
): { ok: true } | { ok: false; status: number; message: string } {
  if (!allowed.includes(user.role)) {
    return {
      ok: false,
      status: 403,
      message: `requires role: ${allowed.join("|")}, got: ${user.role}`,
    };
  }
  return { ok: true };
}
