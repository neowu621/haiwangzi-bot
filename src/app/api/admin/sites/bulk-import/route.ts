import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 單筆 row 的 schema（給 bulk import 用）
// 不強制全欄齊全，只需 id + name + region 必填，其他選填
const RowSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "id 只能用小寫英數、底線、橫線"),
  name: z.string().min(1),
  region: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]),
  description: z.string().default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  maxDepth: z.union([z.string().max(32), z.number(), z.null()])
    .transform((v) => v == null ? "" : String(v))
    .default(""),
  features: z.array(z.string()).default([]),
  youtubeUrl: z.string().optional().or(z.literal("")).default(""),
  locationUrl: z.string().optional().or(z.literal("")).default(""),
  cautions: z.string().optional().or(z.literal("")).default(""),
});

const BodySchema = z.object({
  rows: z.array(RowSchema).min(1).max(500),
  mode: z.enum(["create", "upsert"]).default("create"), // create: 預設都當新增
});

// POST /api/admin/sites/bulk-import
// body: { rows: [{id, name, region, ...}], mode: "upsert" | "create" }
// 回傳：{ ok, created, updated, errors: [{row, message}] }
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
  const { rows, mode } = parsed.data;

  let created = 0;
  let updated = 0;
  const errors: { row: number; id: string; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const data = {
        ...r,
        youtubeUrl: r.youtubeUrl || null,
        locationUrl: r.locationUrl || null,
        cautions: r.cautions || null,
      };
      const existing = await prisma.diveSite.findUnique({ where: { id: r.id } });
      if (existing) {
        if (mode === "create") {
          errors.push({ row: i + 1, id: r.id, message: "id 已存在" });
          continue;
        }
        await prisma.diveSite.update({ where: { id: r.id }, data });
        updated++;
      } else {
        await prisma.diveSite.create({ data });
        created++;
      }
    } catch (e) {
      errors.push({
        row: i + 1,
        id: r.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "site.bulk_import",
    targetType: "site",
    metadata: { total: rows.length, created, updated, errorCount: errors.length },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    total: rows.length,
    created,
    updated,
    errors,
  });
}
