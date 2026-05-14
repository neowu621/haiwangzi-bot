import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  ACCENT_PALETTE,
  ICON_NAMES,
  DEFAULT_SITE_CONFIG,
} from "@/lib/site-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CardSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  enLabel: z.string().default(""),
  desc: z.string().default(""),
  href: z.string().min(1),
  external: z.boolean().default(false),
  icon: z.enum(ICON_NAMES),
  accent: z.enum(ACCENT_PALETTE),
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

const PatchSchema = z.object({
  heroTitle: z.string().optional(),
  heroSubtitle: z.string().optional(),
  heroGreeting: z.string().optional(),
  cards: z.array(CardSchema).optional(),
  seaEnabled: z.boolean().optional(),
  seaTitle: z.string().optional(),
  seaInfo: z.string().optional(),
  seaCtaLabel: z.string().nullable().optional(),
  seaCtaHref: z.string().nullable().optional(),
  footerSloganZh: z.string().optional(),
  footerSloganEn: z.string().optional(),
  splashEnabled: z.boolean().optional(),
  splashDurationMs: z.number().int().min(0).max(60000).optional(),
  splashCooldownMs: z.number().int().min(0).max(86400000).optional(),
  weatherAutoCancel: z.boolean().optional(),
});

// GET /api/admin/site-config - admin 編輯用 (含當前值或預設)
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    return NextResponse.json({ config: DEFAULT_SITE_CONFIG, isDefault: true });
  }
  return NextResponse.json({
    config: {
      heroTitle: row.heroTitle,
      heroSubtitle: row.heroSubtitle,
      heroGreeting: row.heroGreeting,
      cards: row.cards,
      seaEnabled: row.seaEnabled,
      seaTitle: row.seaTitle,
      seaInfo: row.seaInfo,
      seaCtaLabel: row.seaCtaLabel,
      seaCtaHref: row.seaCtaHref,
      footerSloganZh: row.footerSloganZh,
      footerSloganEn: row.footerSloganEn,
      splashEnabled: row.splashEnabled,
      splashDurationMs: row.splashDurationMs,
      splashCooldownMs: row.splashCooldownMs,
      weatherAutoCancel: row.weatherAutoCancel,
    },
    isDefault: false,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  });
}

// POST /api/admin/site-config - 更新 (整段或單欄)
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = PatchSchema.parse(await req.json());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: any = { ...data, updatedBy: auth.user.lineUserId };

  const row = await prisma.siteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ...patch },
    update: patch,
  });
  return NextResponse.json({ ok: true, config: row });
}

// DELETE /api/admin/site-config - 還原預設
export async function DELETE(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });
  await prisma.siteConfig.delete({ where: { id: "default" } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
