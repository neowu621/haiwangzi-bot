import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Zeabur health check + 給你肉眼確認版本用
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    env: process.env.NODE_ENV ?? "unknown",
    time: new Date().toISOString(),
  });
}
