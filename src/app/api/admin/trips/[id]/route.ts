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
  notes: z.string().nullable().optional(),
  meetingPoint: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
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
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

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
  if (data.notes !== undefined) patch.notes = data.notes === "" ? null : data.notes;
  if (data.meetingPoint !== undefined)
    patch.meetingPoint = data.meetingPoint === "" ? null : data.meetingPoint;
  if (data.images !== undefined) patch.images = data.images;

  try {
    const trip = await prisma.divingTrip.update({ where: { id }, data: patch });
    return NextResponse.json({ ok: true, trip });
  } catch (e) {
    console.error("[PATCH /admin/trips]", e);
    return NextResponse.json(
      {
        error: "update failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/trips/[id]              → 軟取消 (status=cancelled, row 留著)
// DELETE /api/admin/trips/[id]?permanent=true → 硬刪除 (從 DB 移除)
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
  const url = new URL(req.url);
  const permanent = url.searchParams.get("permanent") === "true";

  if (permanent) {
    // 安全檢查：若有 confirmed booking 不讓刪
    const hasBookings = await prisma.booking.count({
      where: {
        refId: id,
        type: "daily",
        status: { notIn: ["cancelled_by_user", "cancelled_by_weather"] },
      },
    });
    if (hasBookings > 0) {
      return NextResponse.json(
        {
          error: `cannot permanently delete: ${hasBookings} active bookings still reference this trip. Cancel bookings first.`,
        },
        { status: 400 },
      );
    }
    try {
      await prisma.divingTrip.delete({ where: { id } });
      return NextResponse.json({ ok: true, action: "hard_deleted" });
    } catch (e) {
      console.error("[DELETE /admin/trips permanent]", e);
      return NextResponse.json(
        {
          error: "permanent delete failed",
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  }

  // 軟取消
  try {
    const trip = await prisma.divingTrip.update({
      where: { id },
      data: { status: "cancelled" },
    });
    return NextResponse.json({ ok: true, action: "soft_cancelled", trip });
  } catch (e) {
    console.error("[DELETE /admin/trips soft]", e);
    return NextResponse.json(
      {
        error: "cancel failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
