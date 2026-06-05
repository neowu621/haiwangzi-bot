// v348：修正 VIP 等級灌水 bug 的歷史髒資料
//   bug：admin/vip-tiers 全員重算誤用「自填總經驗 logCount」而非「海王子累積 haiwangziLogCount」，
//        導致會員被錯誤升等並發放 vip_upgrade 升等獎勵抵用金。
//   修法（一次性）：
//     1. 用 haiwangziLogCount 重算每位會員正確等級 → 修正 vipLevel（誤升的降回）
//     2. 刪除「等級超過正確等級」的 vip_upgrade 抵用金紀錄，並同步扣回 creditBalance
//        （用刪除而非加負筆：未來會員若真的達標，去重邏輯仍能正常補發）
//   呼叫：POST /api/admin/fix-vip-levels-v348?dryRun=1  先試算
//         POST /api/admin/fix-vip-levels-v348            正式執行
//   認證：admin session 或 Bearer CRON_SECRET
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authAdminOrCron } from "@/lib/admin-or-cron-auth";
import { computeVipLevel, normalizeVipTiers, VIP_TIERS } from "@/lib/vip-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const a = await authAdminOrCron(req);
  if (!a.ok) return a.res;

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;

  const users = await prisma.user.findMany({
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      haiwangziLogCount: true,
      totalSpend: true,
      vipLevel: true,
      creditBalance: true,
    },
  });

  const report: Array<{
    user: string;
    haiwangziLogCount: number;
    oldLevel: number;
    correctLevel: number;
    removeTxCount: number;
    grantedClawback: number;
    actualDeducted: number;
  }> = [];
  let levelChanged = 0;
  let txRemoved = 0;
  let creditClawed = 0;

  for (const u of users) {
    const correct = computeVipLevel(u.haiwangziLogCount ?? 0, u.totalSpend ?? 0, tiers);
    const oldLevel = u.vipLevel ?? 1;

    // 找出「等級 > 正確等級」的 vip_upgrade 紀錄（達不到卻發了）
    const vipTxs = await prisma.creditTx.findMany({
      where: { userId: u.lineUserId, reason: "vip_upgrade", refType: "vip" },
      select: { id: true, amount: true, refId: true },
    });
    const toRemove = vipTxs.filter((t) => {
      const lv = Number(t.refId);
      return Number.isFinite(lv) && lv > correct;
    });
    const grantedClawback = toRemove.reduce((s, t) => s + (t.amount ?? 0), 0);

    if (oldLevel === correct && toRemove.length === 0) continue;

    let actualDeducted = 0;
    if (!dryRun) {
      actualDeducted = await prisma.$transaction(async (tx) => {
        if (oldLevel !== correct) {
          await tx.user.update({
            where: { lineUserId: u.lineUserId },
            data: { vipLevel: correct },
          });
        }
        if (toRemove.length === 0) return 0;
        const cur = await tx.user.findUnique({
          where: { lineUserId: u.lineUserId },
          select: { creditBalance: true },
        });
        const bal = cur?.creditBalance ?? 0;
        const newBal = Math.max(0, bal - grantedClawback);
        await tx.creditTx.deleteMany({ where: { id: { in: toRemove.map((t) => t.id) } } });
        await tx.user.update({
          where: { lineUserId: u.lineUserId },
          data: { creditBalance: newBal },
        });
        return bal - newBal;
      });
    } else {
      actualDeducted = Math.min(u.creditBalance ?? 0, grantedClawback);
    }

    report.push({
      user: u.realName ?? u.displayName,
      haiwangziLogCount: u.haiwangziLogCount ?? 0,
      oldLevel,
      correctLevel: correct,
      removeTxCount: toRemove.length,
      grantedClawback,
      actualDeducted,
    });
    if (oldLevel !== correct) levelChanged++;
    txRemoved += toRemove.length;
    creditClawed += actualDeducted;
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    summary: {
      usersScanned: users.length,
      usersAffected: report.length,
      levelChanged,
      vipUpgradeTxRemoved: txRemoved,
      creditClawedBack: creditClawed,
    },
    report,
  });
}
