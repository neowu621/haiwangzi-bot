import { NextRequest, NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeabur health check + 給你肉眼確認版本用
// v694：?db=1 → 量一次「DB 連線往返」(SELECT 1) 毫秒，判斷 DB 距離/連線是否為延遲主因
//   (預設不打 DB，健康檢查維持輕量)
export async function GET(req: NextRequest) {
  let dbPingMs: number | null = null;
  if (new URL(req.url).searchParams.has("db")) {
    const t0 = performance.now();
    try { await prisma.$queryRaw`SELECT 1`; dbPingMs = Math.round(performance.now() - t0); }
    catch { dbPingMs = -1; }
  }
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    env: process.env.NODE_ENV ?? "unknown",
    time: new Date().toISOString(),
    ...(dbPingMs !== null ? { dbPingMs } : {}),
  });
}
