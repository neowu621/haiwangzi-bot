import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  date: z.string().optional(),
  startTime: z.string().optional(),
  isNightDive: z.boolean().optional(),
  isScooter: z.boolean().optional(),
  diveSiteIds: z.array(z.string()).optional(),
  tankCount: z.number().int().min(1).max(5).optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  coachIds: z.array(z.string()).optional(),
  pricing: z
    .object({
      baseTrip: z.number().int(),
      extraTank: z.number().int(),
      nightDive: z.number().int(),
      scooterRental: z.number().int(),
    })
    .optional(),
  status: z.enum(["open", "full", "cancelled", "completed"]).optional(),
  weatherNote: z.string().optional(),
});

// PATCH /api/admin/trips/[id] - 編輯場次
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const data = PatchSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (data.date) patch.date = new Date(data.date);
  if (data.startTime) patch.startTime = data.startTime;
  if (data.isNightDive !== undefined) patch.isNightDive = data.isNightDive;
  if (data.isScooter !== undefined) patch.isScooter = data.isScooter;
  if (data.diveSiteIds) patch.diveSiteIds = data.diveSiteIds;
  if (data.tankCount !== undefined) patch.tankCount = data.tankCount;
  if (data.capacity !== undefined) patch.capacity = data.capacity === 0 ? null : data.capacity;
  if (data.coachIds) patch.coachIds = data.coachIds;
  if (data.pricing) patch.pricing = data.pricing;
  if (data.status) patch.status = data.status;
  if (data.weatherNote !== undefined) patch.weatherNote = data.weatherNote;

  const trip = await prisma.divingTrip.update({ where: { id }, data: patch });
  return NextResponse.json({ ok: true, trip });
}

// DELETE /api/admin/trips/[id] - 取消場次
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;

  // 軟取消（不刪 row，改 status=cancelled）
  const trip = await prisma.divingTrip.update({
    where: { id },
    data: { status: "cancelled" },
  });
  return NextResponse.json({ ok: true, trip });
}
