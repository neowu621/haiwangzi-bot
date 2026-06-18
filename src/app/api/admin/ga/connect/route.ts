// v580：GET /api/admin/ga/connect（Bearer admin）→ 產生 state、設 cookie、回授權 URL。
//   前端拿到 url 後自行 window.location 導去 Google（這樣 connect 本身仍受 Bearer 保護）。
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildGaAuthorizeUrl, gaConfigured } from "@/lib/google-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });
  if (!gaConfigured()) return NextResponse.json({ error: "尚未設定 GOOGLE_CLIENT_ID/SECRET" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const state = randomBytes(16).toString("hex");
  const url = buildGaAuthorizeUrl({ origin, state });
  const res = NextResponse.json({ url });
  res.cookies.set("hwz_ga_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
