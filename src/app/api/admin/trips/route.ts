import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/trips - 全部日潛場次（含過去）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const trips = await prisma.divingTrip.findMany({
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
    take: 200,
  });

  // 算 booked
  const tripIds = trips.map((t) => t.id);
  const bookings = await prisma.booking.groupBy({
    by: ["refId"],
    where: {
      refId: { in: tripIds },
      type: "daily",
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    _sum: { participants: true },
  });
  const bookingMap = new Map(bookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  return NextResponse.json({
    trips: trips.map((t) => ({
      ...t,
      booked: bookingMap.get(t.id) ?? 0,
    })),
  });
}

const CreateSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  startTime: z.string(), // HH:MM
  isNightDive: z.boolean().default(false),
  isScooter: z.boolean().default(false),
  diveSiteIds: z.array(z.string()).default([]),
  tankCount: z.number().int().min(1).max(5).default(3),
  capacity: z.number().int().min(0).nullable().default(8), // null/0 = 無上限
  coachIds: z.array(z.string()).default([]),
  pricing: z.object({
    baseTrip: z.number().int(),
    extraTank: z.number().int(),
    nightDive: z.number().int().default(0),
    scooterRental: z.number().int().default(0),
  }),
  notes: z.string().optional().or(z.literal("")),
});

// POST /api/admin/trips - 新增日潛場次
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = CreateSchema.parse(await req.json());
  const trip = await prisma.divingTrip.create({
    data: {
      date: new Date(data.date),
      startTime: data.startTime,
      isNightDive: data.isNightDive,
      isScooter: data.isScooter,
      diveSiteIds: data.diveSiteIds,
      tankCount: data.tankCount,
      capacity: data.capacity === 0 ? null : data.capacity,
      coachIds: data.coachIds,
      pricing: data.pricing,
      notes: data.notes || null,
      status: "open",
    },
  });
  return NextResponse.json({ ok: true, trip });
}
