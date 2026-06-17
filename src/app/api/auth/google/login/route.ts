import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildGoogleAuthorizeUrl, googleLoginConfigured } from "@/lib/google-login";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v572：GET /api/auth/google/login — 後台 Google 登入起手,導向 Google 授權頁。
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!googleLoginConfigured()) {
    const base = (process.env.NEXT_PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, "");
    return NextResponse.redirect(`${base}/admin/login#err=${encodeURIComponent("Google 登入尚未設定(請先設定 GOOGLE_CLIENT_ID/SECRET)")}`);
  }
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthorizeUrl({ origin: url.origin, state }));
  res.cookies.set("hwz_goauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
