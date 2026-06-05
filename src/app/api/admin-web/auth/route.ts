import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminWebJwt } from "@/lib/auth";
import { verifyWebPassword } from "@/lib/admin-web-crypto";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, RATE_LIMIT } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/safe-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminOrBoss(user: { role: string; roles: string[] }): boolean {
  const effectiveRoles =
    user.roles && user.roles.length > 0 ? user.roles : [user.role];
  return effectiveRoles.includes("admin") || effectiveRoles.includes("boss");
}

// GET /api/admin-web/auth?secret=xxx
// 列出所有 admin/boss 帳號，並標示每人是否已設個人密碼
export async function GET(req: NextRequest) {
  // Rate limit：5 次/分鐘 per IP，防管理密碼暴力破解
  const limited = checkRateLimit(req, RATE_LIMIT.ADMIN_LOGIN);
  if (limited) return limited;

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!secret) {
    return NextResponse.json({ error: "missing secret" }, { status: 401 });
  }
  if (!safeEqual(secret, process.env.ADMIN_WEB_SECRET)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["admin", "boss"] } },
        { roles: { hasSome: ["admin", "boss"] } },
      ],
    },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      role: true,
      roles: true,
      webPasswordHash: true,
    },
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      lineUserId: u.lineUserId,
      displayName: u.displayName,
      realName: u.realName,
      role: u.role,
      roles: u.roles,
      effectiveRoles:
        u.roles && u.roles.length > 0 ? u.roles : [u.role],
      // 只告訴前端「有沒有設密碼」，不傳 hash 本體
      hasPassword: !!u.webPasswordHash,
    })),
  });
}

// POST /api/admin-web/auth
// body: { secret, lineUserId, password }
// 驗共用密碼 + 個人密碼 → 發 JWT
export async function POST(req: NextRequest) {
  // Rate limit：5 次/分鐘 per IP
  const limited = checkRateLimit(req, RATE_LIMIT.ADMIN_LOGIN);
  if (limited) return limited;

  let body: { secret?: string; lineUserId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { secret, lineUserId, password } = body;

  if (!secret) {
    return NextResponse.json({ error: "missing secret" }, { status: 401 });
  }
  if (!safeEqual(secret, process.env.ADMIN_WEB_SECRET)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  if (!lineUserId) {
    return NextResponse.json({ error: "missing lineUserId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { lineUserId },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      role: true,
      roles: true,
      webPasswordHash: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  if (!isAdminOrBoss(user)) {
    return NextResponse.json(
      { error: "requires admin or boss role" },
      { status: 403 },
    );
  }

  // 若已設個人密碼 → 必須提供且正確
  if (user.webPasswordHash) {
    if (!password) {
      return NextResponse.json(
        { error: "password required", code: "PASSWORD_REQUIRED" },
        { status: 401 },
      );
    }
    const ok = await verifyWebPassword(password, user.webPasswordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "incorrect password", code: "WRONG_PASSWORD" },
        { status: 401 },
      );
    }
  } else {
    // 尚未設密碼 → 告訴前端要先設
    return NextResponse.json(
      { error: "no password set", code: "NO_PASSWORD" },
      { status: 403 },
    );
  }

  const token = await createAdminWebJwt(lineUserId);
  await logAudit({
    actorId: user.lineUserId,
    actorName: user.realName ?? user.displayName ?? undefined,
    action: "auth.login",
    targetType: "user",
    targetId: user.lineUserId,
    targetLabel: user.realName ?? user.displayName ?? user.lineUserId,
    metadata: { channel: "web_admin" },
  });
  return NextResponse.json({
    token,
    user: {
      lineUserId: user.lineUserId,
      displayName: user.displayName,
      realName: user.realName,
      role: user.role,
      roles: user.roles,
      effectiveRoles:
        user.roles && user.roles.length > 0 ? user.roles : [user.role],
    },
  });
}
