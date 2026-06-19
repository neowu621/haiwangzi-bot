import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  lineLoginChannelId,
  lineLoginConfigured,
} from "@/lib/line-login";
import {
  verifyLineLoginIdToken,
  createMemberWebJwt,
  createAdminWebJwt,
  MEMBER_WEB_COOKIE,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v481：GET /api/auth/line/callback?code=...&state=...
//   驗 state（防 CSRF）→ 換 token → 驗 id_token（audience=Login channel, nonce 比對）
//   → 簽會員 web JWT 放 httpOnly cookie → 導回 next（預設 /pclogin）。
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  // v489：導向一律用對外網域（NEXT_PUBLIC_BASE_URL），不可用 req.url 的 origin —
  //   在 Zeabur proxy 後面，req.url 的 origin 是「內部主機名 service-xxx:8080」，
  //   導回去瀏覽器會 ERR_NAME_NOT_RESOLVED。
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? origin).replace(/\/$/, "");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  const next = req.cookies.get("hwz_oauth_next")?.value || "/pclogin";
  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${base}/pclogin?login_error=${encodeURIComponent(reason)}`);

  if (!lineLoginConfigured()) return failRedirect("line_login_not_configured");
  if (errParam) return failRedirect(errParam); // 使用者取消授權等

  const savedState = req.cookies.get("hwz_oauth_state")?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return failRedirect("state_mismatch");
  }

  const tok = await exchangeCodeForToken({ code, origin });
  if (!tok.ok) {
    console.error("[line callback] token exchange failed:", tok.message);
    return failRedirect("token_exchange_failed");
  }

  // v489：state cookie 已防 CSRF；nonce 不強制比對（避免 LINE 未回 nonce 時誤殺登入）。
  //   驗 id_token 簽章 + issuer + audience(=Login channel id) 即可。
  const verified = await verifyLineLoginIdToken(tok.idToken, lineLoginChannelId());
  if (!verified.ok) {
    console.error("[line callback] id_token verify failed:", verified.message);
    return failRedirect("id_token_invalid");
  }

  const clearOauthCookies = (r: NextResponse) => {
    for (const c of ["hwz_oauth_state", "hwz_oauth_nonce", "hwz_oauth_next", "hwz_oauth_admin"]) {
      r.cookies.set(c, "", { path: "/", maxAge: 0 });
    }
    return r;
  };

  // v571：後台登入流程 —— 驗角色(admin/boss)→ 簽後台 token,經 URL fragment 交回 /admin/login
  if (req.cookies.get("hwz_oauth_admin")?.value === "1") {
    const u = await prisma.user.findUnique({
      where: { lineUserId: verified.lineUserId },
      select: { lineUserId: true, displayName: true, realName: true, role: true, roles: true },
    });
    const roles = u ? (u.roles && u.roles.length > 0 ? u.roles : [u.role]) : [];
    if (!u || !(roles.includes("admin") || roles.includes("boss"))) {
      return clearOauthCookies(NextResponse.redirect(`${base}/admin/login#err=${encodeURIComponent("此 LINE 帳號沒有後台權限")}`));
    }
    const adminJwt = await createAdminWebJwt(verified.lineUserId);
    const u64 = Buffer.from(JSON.stringify({ lineUserId: u.lineUserId, displayName: u.displayName, realName: u.realName, effectiveRoles: roles })).toString("base64url");
    await logAudit({ actorId: u.lineUserId, actorName: u.realName ?? u.displayName ?? undefined, action: "auth.login", targetType: "user", targetId: u.lineUserId, targetLabel: u.realName ?? u.displayName ?? u.lineUserId, metadata: { channel: "web_admin", method: "line" } });
    return clearOauthCookies(NextResponse.redirect(`${base}/admin/login#at=${adminJwt}&u=${u64}`));
  }

  // 簽會員 web session JWT（30 天）→ httpOnly cookie
  const jwt = await createMemberWebJwt(verified.lineUserId);

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/pclogin";
  const res = NextResponse.redirect(`${base}${safeNext}`);
  res.cookies.set(MEMBER_WEB_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
  // 清掉一次性 oauth cookie
  for (const c of ["hwz_oauth_state", "hwz_oauth_nonce", "hwz_oauth_next", "hwz_oauth_admin"]) {
    res.cookies.set(c, "", { path: "/", maxAge: 0 });
  }
  return res;
}
