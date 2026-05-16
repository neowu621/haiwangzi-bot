import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeVipTiers, VIP_TIERS } from "@/lib/vip-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vip-tiers - 公開：回傳 5 等級設定（client 端用）
export async function GET() {
  const cfg = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;
  return NextResponse.json({ tiers });
}
