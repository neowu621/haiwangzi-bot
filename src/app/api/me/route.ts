import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me - 取自己的 profile + 統計
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const totalBookings = await prisma.booking.count({
    where: { userId: auth.user.lineUserId },
  });
  const completed = await prisma.booking.count({
    where: { userId: auth.user.lineUserId, status: "completed" },
  });

  const u = auth.user;
  return NextResponse.json({
    lineUserId: u.lineUserId,
    displayName: u.displayName,
    realName: u.realName,
    phone: u.phone,
    email: u.email,
    notifyByLine: u.notifyByLine,
    notifyByEmail: u.notifyByEmail,
    cert: u.cert,
    certNumber: u.certNumber,
    logCount: u.logCount,
    role: u.role,
    // 新版多重身分；空陣列 fallback 為 [role]
    roles: u.roles && u.roles.length > 0 ? u.roles : [u.role],
    vipLevel: u.vipLevel ?? 1,
    totalSpend: u.totalSpend ?? 0,
    notes: u.notes,
    emergencyContact: u.emergencyContact,
    companions: u.companions ?? [],
    createdAt: u.createdAt,
    stats: {
      totalBookings,
      completed,
    },
  });
}

const CompanionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  cert: z.enum(["OW", "AOW", "Rescue", "DM", "Instructor"]).nullable().optional(),
  certNumber: z.string().optional().default(""),
  logCount: z.number().int().min(0).optional().default(0),
  relationship: z.string().optional().default(""),
});

const PatchSchema = z.object({
  realName: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .email("email 格式不對")
    .max(254)
    .nullable()
    .optional()
    .or(z.literal("")),
  notifyByLine: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  cert: z.enum(["OW", "AOW", "Rescue", "DM", "Instructor"]).nullable().optional(),
  certNumber: z.string().nullable().optional(),
  logCount: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  emergencyContact: z
    .object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
    .nullable()
    .optional(),
  companions: z.array(CompanionSchema).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) {
      // 空字串 → null（避免 DB 存空字串）
      data[k] = v === "" ? null : v;
    }
  }
  try {
    const updated = await prisma.user.update({
      where: { lineUserId: auth.user.lineUserId },
      data,
    });
    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    console.error("[PATCH /api/me]", e);
    return NextResponse.json(
      { error: "update failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
