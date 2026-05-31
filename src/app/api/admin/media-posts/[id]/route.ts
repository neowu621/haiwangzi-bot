import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  linkUrl: z.string().url().optional(),
  publishedAt: z.string().optional(),
  visible: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

// PATCH /api/admin/media-posts/[id]
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.description !== undefined) patch.description = data.description === "" ? null : data.description;
  if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl === "" ? null : data.imageUrl;
  if (data.linkUrl !== undefined) patch.linkUrl = data.linkUrl;
  if (data.publishedAt !== undefined) patch.publishedAt = new Date(data.publishedAt);
  if (data.visible !== undefined) patch.visible = data.visible;
  if (data.pinned !== undefined) patch.pinned = data.pinned;

  try {
    const post = await prisma.mediaPost.update({ where: { id }, data: patch });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "media_post.update",
      targetType: "media_post",
      targetId: id,
      metadata: patch,
    });
    return NextResponse.json({ ok: true, post });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `更新失敗：${msg}` }, { status: 500 });
  }
}

// DELETE /api/admin/media-posts/[id]
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  try {
    const existing = await prisma.mediaPost.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.mediaPost.delete({ where: { id } });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "media_post.delete",
      targetType: "media_post",
      targetId: id,
      targetLabel: existing.title,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `刪除失敗：${msg}` }, { status: 500 });
  }
}
