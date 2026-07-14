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

  let body: { dryRun?: boolean; selfChannels?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // 空 body 也 ok
  }

  // v853：測試發送一律只寄給「目前登入的管理者」本人（前端只選管道，不能指定他人）。
  //   selfChannels 例：["inapp","line","email"] → 各自組成收件人 tag（email 需本人有填）。
  let overrideRecipients: string[] | undefined;
  if (Array.isArray(body.selfChannels) && body.selfChannels.length > 0) {
    const uid = auth.user.lineUserId;
    const out: string[] = [];
    for (const c of body.selfChannels) {
      if (c === "inapp") out.push(`inapp:${uid}`);
      else if (c === "line") out.push(`line:${uid}`);
      else if (c === "email" && auth.user.email) out.push(`email:${auth.user.email}`);
    }
    overrideRecipients = out;
  }

  const result = await runDailyWeatherReport({
    dryRun: body.dryRun ?? false,
    overrideRecipients,
  });
  return NextResponse.json(result);
}
