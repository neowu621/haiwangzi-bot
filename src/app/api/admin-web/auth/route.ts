import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminWebJwt } from "@/lib/auth";
import { verifyWebPassword } from "@/lib/admin-web-crypto";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, RATE_LIMIT } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/safe-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function effectiveRoles(user: { role: string; roles: string[] }): string[] {
  return user.roles && user.roles.length > 0 ? user.roles : [user.role];
}
function isAdminOrBoss(user: { role: string; roles: string[] }): boolean {
  const roles = effectiveRoles(user);
  // v622：後台密碼登入開放給 管理者(admin) / 老闆(boss) / IT(it)。
  return roles.includes("admin") || roles.includes("boss") || roles.includes("it");
}

// 列出所有可登入後台的帳號（admin/boss/it；標示是否已設密碼，不傳 hash）
async function listAdminUsers() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["admin", "boss", "it"] } },
        { roles: { hasSome: ["admin", "boss", "it"] } },
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
      effectiveRoles: effectiveRoles(u),
      hasPassword: !!u.webPasswordHash,
    })),
  });
}

// v356：拒絕舊的 query-string 帶 secret 流程（避免密鑰被各層代理寫進 log）
export async function GET() {
  return NextResponse.json(
    { error: "method_not_allowed", message: "請改用 POST body 傳 secret" },
    { status: 405 },
  );
}

// POST /api/admin-web/auth
//   body { secret }                       → 列出 admin/boss 帳號
//   body { secret, lineUserId, password } → 驗個人密碼 → 發 JWT
export async function POST(req: NextRequest) {
  const limited = checkRateLimit(req, RATE_LIMIT.ADMIN_LOGIN);
  if (limited) return limited;

  let body: { secret?: string; lineUserId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { secret, lineUserId, password } = body;
  if (!safeEqual(secret, process.env.ADMIN_WEB_SECRET)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  // 沒帶 lineUserId → 列出帳號
  if (!lineUserId) {
    return listAdminUsers();
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
  if (!user.webPasswordHash) {
    return NextResponse.json(
      { error: "no password set", code: "NO_PASSWORD" },
      { status: 403 },
    );
  }
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
      effectiveRoles: effectiveRoles(user),
    },
  });
}
