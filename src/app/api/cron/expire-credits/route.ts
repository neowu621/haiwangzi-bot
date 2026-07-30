import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { reconcileExpiredCredits } from "@/lib/credit-fifo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────
// /api/cron/expire-credits  （v965）
// ─────────────────────────────────────────────────────────────
//   每日跑：主動「作廢」所有人已過期、未用完的抵用金 →
//     - 該批 consumedAmount 補到 amount（剩餘歸零）
//     - 寫一筆負向 "expired" 紀錄「抵用金到期作廢」
//     - 扣減 user.creditBalance
//   解決「已過期但餘額沒變」——原本作廢只在客戶下次用抵用金 / 開 App(/api/me) 時才觸發(lazy)。
//   認證：Authorization: Bearer <CRON_SECRET>
//   排程建議：每日 台灣 03:00 → Cronicle UTC `0 19 * * *`
//   ?dryRun=1：只列出將被作廢的人數/金額，不修改。
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (!safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";
  const now = new Date();

  // 有「過期且仍有剩餘」發放的會員（去重）
  const rows = await prisma.creditTx.findMany({
    where: { amount: { gt: 0 }, expiresAt: { lt: now }, consumedAmount: { lt: prisma.creditTx.fields.amount } },
    select: { userId: true, amount: true, consumedAmount: true },
  });
  const byUser = new Map<string, number>(); // userId → 待作廢剩餘總額
  for (const r of rows) byUser.set(r.userId, (byUser.get(r.userId) ?? 0) + Math.max(0, r.amount - r.consumedAmount));

  if (dryRun) {
    let total = 0;
    const users = Array.from(byUser.entries()).map(([uid, amt]) => { total += amt; return { userId: `${uid.slice(0, 6)}…`, forfeit: amt }; });
    return NextResponse.json({ ok: true, dryRun: true, usersAffected: byUser.size, totalToForfeit: total, users: users.slice(0, 100) });
  }

  let usersDone = 0, totalForfeited = 0;
  const errors: string[] = [];
  for (const userId of byUser.keys()) {
    try {
      const f = await reconcileExpiredCredits(userId, now.getTime());
      if (f > 0) { usersDone++; totalForfeited += f; }
    } catch (e) {
      errors.push(`${userId.slice(0, 6)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, usersAffected: byUser.size, usersForfeited: usersDone, totalForfeited, errors: errors.slice(0, 20) });
}
