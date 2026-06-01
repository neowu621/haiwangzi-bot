import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit, type CreditReason } from "@/lib/credit";
import { computeExpiry } from "@/lib/credit-expiry";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/credits
//   - 帶 ?userId=Uxxx → 查單一 user 紀錄
//   - 無 userId → 全站禮金紀錄 + 統計（v185 禮金管理頁用）
//     可選 query：?reason=admin_adjust&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=200
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  // === Mode 1：單一 user 紀錄 ===
  if (userId) {
    const u = await prisma.user.findUnique({
      where: { lineUserId: userId },
      select: { creditBalance: true, displayName: true, realName: true },
    });
    if (!u) return NextResponse.json({ error: "user not found" }, { status: 404 });

    const txs = await prisma.creditTx.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      user: { lineUserId: userId, ...u },
      balance: u.creditBalance ?? 0,
      txs,
    });
  }

  // === Mode 2：全站禮金紀錄（管理頁用）===
  const reason = url.searchParams.get("reason"); // birthday / vip_upgrade / admin_adjust / refund / used / null=all
  const from = url.searchParams.get("from");     // YYYY-MM-DD
  const to = url.searchParams.get("to");         // YYYY-MM-DD
  const limit = Math.min(500, Math.max(50, parseInt(url.searchParams.get("limit") ?? "200")));

  const where: Prisma.CreditTxWhereInput = {};
  if (reason) where.reason = reason as Prisma.CreditTxWhereInput["reason"];
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from + "T00:00:00+08:00");
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to + "T23:59:59+08:00");
  }

  const txs = await prisma.creditTx.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { displayName: true, realName: true, code: true } },
    },
  });

  // 統計：總發放 / 總使用 / 即將過期（30 天內）/ 已過期但還沒清掉的
  const now = new Date();
  const in30days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [grantedAgg, usedAgg, expiringSoon, expired] = await Promise.all([
    prisma.creditTx.aggregate({ where: { ...where, amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.creditTx.aggregate({ where: { ...where, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.creditTx.count({ where: { amount: { gt: 0 }, expiresAt: { gte: now, lte: in30days } } }),
    prisma.creditTx.count({ where: { amount: { gt: 0 }, expiresAt: { lt: now } } }),
  ]);

  return NextResponse.json({
    txs,
    stats: {
      totalGranted: grantedAgg._sum.amount ?? 0,
      totalUsed: Math.abs(usedAgg._sum.amount ?? 0),
      circulating: (grantedAgg._sum.amount ?? 0) + (usedAgg._sum.amount ?? 0),
      expiringSoon,
      expired,
    },
  });
}

// POST /api/admin/credits — 手動調整禮金（admin/boss 可發 / 扣）
const GrantSchema = z.object({
  userId: z.string(),
  amount: z.number().int(), // 正 = 增 / 負 = 扣
  reason: z.enum(["birthday", "vip_upgrade", "refund", "used", "admin_adjust"]),
  refType: z.string().optional(),
  refId: z.string().optional(),
  note: z.string().optional(),
  // v185: 個別覆寫有效天數（不傳就用 SiteConfig 的 default）
  expiryDays: z.number().int().min(0).max(3650).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = GrantSchema.parse(await req.json());
  try {
    // v185：算出到期日（正向才需要 expiry，負向是扣回不設）
    const expiresAt = data.amount > 0
      ? await computeExpiry(data.reason as CreditReason, data.expiryDays)
      : null;
    const result = await grantCredit({
      userId: data.userId,
      amount: data.amount,
      reason: data.reason as CreditReason,
      refType: data.refType ?? null,
      refId: data.refId ?? null,
      note: data.note ?? null,
      createdBy: auth.user.lineUserId,
      expiresAt,
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: (data.amount ?? 0) >= 0 ? "credit.grant" : "credit.deduct",
      targetType: "user",
      targetId: data.userId,
      metadata: { amount: data.amount, reason: data.reason, oldBalance: result.oldBalance, newBalance: result.newBalance },
    });
    return NextResponse.json({
      ok: true,
      oldBalance: result.oldBalance,
      newBalance: result.newBalance,
      tx: result.tx,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
