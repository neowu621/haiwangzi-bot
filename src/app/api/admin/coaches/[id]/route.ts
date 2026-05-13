import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  realName: z.string().min(1).optional(),
  cert: z.enum(["DM", "Instructor", "CourseDirector"]).optional(),
  specialty: z.array(z.string()).optional(),
  feePerDive: z.number().int().min(0).optional(),
  note: z.string().nullable().optional(),
  lineUserId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

// PATCH /api/admin/coaches/[id] - 編輯教練
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
  const coach = await prisma.coach.update({
    where: { id },
    data: {
      ...data,
      note: data.note === "" ? null : (data.note ?? undefined),
      lineUserId:
        data.lineUserId === "" ? null : (data.lineUserId ?? undefined),
    },
  });
  return NextResponse.json({ ok: true, coach });
}

// DELETE /api/admin/coaches/[id]
// 預設「軟刪除」(active=false)；?permanent=true 才真刪
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
  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  if (!permanent) {
    await prisma.coach.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true, mode: "soft" });
  }

  // 永久刪除：先檢查有沒有 trip 引用
  const usedInTrips = await prisma.divingTrip.count({
    where: { coachIds: { has: id } },
  });
  if (usedInTrips > 0) {
    return NextResponse.json(
      {
        error: `這個教練還被 ${usedInTrips} 個場次引用，不能永久刪除。建議改成「停用」(active=false) 就好。`,
      },
      { status: 409 },
    );
  }
  await prisma.coach.delete({ where: { id } });
  return NextResponse.json({ ok: true, mode: "hard" });
}
