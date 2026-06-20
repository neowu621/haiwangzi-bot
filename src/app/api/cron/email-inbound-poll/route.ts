import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { runAndLogPoll } from "@/lib/gmail-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/email-inbound-poll
 * 定時拉 Gmail 收件匣的新客服信進後台（service@ →ImprovMX→ Gmail → 這裡讀進 DB）。
 * 認證：Authorization: Bearer <CRON_SECRET>（與其他 cron 一致）。建議每 1–3 分鐘跑一次。
 */
async function handle(req: NextRequest) {
  // v614 安全：未設 CRON_SECRET 一律拒絕（fail-closed），不再因缺密鑰而開放。
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured: CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!safeEqual(token, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await runAndLogPoll("cron");
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
