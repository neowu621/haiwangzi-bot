import { NextRequest, NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";
import { prisma } from "@/lib/prisma";
import { checkEnv } from "@/lib/env-manifest"; // v1078
import { safeEqual } from "@/lib/safe-compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeabur health check + 給你肉眼確認版本用
// v694：?db=1 → 量一次「DB 連線往返」(SELECT 1) 毫秒，判斷 DB 距離/連線是否為延遲主因
//   (預設不打 DB，健康檢查維持輕量)
// v1078：?env=1 → 環境變數是否到齊（公開只給數量；帶 CRON_SECRET 才給名稱，永不給值）
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let dbPingMs: number | null = null;
  if (url.searchParams.has("db")) {
    const t0 = performance.now();
    try { await prisma.$queryRaw`SELECT 1`; dbPingMs = Math.round(performance.now() - t0); }
    catch { dbPingMs = -1; }
  }
  // v784：?email=1 → 診斷 Gmail SMTP 是否可登入（不寄信、不外洩金鑰）。
  let email: unknown = undefined;
  if (url.searchParams.has("email")) {
    try {
      const { verifyEmailTransport } = await import("@/lib/email/send");
      email = await verifyEmailTransport();
    } catch (e) {
      email = { verify: e instanceof Error ? e.message : String(e) };
    }
  }
  // v1078：?env=1 → 環境變數自檢（Zeabur 把設定搬到自架伺服器後，用來確認沒搬丟東西）。
  //   ⚠️ healthz 是公開端點：不帶密鑰只回「缺幾個」，不回名稱 ——
  //      對外公告「R2_SECRET_ACCESS_KEY 沒設定」等於告訴攻擊者哪裡有破口。
  //      要看是哪些，帶 Authorization: Bearer $CRON_SECRET。
  let envCheck: unknown = undefined;
  if (url.searchParams.has("env")) {
    const secret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    // 沒設 CRON_SECRET 時一律當作未授權（不能因為密鑰不見了就變成人人可看名單）
    const authed = !!secret && safeEqual(token, secret);
    envCheck = checkEnv(authed);
  }

  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    env: process.env.NODE_ENV ?? "unknown",
    time: new Date().toISOString(),
    ...(dbPingMs !== null ? { dbPingMs } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(envCheck !== undefined ? { envCheck } : {}),
  });
}
