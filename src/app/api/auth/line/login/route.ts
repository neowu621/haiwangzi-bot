import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizeUrl, lineLoginConfigured } from "@/lib/line-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v481：GET /api/auth/line/login?next=/dtest
//   產生 state + nonce（放短效 httpOnly cookie 防 CSRF / replay），導向 LINE 授權頁。
export function GET(req: NextRequest) {
  if (!lineLoginConfigured()) {
    return NextResponse.json(
      { error: "LINE Login 尚未設定（缺 LINE_LOGIN_CHANNEL_ID / SECRET）" },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const origin = url.origin;
  const next = url.searchParams.get("next") || "/dtest";
  // 只允許站內相對路徑，避免 open redirect
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dtest";

  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");

  const authorizeUrl = buildAuthorizeUrl({ origin, state, nonce });

  const res = NextResponse.redirect(authorizeUrl);
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 分鐘內完成授權
  };
  res.cookies.set("hwz_oauth_state", state, cookieOpts);
  res.cookies.set("hwz_oauth_nonce", nonce, cookieOpts);
  res.cookies.set("hwz_oauth_next", safeNext, cookieOpts);
  // v571：?admin=1 → 標記「後台登入」,callback 會改驗角色(admin/boss)+ 簽後台 token
  res.cookies.set("hwz_oauth_admin", url.searchParams.get("admin") === "1" ? "1" : "", cookieOpts);
  return res;
}
