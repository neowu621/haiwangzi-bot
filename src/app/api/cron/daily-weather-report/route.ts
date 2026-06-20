import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { runDailyWeatherReport } from "@/lib/daily-weather-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v264 / v268: /api/cron/daily-weather-report
 *
 * Bearer auth → 執行 daily-weather-report (從 lib)。
 * 由 Cronicle 排程觸發。v268：實際邏輯抽到 lib/daily-weather-report.ts，
 * 讓 admin 測試 endpoint 也能用同一份。
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDailyWeatherReport();
  return NextResponse.json(result);
}
