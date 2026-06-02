import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send";
import { emailVerifyEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_DAYS = 7;
const RESEND_RATE_LIMIT_SECONDS = 60;

/**
 * v256: POST /api/me/send-verify-email
 *
 * 寄送 Email 驗證信給目前登入的 user：
 *  - 若 user.email 為空 → 400
 *  - 若 emailVerifiedAt 已不為 null → 200 + already_verified（不再寄）
 *  - 若 60 秒內已寄過 → 429 rate_limit
 *  - 否則：建 EmailVerifyToken (7 天 TTL) + 寄信，回 200
 *
 * 可選 query: `?email=xxx@yyy.com` 換 email（會先更新 User.email，
 *   清掉 emailVerifiedAt，再寄）。沒給就用現有 User.email。
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const url = new URL(req.url);
  const overrideEmail = url.searchParams.get("email")?.trim() || undefined;

  // 取目前 user 完整資料（include emailVerifiedAt + emailVerifyTokenSentAt）
  let user = await prisma.user.findUnique({
    where: { lineUserId: auth.user.lineUserId },
  });
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  // 若指定了新 email，先更新並清掉 verified 狀態
  let targetEmail = overrideEmail ?? user.email ?? null;
  if (overrideEmail && overrideEmail !== user.email) {
    if (!overrideEmail.includes("@") || overrideEmail.length < 5) {
      return NextResponse.json({ error: "invalid email" }, { status: 400 });
    }
    user = await prisma.user.update({
      where: { lineUserId: auth.user.lineUserId },
      data: {
        email: overrideEmail,
        emailVerifiedAt: null, // 換新 email 重新驗證
      },
    });
    targetEmail = overrideEmail;
  }

  if (!targetEmail) {
    return NextResponse.json(
      { error: "email_required", message: "請先填寫 Email" },
      { status: 400 },
    );
  }

  // 已驗證的 email 不需要再寄
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  // Rate limit：60 秒內不能重發
  if (user.emailVerifyTokenSentAt) {
    const elapsed = Date.now() - user.emailVerifyTokenSentAt.getTime();
    if (elapsed < RESEND_RATE_LIMIT_SECONDS * 1000) {
      const retryAfter = Math.ceil(
        (RESEND_RATE_LIMIT_SECONDS * 1000 - elapsed) / 1000,
      );
      return NextResponse.json(
        {
          error: "rate_limit",
          message: `請等 ${retryAfter} 秒後再試`,
          retryAfter,
        },
        { status: 429 },
      );
    }
  }

  // 產 token：32 bytes urlsafe base64 ≈ 43 chars
  const token = crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.emailVerifyToken.create({
    data: {
      token,
      userId: user.lineUserId,
      email: targetEmail,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { lineUserId: user.lineUserId },
    data: { emailVerifyTokenSentAt: new Date() },
  });

  // 組驗證 URL（用 request 的 host，避免硬編 production url 在 staging 失效）
  const origin = `${url.protocol}//${url.host}`;
  const verifyUrl = `${origin}/api/verify-email?token=${encodeURIComponent(token)}`;

  // 撈首單獎勵金額（顯示在信中）— SiteConfig.id 是 string "default"
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  const rewardAmount =
    (cfg as unknown as { firstOrderRewardAmount?: number } | null)
      ?.firstOrderRewardAmount ?? 100;

  const content = emailVerifyEmail({
    name: user.displayName ?? user.realName ?? "您好",
    verifyUrl,
    rewardAmount,
  });

  const result = await sendEmail({
    to: targetEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  if (!result.ok && !result.skipped) {
    return NextResponse.json(
      { error: "send_failed", message: result.error ?? "寄信失敗" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sent: !result.skipped,
    skipped: result.skipped ?? false,
    email: targetEmail,
  });
}
