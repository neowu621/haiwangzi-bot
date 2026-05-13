import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  title: z.string().min(1),
  destination: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]),
  dateStart: z.string(),
  dateEnd: z.string(),
  basePrice: z.number().int().min(0),
  deposit: z.number().int().min(0),
  capacity: z.number().int().min(0).nullable().default(10),
  depositDeadline: z.string().nullable().optional(),
  finalDeadline: z.string().nullable().optional(),
  depositReminderDays: z.number().int().min(0).default(7),
  finalReminderDays: z.number().int().min(0).default(30),
  guideReminderDays: z.number().int().min(0).default(2),
  itinerary: z.array(z.unknown()).default([]),
  diveSiteIds: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),
  excludes: z.array(z.string()).default([]),
  addons: z.array(z.unknown()).default([]),
  images: z.array(z.string()).default([]),
});

// GET /api/admin/tours
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });
  const tours = await prisma.tourPackage.findMany({
    orderBy: { dateStart: "asc" },
  });
  return NextResponse.json({ tours });
}

// POST /api/admin/tours - 新增潛水團
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });
  const data = CreateSchema.parse(await req.json());
  const tour = await prisma.tourPackage.create({
    data: {
      title: data.title,
      destination: data.destination,
      dateStart: new Date(data.dateStart),
      dateEnd: new Date(data.dateEnd),
      basePrice: data.basePrice,
      deposit: data.deposit,
      capacity: data.capacity === 0 ? null : data.capacity,
      depositDeadline: data.depositDeadline ? new Date(data.depositDeadline) : null,
      finalDeadline: data.finalDeadline ? new Date(data.finalDeadline) : null,
      depositReminderDays: data.depositReminderDays,
      finalReminderDays: data.finalReminderDays,
      guideReminderDays: data.guideReminderDays,
      itinerary: data.itinerary as never,
      diveSiteIds: data.diveSiteIds,
      includes: data.includes,
      excludes: data.excludes,
      addons: data.addons as never,
      images: data.images,
      status: "open",
    },
  });
  return NextResponse.json({ ok: true, tour });
}
