/**
 * v225：抵用金 編輯 / 刪除 endpoint
 *
 * PATCH /api/admin/credits/[id] — 修改備註、到期日
 *   - 金額不可改（會影響餘額一致性，要改請刪除重發）
 *
 * DELETE /api/admin/credits/[id] — 刪除一筆抵用金 tx
 *   - transaction 中同步重算 user.creditBalance
 *   - 寫 audit log
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  note: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),  // ISO string or null
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const data = PatchSchema.parse(await req.json());

  const patch: Record<string, unknown> = {};
  if (data.note !== undefined) patch.note = data.note;
  if (data.expiresAt !== undefined) {
    patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  }

  try {
    const updated = await prisma.creditTx.update({ where: { id }, data: patch });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "credit.update",
      targetType: "credit_tx",
      targetId: id,
      metadata: { ...patch, code: updated.code },
    });
    return NextResponse.json({ ok: true, tx: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;

  try {
    // 用 transaction：刪 tx + 重算該 user 的 creditBalance + 重整後續 tx 的 balanceAfter
    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.creditTx.findUnique({ where: { id } });
      if (!target) throw new Error("找不到該筆抵用金紀錄");

      // 刪掉
      await tx.creditTx.delete({ where: { id } });

      // 重整該 user 所有後續 tx 的 balanceAfter（簡單做法：全部重算）
      const allTxs = await tx.creditTx.findMany({
        where: { userId: target.userId },
        orderBy: { createdAt: "asc" },
      });
      let running = 0;
      for (const t of allTxs) {
        running += t.amount;
        if (t.balanceAfter !== running) {
          await tx.creditTx.update({
            where: { id: t.id },
            data: { balanceAfter: running },
          });
        }
      }

      // 同步更新 user.creditBalance
      await tx.user.update({
        where: { lineUserId: target.userId },
        data: { creditBalance: running },
      });

      return { deletedAmount: target.amount, deletedCode: target.code, newBalance: running, userId: target.userId };
    });

    await logAudit({
      actorId: auth.user.lineUserId,
      action: "credit.delete",
      targetType: "credit_tx",
      targetId: id,
      metadata: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
