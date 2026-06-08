import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// /api/cron/credit-expiry-reminder  （v420）
// ─────────────────────────────────────────────────────────────
//   每日跑：找「7 天內到期」且尚未提醒過的抵用金，提醒持有人「快回來用」。
//   去重：CreditTx.expiry_reminded_at（每筆只提醒一次）；同一客戶同一輪只發一封。
//   只提醒「目前仍有餘額(creditBalance>0)」的客戶，避免提醒已用完的人。
//   認證：Authorization: Bearer <CRON_SECRET>
//   排程建議：每日 台灣 10:00 → Cronicle UTC `0 2 * * *`
//   ?dryRun=1：只統計、不寄、不標記。
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry") === "1";

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // 7 天內到期、正數(發放)、尚未提醒過
  const txs = await prisma.creditTx.findMany({
    where: {
      amount: { gt: 0 },
      expiresAt: { gt: now, lte: in7d },
      expiryRemindedAt: null,
    },
    select: { id: true, userId: true, expiresAt: true },
    orderBy: { expiresAt: "asc" },
  });

  const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  const notifiedUsers = new Set<string>();
  const preview: Array<{ userId: string; balance: number; expireDate: string }> = [];
  let notified = 0;

  for (const tx of txs) {
    // 標記此筆已提醒（即使不寄，也避免下次重複掃）
    if (!dryRun) {
      await prisma.creditTx.update({ where: { id: tx.id }, data: { expiryRemindedAt: now } }).catch(() => null);
    }
    if (notifiedUsers.has(tx.userId)) continue; // 同客戶這輪只發一次
    const user = await prisma.user.findUnique({
      where: { lineUserId: tx.userId },
      select: { creditBalance: true },
    });
    const balance = user?.creditBalance ?? 0;
    if (balance <= 0) continue; // 沒餘額不提醒
    notifiedUsers.add(tx.userId);
    const expireDate = (tx.expiresAt ?? in7d).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
    preview.push({ userId: `${tx.userId.slice(0, 6)}…`, balance, expireDate });
    if (!dryRun) {
      const { notifyCustomer } = await import("@/lib/notify-template");
      const { creditExpiryEmail } = await import("@/lib/email/templates");
      notifyCustomer({
        userId: tx.userId,
        templateKey: "credit_expiry",
        params: { amount: balance, expireDate, liffUrl },
        altText: "抵用金即將到期",
        email: (name) => creditExpiryEmail({ name, amount: balance, expireDate, liffUrl }),
      });
      notified++;
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    scanned: txs.length,
    notifiedCount: dryRun ? preview.length : notified,
    users: preview,
  });
}
