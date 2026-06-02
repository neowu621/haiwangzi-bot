import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  ACCENT_PALETTE,
  ICON_NAMES,
  DEFAULT_SITE_CONFIG,
} from "@/lib/site-config";
import { logAudit } from "@/lib/audit";

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
  gearRentalPrices: z.record(z.number()).optional(),
  defaultTripPricing: z.object({
    baseTrip: z.number().int().min(0),
    extraTank: z.number().int().min(0),
    nightDive: z.number().int().min(0),
    scooterRental: z.number().int().min(0),
  }).optional(),
  defaultCoachFee: z.number().int().min(0).optional(),
  // v184/v185：抵用金有效天數系列（0 = 永不過期）
  birthdayCreditExpiryDays: z.number().int().min(0).max(3650).optional(),
  vipUpgradeCreditExpiryDays: z.number().int().min(0).max(3650).optional(),
  adminGrantCreditExpiryDays: z.number().int().min(0).max(3650).optional(),
  refundCreditExpiryDays: z.number().int().min(0).max(3650).optional(),
  birthdayCreditAmount: z.number().int().min(0).optional(),
  vipUpgradeCredits: z.record(z.number()).optional(),
  weatherWindThreshold: z.number().int().min(1).max(50).optional(),
  // 外部連結（FB 社群、IG、YouTube、LINE OA QR 等）
  externalLinks: z.object({
    fbGroupUrl: z.string().url().optional().or(z.literal("")),
    mediaUrl: z.string().url().optional().or(z.literal("")),
    youtubeChannelUrl: z.string().url().optional().or(z.literal("")),
    instagramUrl: z.string().url().optional().or(z.literal("")),
    lineOaQrUrl: z.string().url().optional().or(z.literal("")),  // LINE OA QR 圖片 URL
  }).optional(),
  // 付款資訊（銀行 + LINE Pay）— v160 起改用 DB 管理
  paymentInfo: z.object({
    bank: z.object({
      name: z.string().default(""),
      branch: z.string().default(""),
      account: z.string().default(""),
      holder: z.string().default(""),
    }).optional(),
    linepay: z.object({
      qrUrl: z.string().default(""),    // QR code 圖片 URL（個人轉帳 QR）
      liteId: z.string().default(""),   // LINE Pay Lite ID
    }).optional(),
  }).optional(),
  // v227：取消政策（純文字，admin 可編輯，FAQ + 預約頁同步顯示）
  cancellationPolicy: z.string().max(5000).optional(),
  // v257：安全政策（純文字，admin 可編輯，FAQ + 預約頁同步顯示）
  safetyPolicy: z.string().max(5000).optional(),
  // v261：首單付款獎勵
  firstOrderRewardAmount: z.number().int().min(0).optional(),
  firstOrderRewardExpiryDays: z.number().int().min(0).max(3650).optional(),
  // v264：自動發送（每日天氣回報）
  dailyWeatherReportEnabled: z.boolean().optional(),
  dailyWeatherReportRecipients: z.array(z.string()).optional(),
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
    return NextResponse.json({
      config: {
        ...DEFAULT_SITE_CONFIG,
        gearRentalPrices: {},
        defaultTripPricing: {},
        defaultCoachFee: 1500,
        weatherWindThreshold: 10,
        birthdayCreditAmount: 100,
        birthdayCreditExpiryDays: 360,
        vipUpgradeCredits: {},
        externalLinks: {},
        paymentInfo: {},
      },
      isDefault: true,
    });
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
      gearRentalPrices: row.gearRentalPrices,
      defaultTripPricing: row.defaultTripPricing,
      defaultCoachFee: row.defaultCoachFee,
      weatherWindThreshold: row.weatherWindThreshold,
      birthdayCreditAmount: row.birthdayCreditAmount,
      birthdayCreditExpiryDays: row.birthdayCreditExpiryDays ?? 360,
      vipUpgradeCreditExpiryDays: row.vipUpgradeCreditExpiryDays ?? 360,
      adminGrantCreditExpiryDays: row.adminGrantCreditExpiryDays ?? 360,
      refundCreditExpiryDays: row.refundCreditExpiryDays ?? 0,
      vipUpgradeCredits: row.vipUpgradeCredits,
      externalLinks: row.externalLinks ?? {},
      paymentInfo: row.paymentInfo ?? {},
      cancellationPolicy: row.cancellationPolicy ?? "",
      safetyPolicy: row.safetyPolicy ?? "",
      firstOrderRewardAmount: (row as unknown as { firstOrderRewardAmount?: number }).firstOrderRewardAmount ?? 100,
      firstOrderRewardExpiryDays: (row as unknown as { firstOrderRewardExpiryDays?: number }).firstOrderRewardExpiryDays ?? 360,
      // v264 自動發送
      dailyWeatherReportEnabled: (row as unknown as { dailyWeatherReportEnabled?: boolean }).dailyWeatherReportEnabled ?? false,
      dailyWeatherReportRecipients: ((row as unknown as { dailyWeatherReportRecipients?: unknown }).dailyWeatherReportRecipients as string[] | undefined) ?? [],
      dailyWeatherReportLastSentAt: (row as unknown as { dailyWeatherReportLastSentAt?: Date | null }).dailyWeatherReportLastSentAt ?? null,
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
  await logAudit({
    actorId: auth.user.lineUserId,
    action: "config.update",
    targetType: "config",
    targetId: "default",
    metadata: data as Record<string, unknown>,
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
