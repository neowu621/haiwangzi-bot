import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/credits — 自己的禮金 / 補償金 紀錄
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const txs = await prisma.creditTx.findMany({
    where: { userId: auth.user.lineUserId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // 計算累計收入 / 累計支出
  let totalIn = 0;
  let totalOut = 0;
  for (const t of txs) {
    if (t.amount > 0) totalIn += t.amount;
    else totalOut += -t.amount;
  }

  // 若是 used (折抵)，附上對應訂單編號方便客戶辨認
  const usedRefIds = txs
    .filter((t) => t.reason === "used" && t.refType === "booking" && t.refId)
    .map((t) => t.refId!) as string[];
  const bookingCodeMap = new Map<string, string | null>();
  if (usedRefIds.length > 0) {
    const bookings = await prisma.booking.findMany({
      where: { id: { in: usedRefIds } },
      select: { id: true, code: true },
    });
    for (const b of bookings) bookingCodeMap.set(b.id, b.code);
  }

  return NextResponse.json({
    balance: auth.user.creditBalance ?? 0,
    totalIn,
    totalOut,
    txs: txs.map((t) => ({
      id: t.id,
      amount: t.amount,
      reason: t.reason,
      refType: t.refType,
      refId: t.refId,
      refCode: t.refId ? bookingCodeMap.get(t.refId) ?? null : null,
      note: t.note,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
      // createdBy 不外洩 LINE userId，只標記是否由 admin 調整
      byAdmin: !!t.createdBy,
    })),
  });
}
