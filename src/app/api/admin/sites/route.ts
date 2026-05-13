import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/sites - 全部潛點（admin 編輯用 / 開團選潛點用）
// 回傳格式：直接 array，相容於既有 admin/trips 頁面
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  // admin 拿完整資料；coach 只拿基本欄位（開團用）
  if (auth.user.role === "admin") {
    const sites = await prisma.diveSite.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(sites);
  }
  const sites = await prisma.diveSite.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, region: true, difficulty: true },
  });
  return NextResponse.json(sites);
}

const CreateSchema = z.object({
  id: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/, "id 只能用小寫英數、底線、橫線"),
  name: z.string().min(1),
  region: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]),
  description: z.string().default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  maxDepth: z.number().int().min(0).default(0),
  features: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  youtubeUrl: z.string().url().optional().or(z.literal("")),
  cautions: z.string().optional().or(z.literal("")),
});

// POST /api/admin/sites - 新增潛點
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = CreateSchema.parse(await req.json());
  try {
    const site = await prisma.diveSite.create({
      data: {
        ...data,
        youtubeUrl: data.youtubeUrl || null,
        cautions: data.cautions || null,
      },
    });
    return NextResponse.json({ ok: true, site });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `潛點 id "${data.id}" 已存在` },
        { status: 409 },
      );
    }
    throw e;
  }
}
