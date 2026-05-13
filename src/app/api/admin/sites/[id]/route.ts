import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  region: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]).optional(),
  description: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  maxDepth: z.number().int().min(0).optional(),
  features: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  youtubeUrl: z.string().nullable().optional(),
  cautions: z.string().nullable().optional(),
});

// GET /api/admin/sites/[id] - 單筆
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const site = await prisma.diveSite.findUnique({ where: { id } });
  if (!site) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(site);
}

// PATCH /api/admin/sites/[id] - 編輯
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const data = PatchSchema.parse(await req.json());
  const site = await prisma.diveSite.update({
    where: { id },
    data: {
      ...data,
      youtubeUrl:
        data.youtubeUrl === "" ? null : (data.youtubeUrl ?? undefined),
      cautions:
        data.cautions === "" ? null : (data.cautions ?? undefined),
    },
  });
  return NextResponse.json({ ok: true, site });
}

// DELETE /api/admin/sites/[id] - 刪除
// 安全檢查：若已有 trip 引用此潛點，禁止刪除
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const usedInTrips = await prisma.divingTrip.count({
    where: { diveSiteIds: { has: id } },
  });
  if (usedInTrips > 0) {
    return NextResponse.json(
      {
        error: `這個潛點還被 ${usedInTrips} 個場次引用，不能刪除。請先把那些場次的潛點改掉，或永久刪除那些場次。`,
      },
      { status: 409 },
    );
  }
  const usedInTours = await prisma.tourPackage.count({
    where: { diveSiteIds: { has: id } },
  });
  if (usedInTours > 0) {
    return NextResponse.json(
      {
        error: `這個潛點還被 ${usedInTours} 個潛水團引用，不能刪除。`,
      },
      { status: 409 },
    );
  }

  await prisma.diveSite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
