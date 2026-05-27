import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashWebPassword, verifyWebPassword } from "@/lib/admin-web-crypto";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  secret: z.string(),          // 共用管理密碼（ADMIN_WEB_SECRET）
  lineUserId: z.string(),      // 要設密碼的帳號
  newPassword: z.string().min(8, "密碼至少 8 個字元"),
  // 若已設過舊密碼，必須提供；首次設定可省略
  oldPassword: z.string().optional(),
});

// POST /api/admin-web/set-password
// 首次設定 or 忘記密碼重設（需 ADMIN_WEB_SECRET + lineUserId + newPassword）
// 若已有密碼且提供 oldPassword → 驗舊密碼才改；
// 若已有密碼且「不」提供 oldPassword → 只要 ADMIN_WEB_SECRET 即可重設（忘記密碼流程）
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "validation failed" },
      { status: 400 },
    );
  }
  const { secret, lineUserId, newPassword, oldPassword } = parsed.data;

  // 1. 驗共用管理密碼
  if (secret !== process.env.ADMIN_WEB_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  // 2. 找 user
  const user = await prisma.user.findUnique({
    where: { lineUserId },
    select: { lineUserId: true, webPasswordHash: true, role: true, roles: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  // 3. 確認是 admin 或 boss
  const effectiveRoles =
    user.roles && user.roles.length > 0 ? user.roles : [user.role];
  if (!effectiveRoles.includes("admin") && !effectiveRoles.includes("boss")) {
    return NextResponse.json(
      { error: "requires admin or boss role" },
      { status: 403 },
    );
  }

  // 4. 若已有舊密碼且使用者「主動提供」oldPassword → 驗舊密碼
  if (user.webPasswordHash && oldPassword) {
    const match = await verifyWebPassword(oldPassword, user.webPasswordHash);
    if (!match) {
      return NextResponse.json(
        { error: "舊密碼錯誤", code: "WRONG_OLD_PASSWORD" },
        { status: 401 },
      );
    }
  }
  // 若已有密碼但沒提供 oldPassword → ADMIN_WEB_SECRET 已驗過，允許直接重設（忘記密碼）

  // 5. 雜湊新密碼並存入 DB
  const hash = await hashWebPassword(newPassword);
  await prisma.user.update({
    where: { lineUserId },
    data: { webPasswordHash: hash },
  });

  await logAudit({
    actorId: lineUserId,
    action: user.webPasswordHash ? "auth.password_reset" : "auth.password_set",
    targetType: "user",
    targetId: lineUserId,
    metadata: { hadPreviousPassword: !!user.webPasswordHash },
  });

  return NextResponse.json({ ok: true, message: "密碼設定成功" });
}
