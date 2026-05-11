import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/users
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const users = await prisma.user.findMany({
    orderBy: { lastActiveAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ users });
}

const PatchSchema = z.object({
  lineUserId: z.string(),
  role: z.enum(["customer", "coach", "admin"]),
});

// POST /api/admin/users (改 role)
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const data = PatchSchema.parse(await req.json());
  const updated = await prisma.user.update({
    where: { lineUserId: data.lineUserId },
    data: { role: data.role },
  });
  return NextResponse.json({ ok: true, user: updated });
}
