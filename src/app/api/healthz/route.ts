import { NextRequest, NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeabur health check + 給你肉眼確認版本用
// v694：?db=1 → 量一次「DB 連線往返」(SELECT 1) 毫秒，判斷 DB 距離/連線是否為延遲主因
//   (預設不打 DB，健康檢查維持輕量)
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
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    env: process.env.NODE_ENV ?? "unknown",
    time: new Date().toISOString(),
    ...(dbPingMs !== null ? { dbPingMs } : {}),
    ...(email !== undefined ? { email } : {}),
  });
}
