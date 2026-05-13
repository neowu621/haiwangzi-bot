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

// DELETE /api/admin/sites/[id]
//   預設：安全檢查，被 trip/tour 引用會擋 (409)
//   ?force=true：先把引用的 trip/tour 的 diveSiteIds 陣列裡的此 id 拉掉，再刪 site
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
  const force = new URL(req.url).searchParams.get("force") === "true";

  const tripsUsing = await prisma.divingTrip.findMany({
    where: { diveSiteIds: { has: id } },
    select: { id: true, diveSiteIds: true, date: true, startTime: true },
  });
  const toursUsing = await prisma.tourPackage.findMany({
    where: { diveSiteIds: { has: id } },
    select: { id: true, diveSiteIds: true, title: true },
  });

  if (!force && (tripsUsing.length > 0 || toursUsing.length > 0)) {
    return NextResponse.json(
      {
        error:
          `這個潛點還被 ${tripsUsing.length} 個場次 + ${toursUsing.length} 個潛水團引用。` +
          `若要強制刪除，會自動從引用的場次/團移除此潛點。`,
        usedInTrips: tripsUsing.length,
        usedInTours: toursUsing.length,
        canForce: true,
      },
      { status: 409 },
    );
  }

  // 強制刪除：先從引用陣列拉掉
  if (force) {
    await prisma.$transaction(async (tx) => {
      for (const t of tripsUsing) {
        await tx.divingTrip.update({
          where: { id: t.id },
          data: { diveSiteIds: t.diveSiteIds.filter((x) => x !== id) },
        });
      }
      for (const t of toursUsing) {
        await tx.tourPackage.update({
          where: { id: t.id },
          data: { diveSiteIds: t.diveSiteIds.filter((x) => x !== id) },
        });
      }
      await tx.diveSite.delete({ where: { id } });
    });
    return NextResponse.json({
      ok: true,
      forced: true,
      tripsUpdated: tripsUsing.length,
      toursUpdated: toursUsing.length,
    });
  }

  await prisma.diveSite.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
