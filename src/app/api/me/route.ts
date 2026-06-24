import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334
import { normalizeVipTiers, getGearDiscountPct } from "@/lib/vip-tier"; // v388
import { getActiveTankPromo } from "@/lib/tank-promo"; // v392
import { reconcileExpiredCredits, availableCredit } from "@/lib/credit-fifo"; // v592

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me - 取自己的 profile + 統計
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  // v653：預約紀錄=未來要進行的（未取消/未完成/活動日未過）；已完成=過去+已取消+已完成
  const myBookings = await prisma.booking.findMany({
    where: { userId: auth.user.lineUserId },
    select: { type: true, refId: true, status: true },
  });
  let totalBookings = 0; // 即將進行
  let completed = 0;      // 已結束（過去/取消/完成）
  {
    const dailyIds = myBookings.filter((b) => b.type === "daily").map((b) => b.refId);
    const tourIds = myBookings.filter((b) => b.type === "tour").map((b) => b.refId);
    const [trips, tours] = await Promise.all([
      dailyIds.length ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true } }) : Promise.resolve([]),
      tourIds.length ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, dateEnd: true } }) : Promise.resolve([]),
    ]);
    const tripDate = new Map(trips.map((t) => [t.id, t.date.toISOString().slice(0, 10)]));
    const tourEnd = new Map(tours.map((t) => [t.id, t.dateEnd.toISOString().slice(0, 10)]));
    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    const CANCELLED = new Set(["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"]);
    for (const b of myBookings) {
      const isCancelled = CANCELLED.has(b.status);
      const isCompleted = b.status === "completed" || b.status === "no_show";
      const eventDate = b.type === "daily" ? tripDate.get(b.refId) : tourEnd.get(b.refId);
      const isPast = eventDate ? eventDate < todayStr : false;
      if (isCancelled || isCompleted || isPast) completed += 1;
      else totalBookings += 1;
    }
  }

  const u = auth.user;
  // v592：先清掉已過期抵用金,讓顯示餘額準確(早鳥 30 天短效金到期作廢)
  await reconcileExpiredCredits(u.lineUserId).catch(() => {});
  const creditBalanceNow = await availableCredit(u.lineUserId).catch(() => u.creditBalance ?? 0);
  // v388：算出此會員的「裝備租借折扣 %」（100=不折）給下單頁顯示折後價用
  const cfg = await prisma.siteConfig
    .findUnique({
      where: { id: "default" },
      select: {
        vipTiers: true,
        tankPromoEnabled: true,
        tankPromoDiscount: true,
        tankPromoReason: true,
        tankPromoStart: true,
        tankPromoEnd: true,
        // v638：教練/助教 氣瓶優惠價
        staffTankEnabled: true,
        staffTankPrice: true,
      },
    })
    .catch(() => null);
  const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : undefined;
  const gearDiscountPct = getGearDiscountPct(u.vipLevel ?? 1, tiers);
  // v392：氣瓶限時折扣（給下單頁顯示折後價 + 理由）
  const tankPromo = getActiveTankPromo(cfg);
  // v638：教練/助教 氣瓶優惠價（roles 含 coach/assistant 才 active；給下單頁顯示固定教練價）
  const meRoles = u.roles && u.roles.length > 0 ? u.roles : [u.role];
  const staffTank = {
    active: Boolean(cfg?.staffTankEnabled) && meRoles.some((r) => r === "coach" || r === "assistant"),
    price: cfg?.staffTankPrice ?? 0,
  };
  // v648：登入紀錄「原子搶位」防並發重複。
  //   App 載入時多個元件（LiffShell / 個人中心 / 未讀彈窗…）幾乎同時打 /api/me，
  //   舊的 check-then-insert 節流會競態 → 同一毫秒各寫一筆。改用 updateMany 條件更新：
  //   只有第一個並發請求能把 lastLoginLogAt 從「>30分前/null」更新成現在（row lock 序列化），
  //   搶到的人（count=1）才記一筆，其餘 count=0 直接跳過。
  void (async () => {
    try {
      const since = new Date(Date.now() - 30 * 60_000);
      const claim = await prisma.user.updateMany({
        where: {
          lineUserId: auth.user.lineUserId,
          OR: [{ lastLoginLogAt: null }, { lastLoginLogAt: { lt: since } }],
        },
        data: { lastLoginLogAt: new Date() },
      });
      if (claim.count > 0) {
        await logCustomerActivity({ req, user: auth.user, action: "customer.login" });
      }
    } catch (e) {
      console.error("[me login-log]", e);
    }
  })();
  return NextResponse.json({
    lineUserId: u.lineUserId,
    displayName: u.displayName,
    realName: u.realName,
    phone: u.phone,
    email: u.email,
    emailVerifiedAt: u.emailVerifiedAt, // v258：給 profile 頁顯示「已驗證 ✓」徽章用
    onboardingCompletedAt: u.onboardingCompletedAt, // v311：給 LiffShell 判斷是否需強制 Onboarding
    notifyByLine: u.notifyByLine,
    notifyByEmail: u.notifyByEmail,
    cert: u.cert,
    certNumber: u.certNumber,
    logCount: u.logCount,
    haiwangziLogCount: u.haiwangziLogCount ?? 0,
    role: u.role,
    // 新版多重身分；空陣列 fallback 為 [role]
    roles: u.roles && u.roles.length > 0 ? u.roles : [u.role],
    vipLevel: u.vipLevel ?? 1,
    gearDiscountPct, // v388：裝備租借折扣 %（100=不折，80=打 8 折）
    tankPromo, // v392：氣瓶限時折扣 { active, discount, reason }
    staffTank, // v638：教練/助教 氣瓶優惠價 { active, price }
    totalSpend: u.totalSpend ?? 0,
    birthday: u.birthday,
    creditBalance: creditBalanceNow,
    notes: u.notes,
    emergencyContact: u.emergencyContact,
    companions: u.companions ?? [],
    createdAt: u.createdAt,
    stats: {
      totalBookings,
      completed,
    },
  });
}

const CompanionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  cert: z.enum(["OW", "AOW", "Rescue", "DM", "Instructor"]).nullable().optional(),
  certNumber: z.string().optional().default(""),
  logCount: z.number().int().min(0).optional().default(0),
  relationship: z.string().optional().default(""),
});

const PatchSchema = z.object({
  realName: z.string().optional(),
  phone: z.string().optional(),
  email: z
    .string()
    .email("email 格式不對")
    .max(254)
    .nullable()
    .optional()
    .or(z.literal("")),
  notifyByLine: z.boolean().optional(),
  notifyByEmail: z.boolean().optional(),
  // 生日 — YYYY-MM-DD 字串；空字串 = 清空
  birthday: z.string().nullable().optional(),
  cert: z.enum(["OW", "AOW", "Rescue", "DM", "Instructor"]).nullable().optional(),
  certNumber: z.string().nullable().optional(),
  logCount: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
  emergencyContact: z
    .object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
    .nullable()
    .optional(),
  companions: z.array(CompanionSchema).optional(),
  // v311：onboarding 完成 — client 在 onboarding modal 完成後送 markOnboardingComplete:true
  markOnboardingComplete: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined) {
      // v311：markOnboardingComplete 是 client-side flag，不直接寫進 user table
      if (k === "markOnboardingComplete") continue;
      // 空字串 → null（避免 DB 存空字串）
      if (k === "birthday") {
        data[k] = v && typeof v === "string" ? new Date(v as string) : null;
      } else {
        data[k] = v === "" ? null : v;
      }
    }
  }
  // v388：生日鎖定 — 客戶只能「填一次」；已填過就不能自己改（僅 admin/boss 可改後台改）。
  //   已設定且嘗試改成不同日期 → 擋；改成相同日期 → 視為無動作放行。
  if (body.birthday !== undefined && auth.user.birthday) {
    const existing = auth.user.birthday.toISOString().slice(0, 10);
    const incoming =
      data.birthday instanceof Date
        ? data.birthday.toISOString().slice(0, 10)
        : null;
    if (incoming !== existing) {
      return NextResponse.json(
        {
          error: "birthday_locked",
          message: "生日已設定，無法自行修改。如需更正請聯絡客服／管理員。",
        },
        { status: 403 },
      );
    }
    // 相同 → 不重複寫
    delete data.birthday;
  }

  // v311：偵測 email 變更 → 自動清 emailVerifiedAt（強制重新驗證）
  if (body.email !== undefined && body.email !== "" && body.email !== null) {
    const current = await prisma.user.findUnique({
      where: { lineUserId: auth.user.lineUserId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (current && current.email !== body.email && current.emailVerifiedAt) {
      data.emailVerifiedAt = null;
    }
  }
  // v311：完成 onboarding → 寫 onboardingCompletedAt
  if (body.markOnboardingComplete === true) {
    data.onboardingCompletedAt = new Date();
  }
  try {
    const updated = await prisma.user.update({
      where: { lineUserId: auth.user.lineUserId },
      data,
    });
    void logCustomerActivity({
      req,
      user: auth.user,
      action: "customer.profile.update",
      targetType: "user",
      targetId: auth.user.lineUserId,
      metadata: { fields: Object.keys(data) },
    });
    return NextResponse.json({ ok: true, user: updated });
  } catch (e) {
    console.error("[PATCH /api/me]", e);
    return NextResponse.json(
      { error: "update failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
