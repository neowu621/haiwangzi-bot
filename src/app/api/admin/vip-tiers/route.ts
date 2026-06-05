import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  normalizeVipTiers,
  VIP_TIERS,
  computeVipLevel,
  type VipTier,
} from "@/lib/vip-tier";
import { grantVipUpgradeRewards } from "@/lib/vip-upgrade-rewards";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/vip-tiers - 拿現在設定
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;
  return NextResponse.json({
    tiers,
    isDefault: !cfg?.vipTiers || (cfg.vipTiers as unknown[]).length === 0,
  });
}

const TierSchema = z.object({
  level: z.number().int().min(1).max(10),
  key: z.string().min(1),
  name: z.string().min(1),
  enName: z.string().default(""),
  emoji: z.string().default(""),
  minLogs: z.number().int().min(0),
  minSpend: z.number().int().min(0),
  benefits: z.array(z.string()).default([]),
  upgradeCredit: z.number().int().min(0).default(0),
  color: z.string().default("#999"),
});

const PutSchema = z.object({
  tiers: z.array(TierSchema).min(1).max(10),
});

// POST /api/admin/vip-tiers - 整批更新等級設定
//   也會 trigger 重算所有 user 的 vipLevel（依新標準）
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = PutSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const tiers: VipTier[] = parsed.data.tiers as VipTier[];

  // 驗證：level 不能重複
  const levels = new Set(tiers.map((t) => t.level));
  if (levels.size !== tiers.length) {
    return NextResponse.json(
      { error: "level 不能重複" },
      { status: 400 },
    );
  }

  try {
    await prisma.siteConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        vipTiers: tiers as never,
        updatedBy: auth.user.lineUserId,
      },
      update: {
        vipTiers: tiers as never,
        updatedBy: auth.user.lineUserId,
      },
    });

    // 重算所有 user vipLevel + 升等者發放抵用金
    const users = await prisma.user.findMany({
      select: { lineUserId: true, logCount: true, totalSpend: true, vipLevel: true },
    });
    let promoted = 0;
    let totalCreditGranted = 0;
    for (const u of users) {
      const oldLevel = u.vipLevel ?? 1;
      const newLevel = computeVipLevel(u.logCount ?? 0, u.totalSpend ?? 0, tiers);
      if (newLevel !== oldLevel) {
        await prisma.user.update({
          where: { lineUserId: u.lineUserId },
          data: { vipLevel: newLevel },
        });
        promoted++;
        // 只有實際升等才發抵用金（降等不退、不補發舊獎勵）
        if (newLevel > oldLevel) {
          // v347：VIP 升等獎勵一律記系統發，不傳 admin 作為經辦人
          totalCreditGranted += await grantVipUpgradeRewards(
            u.lineUserId,
            oldLevel,
            newLevel,
            tiers,
          );
        }
      }
    }

    await logAudit({
      actorId: auth.user.lineUserId,
      action: "vip_tiers.update",
      targetType: "config",
      targetId: "vip_tiers",
      metadata: { tiersCount: tiers.length },
    });
    return NextResponse.json({
      ok: true,
      tiers,
      recalculated: users.length,
      promoted,
      creditGranted: totalCreditGranted,
    });
  } catch (e) {
    console.error("[POST /admin/vip-tiers]", e);
    return NextResponse.json(
      {
        error: "save failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/vip-tiers - 還原為內建預設
export async function DELETE(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  await prisma.siteConfig
    .upsert({
      where: { id: "default" },
      create: { id: "default", vipTiers: [] as never },
      update: { vipTiers: [] as never },
    })
    .catch(() => null);

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "vip_tiers.reset",
    targetType: "config",
    targetId: "vip_tiers",
  });

  return NextResponse.json({ ok: true, tiers: VIP_TIERS });
}
