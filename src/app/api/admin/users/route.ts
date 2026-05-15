import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { computeVipLevel } from "@/lib/vip-tier";

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
      // 若 roles 為空，視為 [role]，前端用這個欄位畫 chips
      effectiveRoles: u.roles && u.roles.length > 0 ? u.roles : [u.role],
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
  role: z.enum(["customer", "coach", "boss", "admin"]).optional(),
  // 多重身分（推薦）；若帶這個會同步把 role 設為第一個元素以保持向後相容
  roles: z.array(z.enum(["customer", "coach", "boss", "admin"])).optional(),
  realName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z
    .string()
    .email("email 格式不對")
    .max(254)
    .nullable()
    .optional()
    .or(z.literal("")),
  cert: z
    .enum(["OW", "AOW", "Rescue", "DM", "Instructor"])
    .nullable()
    .optional(),
  certNumber: z.string().nullable().optional(),
  logCount: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  blacklisted: z.boolean().optional(),
  blacklistReason: z.string().nullable().optional(),
  vipLevel: z.number().int().min(1).max(5).optional(),
  // admin 可手動調整累計消費（修正歷史資料用）
  totalSpend: z.number().int().min(0).optional(),
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
  if (data.roles !== undefined) {
    // 去重 + 至少要有一個角色
    const uniq = Array.from(new Set(data.roles));
    if (uniq.length === 0) {
      return NextResponse.json(
        { error: "roles 至少要有一個角色（customer / coach / admin）" },
        { status: 400 },
      );
    }
    patch.roles = uniq;
    // 同步 primary role (backwards compat)：admin > coach > customer 優先順序
    const priority = ["admin", "coach", "customer"] as const;
    patch.role = priority.find((r) => uniq.includes(r)) ?? "customer";
  } else if (data.role !== undefined) {
    // 沒帶 roles 但有帶 role：當作單一角色處理，並同步 roles
    patch.role = data.role;
    patch.roles = [data.role];
  }
  if (data.realName !== undefined)
    patch.realName = data.realName === "" ? null : data.realName;
  if (data.phone !== undefined)
    patch.phone = data.phone === "" ? null : data.phone;
  if (data.email !== undefined)
    patch.email = data.email === "" ? null : data.email;
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
  if (data.totalSpend !== undefined) patch.totalSpend = data.totalSpend;

  // 若 admin 只改了 logCount 或 totalSpend，沒手動指定 vipLevel → 自動重算
  if (
    data.vipLevel === undefined &&
    (data.logCount !== undefined || data.totalSpend !== undefined)
  ) {
    const existing = await prisma.user.findUnique({
      where: { lineUserId: data.lineUserId },
    });
    if (existing) {
      const finalLogs = data.logCount ?? existing.logCount;
      const finalSpend = data.totalSpend ?? existing.totalSpend ?? 0;
      patch.vipLevel = computeVipLevel(finalLogs, finalSpend);
    }
  }

  const updated = await prisma.user.update({
    where: { lineUserId: data.lineUserId },
    data: patch,
  });
  return NextResponse.json({ ok: true, user: updated });
}
