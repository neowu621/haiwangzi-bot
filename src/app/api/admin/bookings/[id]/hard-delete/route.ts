// v335: 老闆永久刪除訂單（hard delete）
//
// ⚠ 危險動作：完全從 DB 移除訂單 + cascade 子資料（payment_proofs / status_logs / refund_requests）
// 並嘗試刪除 R2 上的付款證明圖片。
//
// 安全控制：
//   - 僅 boss 可呼叫（admin 不行）
//   - body 必須帶 confirm === "DELETE"
//   - 操作前寫一筆 audit_log 含完整 snapshot（含被刪訂單的所有資料）
//
// 用途：清理測試訂單 / 爛資料 / 垃圾單。**正常取消請走 soft cancel。**
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  confirm: z.literal("DELETE"),
  reason: z.string().max(500).optional(),
});

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  // 僅 boss 可硬刪
  const role = requireRole(auth.user, ["boss"]);
  if (!role.ok) return NextResponse.json({ error: "boss_only", message: "只有老闆可執行永久刪除" }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", message: "需要打字 DELETE 確認", issues: parsed.error.issues }, { status: 400 });
  }

  const { id } = await ctx.params;

  // 抓完整 booking + cascade 子資料快照
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      paymentProofs: { select: { id: true, imageKey: true, type: true, amount: true } },
      reminderLogs: { select: { id: true } },
      refundRequests: { select: { id: true, status: true, amount: true } },
      user: { select: { lineUserId: true, displayName: true, realName: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 先寫 audit_log（即使下面刪除失敗、紀錄已留）
  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: auth.user.realName ?? auth.user.displayName ?? "boss",
    action: "boss.booking.hard_delete",
    targetType: "booking",
    targetId: id,
    targetLabel: booking.code ?? id.slice(0, 8),
    metadata: {
      reason: parsed.data.reason,
      snapshot: {
        code: booking.code,
        type: booking.type,
        userId: booking.userId,
        userName: booking.user.realName ?? booking.user.displayName,
        totalAmount: booking.totalAmount,
        paidAmount: booking.paidAmount,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        createdAt: booking.createdAt,
        paymentProofs: booking.paymentProofs.length,
        reminderLogs: booking.reminderLogs.length,
        refundRequests: booking.refundRequests.length,
      },
    },
  });

  // 1. 先嘗試刪 R2 上的付款證明圖片（即使失敗也繼續，audit 已留）
  if (r2Configured()) {
    for (const p of booking.paymentProofs) {
      if (p.imageKey) {
        try {
          // imageKey 例：payments/abc.jpg → 拆 prefix + key
          const [prefix, ...rest] = p.imageKey.split("/");
          await deleteObject(prefix as "payments" | "signatures" | "trips" | "tours" | "sites" | "richmenu" | "media", rest.join("/"));
        } catch (e) {
          console.error("[hard-delete] R2 deleteObject failed", p.imageKey, e);
        }
      }
    }
  }

  // 2. 刪除 DB（onDelete: Cascade 會自動處理 paymentProofs / reminderLogs / refundRequests）
  try {
    await prisma.booking.delete({ where: { id } });
  } catch (e) {
    return NextResponse.json({
      error: "delete_failed",
      detail: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      id,
      code: booking.code,
      paymentProofs: booking.paymentProofs.length,
      reminderLogs: booking.reminderLogs.length,
      refundRequests: booking.refundRequests.length,
    },
  });
}
