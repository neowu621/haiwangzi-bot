import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/admin/users/[lineUserId]
//   預設：有 booking 引用會擋下（避免誤刪客戶資料）
//   ?force=true：先刪掉該 user 所有 booking + paymentProof + reminderLog，再刪 user
//   admin 不能刪除自己（避免鎖死）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lineUserId: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { lineUserId } = await params;

  // 安全：禁止刪除自己
  if (lineUserId === auth.user.lineUserId) {
    return NextResponse.json(
      { error: "不能刪除自己 (你正用這個帳號操作)" },
      { status: 400 },
    );
  }

  const force = new URL(req.url).searchParams.get("force") === "true";

  // 找出此 user 的相關資料
  const bookings = await prisma.booking.findMany({
    where: { userId: lineUserId },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);

  if (!force && bookingIds.length > 0) {
    return NextResponse.json(
      {
        error: `這個會員還有 ${bookingIds.length} 筆訂單，預設不允許刪除。`,
        bookingsCount: bookingIds.length,
        canForce: true,
        hint: "用 ?force=true 強制刪除（會同時刪掉訂單+轉帳截圖+提醒記錄）",
      },
      { status: 409 },
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (bookingIds.length > 0) {
        await tx.paymentProof.deleteMany({
          where: { bookingId: { in: bookingIds } },
        });
        await tx.reminderLog.deleteMany({
          where: { bookingId: { in: bookingIds } },
        });
        await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      }
      // 若是教練，也把 coach 表的 lineUserId 設 null（schema: SetNull）
      // Prisma 會自動處理；保險起見也可以顯式 unlink
      // tx.coach.updateMany({ where: { lineUserId }, data: { lineUserId: null } });
      await tx.user.delete({ where: { lineUserId } });
    });
    return NextResponse.json({
      ok: true,
      deleted: { user: 1, bookings: bookingIds.length },
    });
  } catch (e) {
    console.error("[DELETE /admin/users]", e);
    return NextResponse.json(
      {
        error: "刪除失敗",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
