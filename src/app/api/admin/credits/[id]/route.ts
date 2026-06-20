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

      // ── v605 防呆：保護 FIFO 與帳目一致，只允許刪「未被使用過的發放筆」──
      //   負向紀錄(使用/作廢/撤銷/退還) 不可刪：刪了會讓對應發放筆 consumedAmount 對不上、餘額算錯。
      if (target.amount < 0) {
        throw new Error(
          "此筆為「使用／作廢／退還」紀錄，刪除會破壞帳目一致性，不可刪除。若要調整餘額，請用『新增抵用金』填負數做扣抵。",
        );
      }
      //   已被使用過的發放筆不可硬刪：該抵用金已折抵在某張訂單上，刪了帳會對不上。
      if (target.consumedAmount > 0) {
        throw new Error(
          `此發放已被使用 NT$${target.consumedAmount.toLocaleString()}，不能直接刪除（避免帳目不一致）。若要扣掉尚未使用的部分，請用『新增抵用金』填負數做扣抵。`,
        );
      }

      // 安全：未使用過的發放筆 → 可刪
      await tx.creditTx.delete({ where: { id } });

      // 重整該 user 所有 tx 的 balanceAfter（全部重算）
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

      // 同步更新 user.creditBalance（clamp >= 0 防呆，避免任何情況算成負數）
      const safeBalance = Math.max(0, running);
      await tx.user.update({
        where: { lineUserId: target.userId },
        data: { creditBalance: safeBalance },
      });

      return { deletedAmount: target.amount, deletedCode: target.code, newBalance: safeBalance, userId: target.userId };
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
