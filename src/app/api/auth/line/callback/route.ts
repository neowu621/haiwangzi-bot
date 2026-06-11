import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  lineLoginChannelId,
  lineLoginConfigured,
} from "@/lib/line-login";
import {
  verifyLineLoginIdToken,
  createMemberWebJwt,
  MEMBER_WEB_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v481：GET /api/auth/line/callback?code=...&state=...
//   驗 state（防 CSRF）→ 換 token → 驗 id_token（audience=Login channel, nonce 比對）
//   → 簽會員 web JWT 放 httpOnly cookie → 導回 next（預設 /dtest）。
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  const next = req.cookies.get("hwz_oauth_next")?.value || "/dtest";
  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}/dtest?login_error=${encodeURIComponent(reason)}`);

  if (!lineLoginConfigured()) return failRedirect("line_login_not_configured");
  if (errParam) return failRedirect(errParam); // 使用者取消授權等

  const savedState = req.cookies.get("hwz_oauth_state")?.value;
  const savedNonce = req.cookies.get("hwz_oauth_nonce")?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return failRedirect("state_mismatch");
  }

  const tok = await exchangeCodeForToken({ code, origin });
  if (!tok.ok) return failRedirect(`token_exchange_failed`);

  const verified = await verifyLineLoginIdToken(
    tok.idToken,
    lineLoginChannelId(),
    savedNonce,
  );
  if (!verified.ok) return failRedirect("id_token_invalid");

  // 簽會員 web session JWT（30 天）→ httpOnly cookie
  const jwt = await createMemberWebJwt(verified.lineUserId);

  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dtest";
  const res = NextResponse.redirect(`${origin}${safeNext}`);
  res.cookies.set(MEMBER_WEB_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
  // 清掉一次性 oauth cookie
  for (const c of ["hwz_oauth_state", "hwz_oauth_nonce", "hwz_oauth_next"]) {
    res.cookies.set(c, "", { path: "/", maxAge: 0 });
  }
  return res;
}
