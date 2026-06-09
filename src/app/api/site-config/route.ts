import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SITE_CONFIG,
  DEFAULT_CARDS,
  type SiteConfig,
} from "@/lib/site-config";
import { PUBLIC_STATIC_CACHE_HEADERS } from "@/lib/http-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/site-config — 公開讀取，給 Welcome 頁套用
// 若 DB 沒設定，回傳預設值
export async function GET() {
  const row = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    return NextResponse.json({
      ...DEFAULT_SITE_CONFIG,
      gearRentalPrices: {},
      defaultTripPricing: {},
    }, { headers: PUBLIC_STATIC_CACHE_HEADERS });
  }
  const cards = Array.isArray(row.cards) && row.cards.length > 0
    ? (row.cards as unknown as SiteConfig["cards"])
    : DEFAULT_CARDS;
  return NextResponse.json({
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    heroGreeting: row.heroGreeting,
    cards,
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
    gearRentalPrices: row.gearRentalPrices ?? {},
    defaultTripPricing: row.defaultTripPricing ?? {},
  }, { headers: PUBLIC_STATIC_CACHE_HEADERS });
}
