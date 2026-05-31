import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/media-posts — 列出全部（含隱藏）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  try {
    const posts = await prisma.mediaPost.findMany({
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 200,
    });
    return NextResponse.json({ posts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /admin/media-posts]", e);
    return NextResponse.json(
      { error: `查詢失敗：${msg}`, hint: "若包含 'relation does not exist'，需 Zeabur Redeploy 跑 migrate-safety" },
      { status: 500 },
    );
  }
}

const CreateSchema = z.object({
  source: z.string().default("manual"),
  externalId: z.string().nullable().optional(),
  title: z.string().min(1, "標題必填"),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  linkUrl: z.string().url("連結需為有效 URL"),
  publishedAt: z.string().optional(), // ISO 字串，預設 now
  visible: z.boolean().default(true),
  pinned: z.boolean().default(false),
});

// POST /api/admin/media-posts — 新增
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    const post = await prisma.mediaPost.create({
      data: {
        source: data.source,
        externalId: data.externalId ?? null,
        title: data.title,
        description: data.description ?? null,
        imageUrl: data.imageUrl ?? null,
        linkUrl: data.linkUrl,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
        visible: data.visible,
        pinned: data.pinned,
      },
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "media_post.create",
      targetType: "media_post",
      targetId: post.id,
      targetLabel: post.title,
    });
    return NextResponse.json({ ok: true, post });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /admin/media-posts]", e);
    return NextResponse.json({ error: `新增失敗：${msg}` }, { status: 500 });
  }
}
