import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_CANCELLATION_POLICY, DEFAULT_SAFETY_POLICY } from "@/lib/default-policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentInfo {
  bank?: { name?: string; branch?: string; account?: string; holder?: string };
  linepay?: { qrUrl?: string; liteId?: string };
}

// 公開 runtime config,給 client 端 fetch.
// 這樣不用依賴 NEXT_PUBLIC_* env (Zeabur Dockerfile 沒 ARG 注入問題)
export async function GET() {
  let externalLinks: Record<string, string> = {};
  let paymentInfo: PaymentInfo = {};
  let cancellationPolicy = DEFAULT_CANCELLATION_POLICY;
  let safetyPolicy = DEFAULT_SAFETY_POLICY;
  // v403：首頁影片清單 + 模式
  let homeVideosMode: "curated" | "auto" = "curated";
  let homeVideos: Array<{ id: string; title: string; isShort: boolean }> = [];
  // v406：最新動態進階
  let homeVideoFeaturedId = "";
  let homeVideoCount = 5;
  let homeVideoExcludeIds: string[] = [];
  let homeVideoFilter: "all" | "long" = "all";
  // v409：首頁學員怎麼說
  let homeTestimonials: Array<{ name: string; avatar: string; activity: string; text: string }> = [];
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (cfg?.externalLinks) {
      externalLinks = cfg.externalLinks as Record<string, string>;
    }
    if (cfg?.paymentInfo) {
      paymentInfo = cfg.paymentInfo as PaymentInfo;
    }
    if (cfg?.cancellationPolicy) {
      cancellationPolicy = cfg.cancellationPolicy;
    }
    if (cfg?.safetyPolicy) {
      safetyPolicy = cfg.safetyPolicy;
    }
    const rawMode = (cfg as unknown as { homeVideosMode?: string } | null)?.homeVideosMode;
    if (rawMode === "auto" || rawMode === "curated") homeVideosMode = rawMode;
    const rawVids = (cfg as unknown as { homeVideos?: unknown } | null)?.homeVideos;
    if (Array.isArray(rawVids)) {
      homeVideos = rawVids
        .filter((v): v is { id: string; title?: string; isShort?: boolean } =>
          !!v && typeof (v as { id?: unknown }).id === "string" && (v as { id: string }).id.length > 0)
        .map((v) => ({
          id: v.id,
          title: typeof v.title === "string" ? v.title : "",
          isShort: !!v.isShort,
        }));
    }
    const c = cfg as unknown as {
      homeVideoFeaturedId?: string; homeVideoCount?: number;
      homeVideoExcludeIds?: unknown; homeVideoFilter?: string;
    } | null;
    if (typeof c?.homeVideoFeaturedId === "string") homeVideoFeaturedId = c.homeVideoFeaturedId;
    if (typeof c?.homeVideoCount === "number") homeVideoCount = c.homeVideoCount;
    if (Array.isArray(c?.homeVideoExcludeIds)) homeVideoExcludeIds = (c!.homeVideoExcludeIds as unknown[]).filter((x): x is string => typeof x === "string");
    if (c?.homeVideoFilter === "long" || c?.homeVideoFilter === "all") homeVideoFilter = c.homeVideoFilter;
    const rawTesti = (cfg as unknown as { homeTestimonials?: unknown } | null)?.homeTestimonials;
    if (Array.isArray(rawTesti)) {
      homeTestimonials = rawTesti
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .map((t) => ({
          name: typeof t.name === "string" ? t.name : "",
          avatar: typeof t.avatar === "string" ? t.avatar : "",
          activity: typeof t.activity === "string" ? t.activity : "",
          text: typeof t.text === "string" ? t.text : "",
        }))
        .filter((t) => t.name || t.text);
    }
  } catch {
    // DB 失敗就用空物件（避免 LIFF 整個壞掉）
  }

  // 銀行：DB 為主，env vars 為 fallback
  const bank = {
    name: paymentInfo.bank?.name ?? process.env.BANK_NAME ?? "",
    branch: paymentInfo.bank?.branch ?? process.env.BANK_BRANCH ?? "",
    account: paymentInfo.bank?.account ?? process.env.BANK_ACCOUNT ?? "",
    holder: paymentInfo.bank?.holder ?? process.env.BANK_HOLDER ?? "",
  };

  // LINE Pay：只有 DB（env vars 沒有對應）
  const linepay = {
    qrUrl: paymentInfo.linepay?.qrUrl ?? "",
    liteId: paymentInfo.linepay?.liteId ?? "",
  };

  return NextResponse.json({
    liffId: process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "",
    bank,
    linepay,
    externalLinks,
    cancellationPolicy,
    safetyPolicy,
    homeVideosMode,
    homeVideos,
    homeVideoFeaturedId,
    homeVideoCount,
    homeVideoExcludeIds,
    homeVideoFilter,
    homeTestimonials,
  });
}
