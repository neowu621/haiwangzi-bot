import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/users  ─── 含 LTV stats（總預約數、總消費、no-show 次數）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const users = await prisma.user.findMany({
    orderBy: { lastActiveAt: "desc" },
    take: 500,
  });

  // 批次計算每個 user 的 LTV
  const userIds = users.map((u) => u.lineUserId);
  const aggregates = await prisma.booking.groupBy({
    by: ["userId", "status"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
    _sum: { paidAmount: true, totalAmount: true },
  });

  const stats = new Map<
    string,
    {
      totalBookings: number;
      completed: number;
      cancelled: number;
      noShow: number;
      revenue: number; // 已付款金額
      potential: number; // 預訂金額
    }
  >();
  for (const a of aggregates) {
    const s = stats.get(a.userId) ?? {
      totalBookings: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      revenue: 0,
      potential: 0,
    };
    s.totalBookings += a._count._all;
    if (a.status === "completed") s.completed += a._count._all;
    if (a.status.startsWith("cancelled")) s.cancelled += a._count._all;
    if (a.status === "no_show") s.noShow += a._count._all;
    s.revenue += a._sum.paidAmount ?? 0;
    s.potential += a._sum.totalAmount ?? 0;
    stats.set(a.userId, s);
  }

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      stats: stats.get(u.lineUserId) ?? {
        totalBookings: 0,
        completed: 0,
        cancelled: 0,
        noShow: 0,
        revenue: 0,
        potential: 0,
      },
    })),
  });
}

const PatchSchema = z.object({
  lineUserId: z.string(),
  role: z.enum(["customer", "coach", "admin"]).optional(),
  realName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  cert: z
    .enum(["OW", "AOW", "Rescue", "DM", "Instructor"])
    .nullable()
    .optional(),
  certNumber: z.string().nullable().optional(),
  logCount: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  blacklisted: z.boolean().optional(),
  blacklistReason: z.string().nullable().optional(),
  vipLevel: z.number().int().min(0).max(2).optional(),
});

// POST /api/admin/users
//   - 改 role / 加入或解除黑名單 / 設 VIP
//   - 改個人資料：realName / phone / cert / certNumber / logCount / notes
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = PatchSchema.parse(await req.json());
  const patch: Record<string, unknown> = {};
  if (data.role !== undefined) patch.role = data.role;
  if (data.realName !== undefined)
    patch.realName = data.realName === "" ? null : data.realName;
  if (data.phone !== undefined)
    patch.phone = data.phone === "" ? null : data.phone;
  if (data.cert !== undefined) patch.cert = data.cert;
  if (data.certNumber !== undefined)
    patch.certNumber = data.certNumber === "" ? null : data.certNumber;
  if (data.logCount !== undefined) patch.logCount = data.logCount;
  if (data.notes !== undefined)
    patch.notes = data.notes === "" ? null : data.notes;
  if (data.blacklisted !== undefined) patch.blacklisted = data.blacklisted;
  if (data.blacklistReason !== undefined)
    patch.blacklistReason =
      data.blacklistReason === "" ? null : data.blacklistReason;
  if (data.vipLevel !== undefined) patch.vipLevel = data.vipLevel;

  const updated = await prisma.user.update({
    where: { lineUserId: data.lineUserId },
    data: patch,
  });
  return NextResponse.json({ ok: true, user: updated });
}
