import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/coach/media/[id] - 教練刪除自己的 (admin 可刪任何)
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const m = await prisma.tripMedia.findUnique({ where: { id } });
  if (!m)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  if (auth.user.role !== "admin" && m.createdBy !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your media" }, { status: 403 });
  }

  await prisma.tripMedia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
