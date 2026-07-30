// v961：抵用金到期日「批次延長」——協助延遲。把目前篩選(類別+到期狀態)的發放，到期日改為「今天 + N 天」。
//   安全：必須帶 expiry 篩選(7d/30d/expired)，避免誤改全站；只動正向發放(amount>0)。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  days: z.number().int().min(1).max(3650),
  reason: z.string().optional(),
  expiry: z.enum(["7d", "30d", "expired"]), // 必填：限定範圍
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

  const where: Prisma.CreditTxWhereInput = { amount: { gt: 0 }, consumedAmount: { lt: prisma.creditTx.fields.amount } }; // v963：只延長仍有剩餘的批次
  if (data.reason && data.reason !== "all") where.reason = data.reason as Prisma.CreditTxWhereInput["reason"];
  if (data.expiry === "expired") where.expiresAt = { lt: now };
  else if (data.expiry === "7d") where.expiresAt = { gte: now, lte: in7 };
  else if (data.expiry === "30d") where.expiresAt = { gte: now, lte: in30 };

  // 新到期日 = 今天 + N 天（台北 23:59:59）
  const target = new Date(now.getTime() + data.days * 86400000);
  const y = target.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const newExpiresAt = new Date(`${y}T23:59:59+08:00`);

  const res = await prisma.creditTx.updateMany({ where, data: { expiresAt: newExpiresAt } });

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "credit.extend_expiry",
    targetType: "credit",
    metadata: { days: data.days, reason: data.reason ?? "all", expiry: data.expiry, updated: res.count, newExpiresAt: newExpiresAt.toISOString() },
  }).catch(() => {});

  return NextResponse.json({ ok: true, updated: res.count, newExpiresAt: y });
}
