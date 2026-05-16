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

  return NextResponse.json({
    balance: auth.user.creditBalance ?? 0,
    txs: txs.map((t) => ({
      id: t.id,
      amount: t.amount,
      reason: t.reason,
      note: t.note,
      balanceAfter: t.balanceAfter,
      createdAt: t.createdAt,
    })),
  });
}
