import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { genTripCode } from "@/lib/code-gen";

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

  try {
    const trips = await prisma.divingTrip.findMany({
      orderBy: [{ date: "desc" }, { startTime: "asc" }],
      take: 200,
    });

    // v224：除了 booked 人數，再算實際收費總額（用真實 booking.totalAmount 加總）
    //   排除：取消 / no_show / 退款中 / 已退款
    const tripIds = trips.map((t) => t.id);
    const bookings = tripIds.length === 0
      ? []
      : await prisma.booking.groupBy({
          by: ["refId"],
          where: {
            refId: { in: tripIds },
            type: "daily",
            status: {
              notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
            },
            paymentStatus: {
              notIn: ["refunding", "refunded"],
            },
          },
          _sum: { participants: true, totalAmount: true, paidAmount: true },
        });
    const bookingMap = new Map(
      bookings.map((b) => [
        b.refId,
        {
          participants: b._sum.participants ?? 0,
          revenue: b._sum.totalAmount ?? 0,
          paid: b._sum.paidAmount ?? 0,
        },
      ]),
    );

    return NextResponse.json({
      trips: trips.map((t) => {
        const stats = bookingMap.get(t.id);
        return {
          ...t,
          booked: stats?.participants ?? 0,
          revenue: stats?.revenue ?? 0,
          paid: stats?.paid ?? 0,
        };
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/trips] error:", msg, e);
    return NextResponse.json(
      {
        error: `場次查詢失敗：${msg}`,
        hint: "若包含 'column does not exist'，代表 DB schema 沒同步；請去 Zeabur 重新部署或檢查 docker-entrypoint logs",
      },
      { status: 500 },
    );
  }
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
    baseTrip: z.number().int().default(0),
    extraTank: z.number().int().default(0),
    nightDive: z.number().int().default(0),
    scooterRental: z.number().int().default(0),
    otherFee: z.number().int().default(0).optional(),
    otherFeeNote: z.string().optional(),
  }),
  status: z.enum(["open", "full", "cancelled", "completed"]).optional(),
  notes: z.string().nullable().optional().or(z.literal("")),
  meetingPoint: z.string().nullable().optional().or(z.literal("")),
  meetingPointUrl: z.string().nullable().optional().or(z.literal("")),
  referenceVideoUrl: z.string().nullable().optional().or(z.literal("")),
  images: z.array(z.string()).default([]),
});

// POST /api/admin/trips - 新增日潛場次
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch (e) {
    return NextResponse.json(
      { error: "invalid JSON", detail: String(e) },
      { status: 400 },
    );
  }

  const parsed = CreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.error("[POST /admin/trips] zod error", parsed.error.issues);
    return NextResponse.json(
      {
        error: "validation failed",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    const code = await genTripCode();
    const trip = await prisma.divingTrip.create({
      data: {
        code,
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
        meetingPoint: data.meetingPoint || null,
        meetingPointUrl: data.meetingPointUrl || null,
        referenceVideoUrl: data.referenceVideoUrl || null,
        images: data.images ?? [],
        status: (data.status ?? "open") as "open" | "full" | "cancelled" | "completed",
      },
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "trip.create",
      targetType: "trip",
      targetId: trip.id,
      targetLabel: data.date,
      metadata: { date: data.date, diveSiteIds: data.diveSiteIds },
    });
    return NextResponse.json({ ok: true, trip });
  } catch (e) {
    console.error("[POST /admin/trips] prisma error", e);
    return NextResponse.json(
      {
        error: "DB insert failed",
        detail: e instanceof Error ? e.message : String(e),
        hint: "若包含 column does not exist，代表 prisma db push 沒成功，請去 Zeabur 重 deploy 或檢查 DATABASE_URL",
      },
      { status: 500 },
    );
  }
}
