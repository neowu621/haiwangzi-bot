import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { genTripCode } from "@/lib/code-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 單筆 row schema — 客戶端會把名稱解析後的 ID 陣列送上來
const RowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式需為 YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "時間格式需為 HH:MM"),
  isNightDive: z.boolean().default(false),
  isScooter: z.boolean().default(false),
  diveSiteIds: z.array(z.string()).default([]),
  tankCount: z.number().int().min(1).max(5).default(3),
  capacity: z.number().int().min(0).default(8), // 0 = ∞
  coachIds: z.array(z.string()).default([]),
  pricing: z.object({
    baseTrip: z.number().int().default(0),
    extraTank: z.number().int().default(0),
    nightDive: z.number().int().default(0),
    scooterRental: z.number().int().default(0),
    otherFee: z.number().int().default(0),
    otherFeeNote: z.string().default(""),
  }),
  notes: z.string().default(""),
  meetingPoint: z.string().default(""),
  meetingPointUrl: z.string().default(""),
  status: z.enum(["open", "full", "cancelled", "completed"]).default("open"),
});

const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(200),
});

// POST /api/admin/trips/bulk-import
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { rows } = parsed.data;

  let created = 0;
  const errors: { row: number; date: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const code = await genTripCode();
      await prisma.divingTrip.create({
        data: {
          code,
          date: new Date(r.date),
          startTime: r.startTime,
          isNightDive: r.isNightDive,
          isScooter: r.isScooter,
          diveSiteIds: r.diveSiteIds,
          tankCount: r.tankCount,
          capacity: r.capacity === 0 ? null : r.capacity,
          coachIds: r.coachIds,
          pricing: r.pricing,
          notes: r.notes || null,
          meetingPoint: r.meetingPoint || null,
          meetingPointUrl: r.meetingPointUrl || null,
          images: [],
          status: r.status,
        },
      });
      created++;
    } catch (e) {
      errors.push({
        row: i + 1,
        date: `${r.date} ${r.startTime}`,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "trip.bulk_import",
    targetType: "trip",
    metadata: { total: rows.length, created, errorCount: errors.length },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    total: rows.length,
    created,
    errors,
  });
}
