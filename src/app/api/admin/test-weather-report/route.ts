import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, requireRole } from "@/lib/auth";
import { runDailyWeatherReport } from "@/lib/daily-weather-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v268：admin 測試「每日天氣回報」
 *
 * 兩種模式：
 *   POST { dryRun: true } — 只組訊息回 preview，不真的發送
 *   POST {}              — 真的發送給設定好的收件人
 *
 * 與 /api/cron/daily-weather-report 共用底層 lib，只是 auth 從 Bearer 換成 admin。
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) {
    return NextResponse.json({ error: role.message }, { status: role.status });
  }

  let body: { dryRun?: boolean; overrideRecipients?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // 空 body 也 ok
  }

  const result = await runDailyWeatherReport({
    dryRun: body.dryRun ?? false,
    overrideRecipients: body.overrideRecipients,
  });
  return NextResponse.json(result);
}
