import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { genTourCode } from "@/lib/code-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 單筆 row schema — 客戶端會把名稱解析後的 id 陣列送上來
const RowSchema = z.object({
  title: z.string().min(1, "標題不能為空"),
  destination: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "出發日格式需為 YYYY-MM-DD"),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "結束日格式需為 YYYY-MM-DD"),
  basePrice: z.number().int().min(0).default(0),
  deposit: z.number().int().min(0).default(0),
  capacity: z.number().int().min(0).default(10), // 0 = ∞
  depositDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  finalDeadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  depositReminderDays: z.number().int().min(0).default(7),
  finalReminderDays: z.number().int().min(0).default(30),
  guideReminderDays: z.number().int().min(0).default(2),
  diveSiteIds: z.array(z.string()).default([]),
  includes: z.array(z.string()).default([]),
  excludes: z.array(z.string()).default([]),
});

const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(100),
});

// POST /api/admin/tours/bulk-import
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
  const errors: { row: number; title: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const code = await genTourCode();
      await prisma.tourPackage.create({
        data: {
          code,
          title: r.title,
          destination: r.destination,
          dateStart: new Date(r.dateStart),
          dateEnd: new Date(r.dateEnd),
          basePrice: r.basePrice,
          deposit: r.deposit,
          capacity: r.capacity === 0 ? null : r.capacity,
          depositDeadline: r.depositDeadline ? new Date(r.depositDeadline) : null,
          finalDeadline: r.finalDeadline ? new Date(r.finalDeadline) : null,
          depositReminderDays: r.depositReminderDays,
          finalReminderDays: r.finalReminderDays,
          guideReminderDays: r.guideReminderDays,
          diveSiteIds: r.diveSiteIds,
          includes: r.includes,
          excludes: r.excludes,
          itinerary: [] as never,
          addons: [] as never,
          images: [],
          status: "open",
        },
      });
      created++;
    } catch (e) {
      errors.push({
        row: i + 1,
        title: r.title,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "tour.bulk_import",
    targetType: "tour",
    metadata: { total: rows.length, created, errorCount: errors.length },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    total: rows.length,
    created,
    errors,
  });
}
