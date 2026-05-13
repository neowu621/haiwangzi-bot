import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/coaches - 用於開團選教練
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });
  const coaches = await prisma.coach.findMany({
    where: { active: true },
    orderBy: { realName: "asc" },
    select: { id: true, realName: true, cert: true, lineUserId: true },
  });
  return NextResponse.json({ coaches });
}
