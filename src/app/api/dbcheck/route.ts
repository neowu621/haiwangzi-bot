import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DB 連通健康檢查（公開，但 v355 起不再回傳營運筆數 / 原始錯誤訊息，避免資訊洩漏）
export async function GET() {
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, latencyMs: Date.now() - start });
  } catch {
    // 不回傳 err.message（可能含連線字串 / schema / driver 內部資訊）
    return NextResponse.json({ ok: false, error: "db_unreachable" }, { status: 500 });
  }
}
