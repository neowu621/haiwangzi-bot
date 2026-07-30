// v961：抵用金到期日「批次延長」——協助延遲。把目前篩選(類別+到期狀態)的發放，到期日改為「今天 + N 天」。
//   安全：必須帶 expiry 篩選(7d/30d/voided)，避免誤改全站；只動正向發放(amount>0)。
//   v969：expiry=voided → 「復原已作廢」：還原批次剩餘 + 補回餘額 + 重新設定到期日。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { genCreditCode } from "@/lib/code-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  days: z.number().int().min(1).max(3650),
  reason: z.string().optional(),
  expiry: z.enum(["7d", "30d", "voided"]), // 必填：限定範圍
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const data = Body.parse(await req.json().catch(() => ({})));
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000);
  const in30 = new Date(now.getTime() + 30 * 86400000);

  // 新到期日 = 今天 + N 天（台北 23:59:59）
  const target = new Date(now.getTime() + data.days * 86400000);
  const y = target.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const newExpiresAt = new Date(`${y}T23:59:59+08:00`);

  // === v969：復原「已作廢」批次（含補回餘額）===
  if (data.expiry === "voided") {
    const rWhere: Prisma.CreditTxWhereInput = { amount: { gt: 0 }, forfeitedAmount: { gt: 0 } };
    if (data.reason && data.reason !== "all") rWhere.reason = data.reason as Prisma.CreditTxWhereInput["reason"];
    const lots = await prisma.creditTx.findMany({
      where: rWhere,
      select: { id: true, userId: true, consumedAmount: true, forfeitedAmount: true },
    });
    let updated = 0, restoredTotal = 0;
    const perUser = new Map<string, number>();
    await prisma.$transaction(async (tx) => {
      for (const lot of lots) {
        const back = lot.forfeitedAmount; // 這批被作廢的金額 → 還原
        if (back <= 0) continue;
        await tx.creditTx.update({
          where: { id: lot.id },
          data: { consumedAmount: Math.max(0, lot.consumedAmount - back), forfeitedAmount: 0, expiresAt: newExpiresAt },
        });
        perUser.set(lot.userId, (perUser.get(lot.userId) ?? 0) + back);
        updated++; restoredTotal += back;
      }
      for (const [uid, add] of perUser) {
        const u = await tx.user.findUnique({ where: { lineUserId: uid }, select: { creditBalance: true } });
        const newBal = (u?.creditBalance ?? 0) + add;
        await tx.user.update({ where: { lineUserId: uid }, data: { creditBalance: newBal } });
        // 審計標記（amount:0 → 不影響餘額/不成為新批次）
        const code = await genCreditCode();
        await tx.creditTx.create({
          data: { code, userId: uid, amount: 0, reason: "admin_adjust", note: `到期作廢復原 +${add}（延長至 ${y}）`, balanceAfter: newBal, createdBy: auth.user.lineUserId },
        });
      }
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "credit.recover_voided",
      targetType: "credit",
      metadata: { days: data.days, reason: data.reason ?? "all", updated, restoredTotal, newExpiresAt: newExpiresAt.toISOString() },
    }).catch(() => {});
    return NextResponse.json({ ok: true, updated, restoredTotal, newExpiresAt: y, recovered: true });
  }

  // === 一般延長（尚未到期的 7d/30d）===
  const where: Prisma.CreditTxWhereInput = { amount: { gt: 0 }, consumedAmount: { lt: prisma.creditTx.fields.amount } }; // v963：只延長仍有剩餘的批次
  if (data.reason && data.reason !== "all") where.reason = data.reason as Prisma.CreditTxWhereInput["reason"];
  if (data.expiry === "7d") where.expiresAt = { gte: now, lte: in7 };
  else if (data.expiry === "30d") where.expiresAt = { gte: now, lte: in30 };

  const res = await prisma.creditTx.updateMany({ where, data: { expiresAt: newExpiresAt } });

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "credit.extend_expiry",
    targetType: "credit",
    metadata: { days: data.days, reason: data.reason ?? "all", expiry: data.expiry, updated: res.count, newExpiresAt: newExpiresAt.toISOString() },
  }).catch(() => {});

  return NextResponse.json({ ok: true, updated: res.count, newExpiresAt: y });
}
