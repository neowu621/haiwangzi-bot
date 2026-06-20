import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { purgeEmailThreads } from "@/lib/email-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 180; // 已結案超過此天數才自動刪除

/**
 * GET/POST /api/cron/email-cleanup
 * 自動清除「已結案(CLOSED)且最後活動超過 180 天」的客服信對話（含信件 + R2 附件）。
 * 只清 CLOSED：待回覆/處理中的永遠不會被自動刪，避免誤清還在處理的事。
 * 認證：Authorization: Bearer <CRON_SECRET>。建議每日跑一次。
 */
async function handle(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5);
    const stale = await prisma.emailThread.findMany({
      where: { status: "CLOSED", lastMessageAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    const r = await purgeEmailThreads(stale.map((t) => t.id));
    return NextResponse.json({ ok: true, retentionDays: RETENTION_DAYS, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
