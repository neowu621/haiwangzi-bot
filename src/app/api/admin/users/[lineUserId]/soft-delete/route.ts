import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[lineUserId]/soft-delete
 *   軟刪除會員：
 *     - 設 deletedAt = now, deletedBy = 操作者, deletedReason
 *     - User row 仍保留，所有訂單 / PaymentProof / CreditTx 不動
 *     - 該使用者下次嘗試登入會被 auth 擋下（403）
 *
 *   權限：admin / boss
 *
 *   Body: { reason?: string }
 *
 * POST /api/admin/users/[lineUserId]/soft-delete?action=restore
 *   還原已被軟刪除的會員（清掉 deletedAt）
 */
const Body = z.object({
  reason: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ lineUserId: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { lineUserId } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action"); // null = 軟刪除；"restore" = 還原

  // 不能刪除自己
  if (action !== "restore" && lineUserId === auth.lineUserId) {
    return NextResponse.json(
      { error: "不能刪除自己的帳號" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { lineUserId } });
  if (!user)
    return NextResponse.json({ error: "user not found" }, { status: 404 });

  if (action === "restore") {
    // ── 還原 ─────────────────────────────
    if (!user.deletedAt) {
      return NextResponse.json(
        { error: "此會員未被刪除，無需還原" },
        { status: 400 },
      );
    }
    const updated = await prisma.user.update({
      where: { lineUserId },
      data: { deletedAt: null, deletedBy: null, deletedReason: null },
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "user.restore",
      targetType: "user",
      targetId: lineUserId,
      targetLabel: user.realName ?? user.displayName,
    });
    return NextResponse.json({ ok: true, action: "restored", user: updated });
  }

  // ── 軟刪除 ─────────────────────────────
  if (user.deletedAt) {
    return NextResponse.json(
      { error: "此會員已被軟刪除", deletedAt: user.deletedAt },
      { status: 400 },
    );
  }

  let bodyData: { reason?: string } = {};
  try {
    bodyData = Body.parse(await req.json().catch(() => ({})));
  } catch {}

  // 統計這個會員會「保留」的相關資料
  const [bookingsCount, paidBookings, activeBookings] = await Promise.all([
    prisma.booking.count({ where: { userId: lineUserId } }),
    prisma.booking.count({
      where: { userId: lineUserId, paidAmount: { gt: 0 }, paymentStatus: { not: "refunded" } },
    }),
    prisma.booking.count({
      where: {
        userId: lineUserId,
        status: { in: ["pending", "confirmed"] },
      },
    }),
  ]);

  const updated = await prisma.user.update({
    where: { lineUserId },
    data: {
      deletedAt: new Date(),
      deletedBy: auth.user.lineUserId,
      deletedReason: bodyData.reason ?? null,
    },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "user.soft_delete",
    targetType: "user",
    targetId: lineUserId,
    targetLabel: user.realName ?? user.displayName,
    metadata: {
      reason: bodyData.reason,
      preservedBookings: bookingsCount,
      paidBookingsRemaining: paidBookings,
      activeBookings,
    },
  });

  return NextResponse.json({
    ok: true,
    action: "soft_deleted",
    user: updated,
    preserved: {
      bookings: bookingsCount,
      paidBookings,
      activeBookings,
    },
  });
}
