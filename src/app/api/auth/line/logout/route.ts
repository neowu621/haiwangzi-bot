import { NextRequest, NextResponse } from "next/server";
import { MEMBER_WEB_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v481：登出 — 清掉會員 web session cookie，導回 /dtest
function clear(req: NextRequest) {
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(`${origin}/dtest`);
  res.cookies.set(MEMBER_WEB_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export function GET(req: NextRequest) {
  return clear(req);
}
export function POST(req: NextRequest) {
  return clear(req);
}
