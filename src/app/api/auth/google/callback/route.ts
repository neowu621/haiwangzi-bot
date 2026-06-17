import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, googleLoginConfigured } from "@/lib/google-login";
import { createAdminWebJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v572：GET /api/auth/google/callback — 驗 state → 換 token → 取 email →
//   找對應的 admin/老闆帳號 → 簽後台 token,經 URL fragment 交回 /admin/login。
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, "");
  const clearCookie = (r: NextResponse) => { r.cookies.set("hwz_goauth_state", "", { path: "/", maxAge: 0 }); return r; };
  const fail = (m: string) => clearCookie(NextResponse.redirect(`${base}/admin/login#err=${encodeURIComponent(m)}`));

  if (!googleLoginConfigured()) return fail("Google 登入尚未設定");
  if (url.searchParams.get("error")) return fail("Google 授權被取消");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = req.cookies.get("hwz_goauth_state")?.value;
  if (!code || !state || !saved || state !== saved) return fail("state_mismatch");

  const ex = await exchangeGoogleCode({ code, origin: url.origin });
  if (!ex.ok) { console.error("[google callback]", ex.message); return fail("Google 驗證失敗"); }
  if (!ex.emailVerified) return fail("此 Google email 尚未驗證");

  // 找 email 對應、且具 admin/老闆角色的後台帳號
  const u = await prisma.user.findFirst({
    where: {
      email: { equals: ex.email, mode: "insensitive" },
      OR: [{ role: { in: ["admin", "boss"] } }, { roles: { hasSome: ["admin", "boss"] } }],
    },
    select: { lineUserId: true, displayName: true, realName: true, role: true, roles: true },
  });
  if (!u) return fail(`此 Google 帳號(${ex.email})沒有對應的後台帳號`);

  const roles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
  const adminJwt = await createAdminWebJwt(u.lineUserId);
  const u64 = Buffer.from(JSON.stringify({ lineUserId: u.lineUserId, displayName: u.displayName, realName: u.realName, effectiveRoles: roles })).toString("base64url");
  await logAudit({ actorId: u.lineUserId, actorName: u.realName ?? u.displayName ?? undefined, action: "auth.login", targetType: "user", targetId: u.lineUserId, targetLabel: u.realName ?? u.displayName ?? u.lineUserId, metadata: { channel: "web_admin", method: "google" } });

  return clearCookie(NextResponse.redirect(`${base}/admin/login#at=${adminJwt}&u=${u64}`));
}
