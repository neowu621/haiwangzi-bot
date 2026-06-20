// v612：補傳所有「DB 暫存中但還沒上 R2」的手寫簽名。
//   由 Cronicle 觸發。建議頻率：每 5~10 分鐘一次。
//   認證：Authorization: Bearer <CRON_SECRET>
//   正常情況下單後已立即上傳，這支只負責補「崩潰/重啟/R2 暫時故障」漏掉的。
import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { flushAllPendingSignatures } from "@/lib/signature-flush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50")));
  const result = await flushAllPendingSignatures(limit);
  return NextResponse.json({ ok: true, tried: result.tried, uploaded: result.ok });
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}
