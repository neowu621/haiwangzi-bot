// v320: 客戶完整資訊（給 CustomerDetailDialog 用）
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { userId } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { lineUserId: userId },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      phone: true,
      email: true,
      emailVerifiedAt: true,
      cert: true,
      certNumber: true,
      logCount: true,
      vipLevel: true,
      creditBalance: true,
      totalSpend: true,
      notifyByLine: true,
      notifyByEmail: true,
      birthday: true,
      role: true,
      createdAt: true,
      lastActiveAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // 統計：訂單數 / 願望單數
  const [bookingCount, wishCount] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.diveWish.count({ where: { userId } }),
  ]);

  return NextResponse.json({
    user,
    stats: { bookingCount, wishCount },
  });
}
