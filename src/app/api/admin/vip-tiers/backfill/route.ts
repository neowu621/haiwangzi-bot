/**
 * POST /api/admin/vip-tiers/backfill
 *
 * 特殊狀況補發 VIP 禮金（老闆專用）
 *
 * 行為：
 *   - 遍歷所有未軟刪會員
 *   - 對每個會員呼叫 grantVipUpgradeRewards(uid, 0, currentLevel, tiers)
 *   - 既有 CreditTx (refType=vip + refId=<level>) 去重機制保證每個 LV 僅補一次
 *   - 已領過的會員不會重複拿
 *   - 沒領過的（例如：LV1 開放前已加入的舊會員）會拿到當下等級以下所有未領的獎勵
 *
 * Body: { dryRun?: boolean }  → dryRun=true 只回模擬結果不實際發放
 *
 * 權限：admin / boss 才能呼叫（敏感操作 — 涉及實際禮金發放）
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { normalizeVipTiers, VIP_TIERS } from "@/lib/vip-tier";
import { grantVipUpgradeRewards } from "@/lib/vip-upgrade-rewards";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  dryRun: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { dryRun } = parsed.data;

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { lineUserId: true, vipLevel: true, code: true, realName: true, displayName: true },
  });

  if (dryRun) {
    // 模擬：對每個 user 計算「會發多少」但不寫入
    let willGrant = 0;
    const previewByLevel: Record<string, { count: number; amount: number }> = {};
    for (const u of users) {
      const lv = u.vipLevel ?? 1;
      for (const t of tiers) {
        if (t.level < 1 || t.level > lv || (t.upgradeCredit ?? 0) === 0) continue;
        const refId = String(t.level);
        const exists = await prisma.creditTx.findFirst({
          where: {
            userId: u.lineUserId,
            refType: "vip",
            refId,
            reason: "vip_upgrade",
          },
          select: { id: true },
        });
        if (exists) continue;
        willGrant += t.upgradeCredit;
        const key = `LV${t.level}`;
        if (!previewByLevel[key]) previewByLevel[key] = { count: 0, amount: 0 };
        previewByLevel[key].count++;
        previewByLevel[key].amount += t.upgradeCredit;
      }
    }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      totalUsers: users.length,
      willGrantTotal: willGrant,
      previewByLevel,
    });
  }

  // 實際發放
  let totalGranted = 0;
  let affectedUsers = 0;
  for (const u of users) {
    const granted = await grantVipUpgradeRewards(
      u.lineUserId,
      0,
      u.vipLevel ?? 1,
      tiers,
      auth.user.lineUserId,
    );
    if (granted > 0) {
      affectedUsers++;
      totalGranted += granted;
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "vip_tiers.backfill",
    targetType: "config",
    targetId: "vip_tiers",
    metadata: { totalUsers: users.length, affectedUsers, totalGranted },
  });

  return NextResponse.json({
    ok: true,
    totalUsers: users.length,
    affectedUsers,
    totalGranted,
  });
}
