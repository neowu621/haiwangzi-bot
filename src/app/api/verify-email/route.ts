import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334
import { grantSignupAndBirthdayOnVerify } from "@/lib/signup-reward"; // v388

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v256: GET /api/verify-email?token=xxx
 *
 * 處理 Email 驗證信點擊：
 *  - 找 EmailVerifyToken
 *  - 驗證：存在、未 used、未 expired
 *  - 通過 → 寫 User.emailVerifiedAt + EmailVerifyToken.usedAt
 *  - 一律 redirect 到 /verify-email-result?status=xxx（不丟 raw JSON 給用戶看）
 *
 * 這個 endpoint 是「使用者點 email link 直接訪問」，不需要 auth header。
 * Token 本身就是 single-use 認證憑證。
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // v265 fix：Zeabur 內部 hostname (service-xxx:8080) 不能對外。
  //   優先用 X-Forwarded-Host / X-Forwarded-Proto（公開 URL），
  //   fallback PUBLIC_APP_URL env var，最後才 fallback 到 req URL。
  const xfHost = req.headers.get("x-forwarded-host") ?? "";
  const xfProto = req.headers.get("x-forwarded-proto") ?? "";
  const publicOrigin =
    xfHost && xfProto
      ? `${xfProto}://${xfHost}`
      : process.env.PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        `${url.protocol}//${url.host}`;

  const token = url.searchParams.get("token");

  function resultRedirect(status: string, extra?: Record<string, string>) {
    const params = new URLSearchParams({ status, ...(extra ?? {}) });
    return NextResponse.redirect(`${publicOrigin}/verify-email-result?${params}`);
  }

  if (!token) return resultRedirect("missing");

  const record = await prisma.emailVerifyToken.findUnique({ where: { token } });
  if (!record) return resultRedirect("invalid");

  if (record.usedAt) return resultRedirect("already_used");

  if (record.expiresAt < new Date()) return resultRedirect("expired");

  // 確認 user 還存在且 email 仍然跟 token 對得起來
  const user = await prisma.user.findUnique({
    where: { lineUserId: record.userId },
  });
  if (!user) return resultRedirect("user_gone");

  // 若 user.email 跟 token 裡的 email 不一致（user 後來改過 email），不接受
  // 改成「token 內的 email 是 verify 對象」更嚴謹：只在 email 仍是當時的 email 才認
  if (user.email !== record.email) {
    return resultRedirect("email_changed");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { lineUserId: user.lineUserId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerifyToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ]);

  void logCustomerActivity({
    req,
    user: { lineUserId: user.lineUserId, realName: user.realName, displayName: user.displayName },
    action: "customer.email.verify",
    metadata: { email: user.email ?? null },
  });

  // v388：Email 驗證通過 → 發註冊禮金（+當月生日補發），best-effort 不擋導頁
  void grantSignupAndBirthdayOnVerify(user.lineUserId).catch((e) =>
    console.error("[verify-email reward]", e),
  );

  return resultRedirect("ok", { email: user.email ?? "" });
}
