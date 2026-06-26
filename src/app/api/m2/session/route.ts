// v689：m2 第二版 UAT 登入 —— 密碼換取「以預設帳號身分」的會員 session cookie（hwz_member）。
//   ⚠️ 僅供 m2 測試：密碼弱、固定帳號（neowu62）；正式上線前請改成 LINE 登入並移除此端點。
//   只發「會員」session（非 admin）；m2 會員端各 API 即以此帳號身分運作。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMemberWebJwt, MEMBER_WEB_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const M2_PASSWORD = process.env.M2_PASSWORD ?? "msi";
const M2_DEFAULT_EMAIL = process.env.M2_DEFAULT_EMAIL ?? "neowu62@gmail.com";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if ((body.password ?? "") !== M2_PASSWORD) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }
  const user = await prisma.user.findFirst({
    where: { email: M2_DEFAULT_EMAIL, deletedAt: null },
    select: { lineUserId: true, realName: true, displayName: true },
  });
  if (!user) return NextResponse.json({ error: "預設帳號不存在" }, { status: 404 });

  const jwt = await createMemberWebJwt(user.lineUserId);
  const res = NextResponse.json({ ok: true, name: user.realName ?? user.displayName });
  res.cookies.set(MEMBER_WEB_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// 登出：清掉 m2 的會員 session
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(MEMBER_WEB_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
