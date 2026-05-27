import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdminWebJwt } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdminOrBoss(user: { role: string; roles: string[] }): boolean {
  const effectiveRoles =
    user.roles && user.roles.length > 0 ? user.roles : [user.role];
  return effectiveRoles.includes("admin") || effectiveRoles.includes("boss");
}

// GET /api/admin-web/auth?secret=xxx
// Returns list of admin/boss users
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");

  if (!secret) {
    return NextResponse.json({ error: "missing secret" }, { status: 401 });
  }
  if (secret !== process.env.ADMIN_WEB_SECRET) {
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
    },
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      effectiveRoles:
        u.roles && u.roles.length > 0 ? u.roles : [u.role],
    })),
  });
}

// POST /api/admin-web/auth
// body: { secret, lineUserId }
// Returns JWT token
export async function POST(req: NextRequest) {
  let body: { secret?: string; lineUserId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { secret, lineUserId } = body;

  if (!secret) {
    return NextResponse.json({ error: "missing secret" }, { status: 401 });
  }
  if (secret !== process.env.ADMIN_WEB_SECRET) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }
  if (!lineUserId) {
    return NextResponse.json({ error: "missing lineUserId" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  if (!isAdminOrBoss(user)) {
    return NextResponse.json(
      { error: "user does not have admin or boss role" },
      { status: 403 },
    );
  }

  const token = await createAdminWebJwt(lineUserId);
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
