import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { grantCredit, type CreditReason } from "@/lib/credit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/credits?userId=Uxxx — 查 user 的禮金紀錄
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId)
    return NextResponse.json({ error: "missing userId" }, { status: 400 });

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

// POST /api/admin/credits — 手動調整禮金（admin/boss 可發 / 扣）
const GrantSchema = z.object({
  userId: z.string(),
  amount: z.number().int(), // 正 = 增 / 負 = 扣
  reason: z.enum(["birthday", "vip_upgrade", "refund", "used", "admin_adjust"]),
  refType: z.string().optional(),
  refId: z.string().optional(),
  note: z.string().optional(),
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
    const result = await grantCredit({
      userId: data.userId,
      amount: data.amount,
      reason: data.reason as CreditReason,
      refType: data.refType ?? null,
      refId: data.refId ?? null,
      note: data.note ?? null,
      createdBy: auth.user.lineUserId,
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
