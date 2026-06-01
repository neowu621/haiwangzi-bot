import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { computeVipLevel, normalizeVipTiers, VIP_TIERS } from "@/lib/vip-tier";

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
  // admin 可手動調整海王子累積次數（修正歷史資料用）
  haiwangziLogCount: z.number().int().min(0).optional(),
  // 生日（YYYY-MM-DD）
  birthday: z.string().nullable().optional(),
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

  // v176 角色階層：Admin > Boss > Coach > Member (customer)
  // - Admin 角色：只能透過 script / bootstrap 設定，不能透過 UI/API 設
  // - 只有 Admin 可以把人設成 Boss
  // - Boss 只能把人設成 Member (customer)
  // - Coach 不能改任何人的角色
  // - 一個人只能有一個角色
  const callerRoles = new Set(auth.user.roles ?? [auth.user.role]);
  const callerPrimary = callerRoles.has("admin") ? "admin"
    : callerRoles.has("boss") ? "boss"
    : callerRoles.has("coach") ? "coach"
    : "customer";

  // 提取目標角色（roles[] 取第一個 / 或 data.role）
  let targetRole: string | undefined = undefined;
  if (data.roles !== undefined) {
    const uniq = Array.from(new Set(data.roles));
    if (uniq.length === 0) {
      return NextResponse.json({ error: "roles 不能為空" }, { status: 400 });
    }
    if (uniq.length > 1) {
      return NextResponse.json(
        { error: "一個人只能有一個角色，請只傳一個 role" },
        { status: 400 },
      );
    }
    targetRole = uniq[0];
  } else if (data.role !== undefined) {
    targetRole = data.role;
  }

  if (targetRole !== undefined) {
    // 規則 1：UI/API 完全禁止設定 Admin
    if (targetRole === "admin") {
      return NextResponse.json(
        { error: "Admin 角色只能透過系統腳本設定，不能透過介面授予" },
        { status: 403 },
      );
    }
    // 規則 2：只有 Admin 可以設定 Boss
    if (targetRole === "boss" && callerPrimary !== "admin") {
      return NextResponse.json(
        { error: "權限不足：只有 Admin 可以授予 Boss 身份" },
        { status: 403 },
      );
    }
    // 規則 3：Boss 可以設定 Coach 或 Member（v177 起放寬）
    //   v176 限制 Boss 只能設 Member，但實務上教練增減是 Boss 的日常業務
    //   只剩「設 Boss」需要 Admin 同意
    if (callerPrimary === "boss" && targetRole !== "customer" && targetRole !== "coach") {
      return NextResponse.json(
        { error: "權限不足：Boss 只能將人設為 Coach 或 Member" },
        { status: 403 },
      );
    }
    // 規則 4：Coach / Member 完全不能改角色（其實到不了這裡，因為 requireRole 已擋）
    if (callerPrimary !== "admin" && callerPrimary !== "boss") {
      return NextResponse.json(
        { error: "權限不足" },
        { status: 403 },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (targetRole !== undefined) {
    patch.role = targetRole;
    patch.roles = [targetRole]; // 單一角色：roles[] 永遠長度為 1
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
  if (data.haiwangziLogCount !== undefined)
    patch.haiwangziLogCount = data.haiwangziLogCount;
  if (data.birthday !== undefined)
    patch.birthday =
      data.birthday && typeof data.birthday === "string"
        ? new Date(data.birthday)
        : null;

  // 若 admin 改了 haiwangziLogCount 或 totalSpend，沒手動指定 vipLevel → 自動重算
  if (
    data.vipLevel === undefined &&
    (data.haiwangziLogCount !== undefined || data.totalSpend !== undefined)
  ) {
    const existing = await prisma.user.findUnique({
      where: { lineUserId: data.lineUserId },
    });
    if (existing) {
      // 用「海王子累積」次數計算，admin 改 logCount/totalSpend 不會直接觸發升等
      // 升等只看 haiwangziLogCount 或 totalSpend
      const finalHwLogs =
        data.haiwangziLogCount ?? existing.haiwangziLogCount ?? 0;
      const finalSpend = data.totalSpend ?? existing.totalSpend ?? 0;
      const cfg = await prisma.siteConfig
        .findUnique({ where: { id: "default" } })
        .catch(() => null);
      const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;
      patch.vipLevel = computeVipLevel(finalHwLogs, finalSpend, tiers);
    }
  }

  // 反向：若 admin 手動指定 vipLevel 而沒指定 haiwangziLogCount
  // → 自動把潛水次數設為該等級的最低門檻
  // 注意：totalSpend（累計消費）是真實付款紀錄，不會自動變動，只動潛水次數
  if (
    data.vipLevel !== undefined &&
    data.haiwangziLogCount === undefined
  ) {
    const cfg = await prisma.siteConfig
      .findUnique({ where: { id: "default" } })
      .catch(() => null);
    const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : VIP_TIERS;
    const tier = tiers.find((t) => t.level === data.vipLevel);
    if (tier) {
      patch.haiwangziLogCount = tier.minLogs;
    }
  }

  const updated = await prisma.user.update({
    where: { lineUserId: data.lineUserId },
    data: patch,
  });
  return NextResponse.json({ ok: true, user: updated });
}
