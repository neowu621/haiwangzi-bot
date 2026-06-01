import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().optional(),
  destination: z
    .enum(["northeast", "green_island", "lanyu", "kenting", "other"])
    .optional(),
  dateStart: z.string().optional(),
  dateEnd: z.string().optional(),
  basePrice: z.number().int().optional(),
  deposit: z.number().int().optional(),
  capacity: z.number().int().nullable().optional(),
  depositDeadline: z.string().nullable().optional(),
  finalDeadline: z.string().nullable().optional(),
  depositReminderDays: z.number().int().optional(),
  finalReminderDays: z.number().int().optional(),
  guideReminderDays: z.number().int().optional(),
  itinerary: z.array(z.unknown()).optional(),
  diveSiteIds: z.array(z.string()).optional(),
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  addons: z.array(z.unknown()).optional(),
  images: z.array(z.string()).optional(),
  status: z.enum(["open", "full", "cancelled", "completed"]).optional(),
  // v186 行銷欄位
  subtitle: z.string().nullable().optional(),
  durationLabel: z.string().nullable().optional(),
  roomLabel: z.string().nullable().optional(),
  diveStyles: z.array(z.string()).optional(),
  beginnerFriendly: z.boolean().optional(),
  tanksCount: z.number().int().min(0).nullable().optional(),
  siteList: z.string().nullable().optional(),
  pricingNotes: z.string().nullable().optional(),
  extraNote: z.string().nullable().optional(),
});

// PATCH /api/admin/tours/[id]
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
  if (data.title !== undefined) patch.title = data.title;
  if (data.destination !== undefined) patch.destination = data.destination;
  if (data.dateStart) patch.dateStart = new Date(data.dateStart);
  if (data.dateEnd) patch.dateEnd = new Date(data.dateEnd);
  if (data.basePrice !== undefined) patch.basePrice = data.basePrice;
  if (data.deposit !== undefined) patch.deposit = data.deposit;
  if (data.capacity !== undefined)
    patch.capacity = data.capacity === 0 ? null : data.capacity;
  if (data.depositDeadline !== undefined)
    patch.depositDeadline = data.depositDeadline
      ? new Date(data.depositDeadline)
      : null;
  if (data.finalDeadline !== undefined)
    patch.finalDeadline = data.finalDeadline ? new Date(data.finalDeadline) : null;
  if (data.depositReminderDays !== undefined)
    patch.depositReminderDays = data.depositReminderDays;
  if (data.finalReminderDays !== undefined)
    patch.finalReminderDays = data.finalReminderDays;
  if (data.guideReminderDays !== undefined)
    patch.guideReminderDays = data.guideReminderDays;
  if (data.itinerary) patch.itinerary = data.itinerary;
  if (data.diveSiteIds) patch.diveSiteIds = data.diveSiteIds;
  if (data.includes) patch.includes = data.includes;
  if (data.excludes) patch.excludes = data.excludes;
  if (data.addons) patch.addons = data.addons;
  if (data.images) patch.images = data.images;
  if (data.status) patch.status = data.status;
  if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
  if (data.durationLabel !== undefined) patch.durationLabel = data.durationLabel;
  if (data.roomLabel !== undefined) patch.roomLabel = data.roomLabel;
  if (data.diveStyles !== undefined) patch.diveStyles = data.diveStyles;
  if (data.beginnerFriendly !== undefined) patch.beginnerFriendly = data.beginnerFriendly;
  if (data.tanksCount !== undefined) patch.tanksCount = data.tanksCount;
  if (data.siteList !== undefined) patch.siteList = data.siteList;
  if (data.pricingNotes !== undefined) patch.pricingNotes = data.pricingNotes;
  if (data.extraNote !== undefined) patch.extraNote = data.extraNote;

  try {
    const tour = await prisma.tourPackage.update({ where: { id }, data: patch });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "tour.update",
      targetType: "tour",
      targetId: id,
      metadata: patch,
    });
    return NextResponse.json({ ok: true, tour });
  } catch (e) {
    console.error("[PATCH /admin/tours]", e);
    return NextResponse.json(
      { error: "update failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/tours/[id]              → 軟取消
// DELETE /api/admin/tours/[id]?permanent=true → 硬刪除
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
    const hasBookings = await prisma.booking.count({
      where: {
        refId: id,
        type: "tour",
        status: { notIn: ["cancelled_by_user", "cancelled_by_weather"] },
      },
    });
    if (hasBookings > 0) {
      return NextResponse.json(
        {
          error: `cannot permanently delete: ${hasBookings} active bookings still reference this tour`,
        },
        { status: 400 },
      );
    }
    await prisma.tourPackage.delete({ where: { id } });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "tour.delete",
      targetType: "tour",
      targetId: id,
    });
    return NextResponse.json({ ok: true, action: "hard_deleted" });
  }

  const tour = await prisma.tourPackage.update({
    where: { id },
    data: { status: "cancelled" },
  });
  await logAudit({
    actorId: auth.user.lineUserId,
    action: "tour.delete",
    targetType: "tour",
    targetId: id,
  });
  return NextResponse.json({ ok: true, action: "soft_cancelled", tour });
}
