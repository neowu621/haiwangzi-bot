import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, getUserRoles } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { buildFlexByKeyAsync } from "@/lib/flex";
import { notifyCustomer } from "@/lib/notify-template";
import { genBookingCode } from "@/lib/code-gen";
import { generatePayLinkToken } from "@/lib/pay-link";
import { checkRateLimit, RATE_LIMIT } from "@/lib/rate-limit";
import { logCustomerActivity } from "@/lib/customer-activity"; // v334
import { normalizeVipTiers, getGearDiscountPct } from "@/lib/vip-tier"; // v388
import { getActiveTankPromo } from "@/lib/tank-promo"; // v392
import { validatePromoCode, computeCodeDiscount, earlyBirdCredit, type EarlyBirdTier } from "@/lib/promo"; // v592
import { spendCreditFIFO, availableCredit } from "@/lib/credit-fifo"; // v592

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  tripId: z.string().uuid(),
  participants: z.number().int().min(1).max(10).default(1),
  // 客戶選擇的潛次 (1..trip.tankCount)。未帶就吃 trip.tankCount。
  tankCount: z.number().int().min(1).max(5).optional(),
  rentalGear: z
    .array(
      z.object({
        itemType: z.enum(["BCD", "regulator", "wetsuit", "fins", "mask", "computer", "full_set"]),
        // 安全：min(0) 防止 client 送負數造成負餘額（credit attack）
        // max(50000) 防止離譜金額
        price: z.number().int().min(0).max(50000),
        // 數量；舊版客戶不送 qty 視為 1 (per person 模式由 totalAmount 公式統一處理)
        qty: z.number().int().min(1).max(20).default(1),
      }),
    )
    .default([]),
  notes: z.string().optional(),
  // 付款方式：cash 現場 / bank 轉帳 / linepay / other
  // v289: paymentMethod 改為可選 — 建立訂單時不選，等客戶到「付款方式選擇」頁才寫入
  // v309：拿掉 cash（v289 起 daily 不再支援現場支付）
  paymentMethod: z.enum(["bank", "linepay", "other"]).nullable().optional(),
  // 「其他」付款方式時客戶填寫的說明
  paymentNote: z.string().max(200).optional(),
  // 使用抵用金折抵 (NT$)。後端會驗 ≤ 可用抵用金 且 ≤ totalAmount
  creditUsed: z.number().int().min(0).optional().default(0),
  // v592：節慶優惠代碼（可空）
  promoCode: z.string().max(16).optional(),
  agreedToTerms: z.literal(true),
  // v260：手寫簽名 PNG data URL（後端解 base64 上傳 R2 後存 key 到 Booking）
  signatureDataUrl: z.string().optional(),
  // 客戶資料補完
  realName: z.string().optional(),
  phone: z.string().optional(),
  cert: z.enum(["OW", "AOW", "Rescue", "DM", "Instructor"]).optional(),
  certNumber: z.string().optional(),
  logCount: z.number().int().min(0).optional(),
  emergencyContact: z
    .object({
      name: z.string(),
      phone: z.string(),
      relationship: z.string(),
    })
    .optional(),
  // 多人預約時，各參加者明細（第一位為本人）
  participantDetails: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        phone: z.string().optional().default(""),
        cert: z
          .enum(["OW", "AOW", "Rescue", "DM", "Instructor"])
          .nullable()
          .optional(),
        certNumber: z.string().optional().default(""),
        logCount: z.number().int().min(0).optional().default(0),
        relationship: z.string().optional().default(""),
        isSelf: z.boolean().optional().default(false),
      }),
    )
    .optional(),
});

// POST /api/bookings/daily
// v291：建立日潛訂單。預設 status=pending 等客戶付款 → admin 審核 → 才轉 confirmed
//   舊版（v288 前）日潛走現場收費直接 confirmed，現在跟 tour 邏輯一致
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  // Rate limit：30 次/分鐘 per user
  const limited = checkRateLimit(req, { ...RATE_LIMIT.BOOKING, identifier: auth.lineUserId });
  if (limited) return limited;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const trip = await prisma.divingTrip.findUnique({ where: { id: data.tripId } });
  if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  if (trip.status !== "open")
    return NextResponse.json({ error: `trip status: ${trip.status}` }, { status: 400 });

  // v341：場次開始前 2 小時截止預約（server-side guard，防 UI 繞過）
  {
    const tripDateStr = trip.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    const startMs = new Date(`${tripDateStr}T${trip.startTime.slice(0, 5)}:00+08:00`).getTime();
    const cutoffMs = startMs - 2 * 60 * 60 * 1000;
    if (Date.now() >= cutoffMs) {
      return NextResponse.json(
        { error: "booking_closed", message: "此場次已截止預約（開始前 2 小時截止）" },
        { status: 400 },
      );
    }
  }

  // 黑名單檢查
  if (auth.user.blacklisted) {
    return NextResponse.json(
      {
        error: "blacklisted",
        message:
          auth.user.blacklistReason ||
          `您的帳號被標記為黑名單，請聯絡${process.env.NEXT_PUBLIC_APP_NAME ?? "管理員"}處理`,
      },
      { status: 403 },
    );
  }
  // v313：擋未驗證 Email 客戶下單
  if (!auth.user.emailVerifiedAt) {
    return NextResponse.json(
      {
        error: "email_not_verified",
        message: "請先完成 Email 驗證才能下單。請至「個人」分頁查看驗證信，或在頂部 banner 點「重寄驗證信」。",
      },
      { status: 403 },
    );
  }

  // v289：建立訂單時不再選付款方式，所以這裡 LV1 cash 限制移除
  //   付款方式在 /liff/payment/[bookingId] 才選；那邊會檢查 VIP 等級

  // 計算目前已預約人數
  const booked = await prisma.booking.aggregate({
    where: {
      refId: data.tripId,
      type: "daily",
      status: {
        notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"],
      },
    },
    _sum: { participants: true },
  });
  const currentBooked = booked._sum.participants ?? 0;

  // 容量檢查：null = 無上限，不擋；有上限時超賣 → 不擋但標記 overCapacity 推給教練
  let overCapacity = false;
  if (trip.capacity != null) {
    if (currentBooked + data.participants > trip.capacity) {
      overCapacity = true;
    }
  }

  // 算錢
  const pricing = trip.pricing as {
    baseTrip: number;
    extraTank: number;
    nightDive: number;
    scooterRental: number;
  };
  const effectiveTanks = Math.min(
    trip.tankCount,
    Math.max(1, data.tankCount ?? trip.tankCount),
  );
  // v48 計價公式：
  //   總額 = baseTrip (整單平收) + extraTank × 支數 × 人數 + 夜潛/水推附加 + 裝備
  //   pricing.baseTrip   = 整單一次性基本費（船費分攤等），預設 0，不 ×人數
  //   pricing.extraTank  = 每一次潛水（含空氣瓶）單價，× 支數 × 人數
  //   pricing.nightDive  = 夜潛附加費（整單平收）
  //   pricing.scooterRental = 水推附加費（整單平收）
  // v392 + v388：下單前抓一次 SiteConfig（氣瓶折扣 + VIP 裝備折扣共用）
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
        // v592：日潛早鳥回饋
        earlyBirdEnabled: true,
        earlyBirdMinAmount: true,
        earlyBirdTiers: true,
      },
    })
    .catch(() => null);

  // v638：教練/助教 氣瓶優惠價（固定每支價）。下單者 roles 含 coach/assistant 時套用，
  //   獨佔——不再套氣瓶限時折扣 / 優惠代碼 / 早鳥；抵用金仍可折。只適用日潛。
  const isStaffDiver = getUserRoles(auth.user).some((r) => r === "coach" || r === "assistant");
  const staffTankApplied = Boolean(cfg?.staffTankEnabled) && isStaffDiver;
  // 教練價不可高於原價（避免設定失誤反而變貴）；套用後即為氣瓶單價，不再另折
  const staffTankUnit = staffTankApplied
    ? Math.max(0, Math.min(cfg?.staffTankPrice ?? 0, pricing.extraTank))
    : pricing.extraTank;

  // v392：氣瓶限時折扣（自動,每瓶折抵 NT$,不可使每瓶費變負）；教練價套用時不再疊
  const tankPromo = getActiveTankPromo(cfg);
  const tankDiscountPerTank = (!staffTankApplied && tankPromo.active)
    ? Math.min(tankPromo.discount, pricing.extraTank)
    : 0;

  let extraAmount = pricing.baseTrip;
  if (trip.isNightDive) extraAmount += pricing.nightDive;
  if (trip.isScooter) extraAmount += pricing.scooterRental;
  // 裝備：各自獨立數量 + VIP 折扣
  const gearAmountRaw = data.rentalGear.reduce((s, g) => s + g.price * g.qty, 0);
  let gearAmount = gearAmountRaw;
  let gearDiscountPct = 100;
  if (gearAmountRaw > 0) {
    const tiers = cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : undefined;
    gearDiscountPct = getGearDiscountPct(auth.user.vipLevel ?? 0, tiers);
    if (gearDiscountPct < 100) {
      gearAmount = Math.round((gearAmountRaw * gearDiscountPct) / 100);
    }
  }
  void gearDiscountPct;

  // v592：未折前總額 + 自動氣瓶折(總)；v638：教練價時氣瓶以教練單價計
  const totalTanks = effectiveTanks * data.participants;
  const baseNoDiscount = staffTankUnit * totalTanks + extraAmount + gearAmount;
  const autoDiscount = tankDiscountPerTank * totalTanks;

  // v592：節慶優惠代碼 —— 與自動氣瓶折「取其優」(不疊加),可疊抵用金
  // v638：套用教練氣瓶優惠價時，不再吃優惠代碼（獨佔）
  let promoCodeApplied: string | null = null;
  let promoDiscount = 0;
  if (!staffTankApplied && data.promoCode?.trim()) {
    const vr = await validatePromoCode(data.promoCode, {
      type: "daily",
      orderAmount: baseNoDiscount,
      userId: auth.user.lineUserId,
      userVipLevel: auth.user.vipLevel ?? 0,
    });
    if (!vr.ok) {
      return NextResponse.json({ error: vr.reason ?? "優惠代碼無效" }, { status: 400 });
    }
    if (vr.promo) {
      const codeDiscount = computeCodeDiscount(
        { discountType: vr.promo.discountType, discountValue: vr.promo.discountValue, minAmount: vr.promo.minAmount },
        { orderAmount: baseNoDiscount, totalTanks },
      );
      if (codeDiscount > autoDiscount) {
        promoCodeApplied = vr.promo.code;
        promoDiscount = codeDiscount;
      }
    }
  }

  const finalDiscount = Math.max(autoDiscount, promoDiscount);
  const totalAmount = Math.max(0, baseNoDiscount - finalDiscount);

  // v592：日潛早鳥回饋(預計;訂單結案後才實際發放,30 天到期)
  // v638：套用教練氣瓶優惠價時，不發早鳥（獨佔）
  let earlyBirdReward = 0;
  if (!staffTankApplied && cfg?.earlyBirdEnabled) {
    const leadDays = Math.floor((new Date(trip.date).getTime() - Date.now()) / 86400000);
    earlyBirdReward = earlyBirdCredit(
      (cfg.earlyBirdTiers as unknown as EarlyBirdTier[]) ?? [],
      leadDays,
      totalAmount,
      cfg.earlyBirdMinAmount ?? 0,
    );
  }

  // 抵用金折抵：不超過「可用抵用金(已清過期)」也不超過總金額(可疊優惠代碼)
  const availCredit = await availableCredit(auth.user.lineUserId);
  const creditUsed = Math.max(0, Math.min(data.creditUsed ?? 0, availCredit, totalAmount));

  // 更新 user 個資 (如有提供)
  const userPatch: Parameters<typeof prisma.user.update>[0]["data"] = {};
  if (data.realName) userPatch.realName = data.realName;
  if (data.phone) userPatch.phone = data.phone;
  if (data.cert) userPatch.cert = data.cert;
  if (data.certNumber) userPatch.certNumber = data.certNumber;
  if (data.logCount !== undefined) userPatch.logCount = data.logCount;
  if (data.emergencyContact) userPatch.emergencyContact = data.emergencyContact;

  // 同伴 merge：把這次預約裡 isSelf=false 的人加進 user.companions（按 name+phone 去重）
  const incomingCompanions = (data.participantDetails ?? []).filter(
    (p) => !p.isSelf,
  );
  if (incomingCompanions.length > 0) {
    const existing = (auth.user.companions as Array<{
      id: string;
      name: string;
      phone: string;
    }> | null | undefined) ?? [];
    const merged = [...existing];
    for (const c of incomingCompanions) {
      const dup = merged.find(
        (e) =>
          e.name === c.name && (e.phone || "") === (c.phone || ""),
      );
      if (!dup) {
        merged.push({
          id: c.id ?? crypto.randomUUID(),
          name: c.name,
          phone: c.phone ?? "",
          cert: c.cert ?? null,
          certNumber: c.certNumber ?? "",
          logCount: c.logCount ?? 0,
          relationship: c.relationship ?? "",
        } as never);
      }
    }
    userPatch.companions = merged as never;
  }

  if (Object.keys(userPatch).length > 0) {
    await prisma.user.update({
      where: { lineUserId: auth.user.lineUserId },
      data: userPatch,
    });
  }

  // v291：預付金額 = creditUsed。依抵用金折抵情況決定初始 status/paymentStatus
  //   - 抵用金 ≥ 全額 / totalAmount = 0：直接 confirmed + fully_paid（不必再付款）
  //   - 否則：pending + pending → 客戶到付款頁上傳 → awaiting_verify → admin 審核 → confirmed
  const paidAmount = creditUsed;
  let paymentStatus: "pending" | "fully_paid" = "pending";
  let status: "pending" | "confirmed" = "pending";
  // v293：totalAmount===0 也視為 fully_paid（不應卡在 pending）
  if (totalAmount === 0 || paidAmount >= totalAmount) {
    paymentStatus = "fully_paid";
    status = "confirmed";
  }

  // v712：凍結金額明細(下單當下的氣瓶/減免/裝備/抵用金…),供老闆結帳/核對顯示組成
  const priceBreakdown = {
    kind: "daily" as const,
    perTank: pricing.extraTank,
    tankUnitCharged: staffTankUnit,
    staffTankApplied,
    tankCount: effectiveTanks,
    participants: data.participants,
    totalTanks,
    baseTrip: extraAmount,
    divesAmount: staffTankUnit * totalTanks,
    tankDiscountPerTank,
    autoDiscount,
    gearItems: data.rentalGear,
    gearAmountRaw,
    gearAmount,
    gearDiscountPct,
    promoCode: promoCodeApplied,
    promoDiscount,
    finalDiscount,
    totalAmount,
    creditUsed,
    payable: Math.max(0, totalAmount - creditUsed),
  };

  const bookingCode = await genBookingCode();
  const booking = await prisma.booking.create({
    data: {
      code: bookingCode,
      userId: auth.user.lineUserId,
      type: "daily",
      refId: data.tripId,
      participants: data.participants,
      tankCount: effectiveTanks, // v704：存客戶實際選的潛次（每人），讓「我的預約」顯示正確
      participantDetails: (data.participantDetails ?? []) as never,
      rentalGear: data.rentalGear,
      priceBreakdown, // v712
      notes: data.notes,
      totalAmount,
      depositAmount: 0,
      paidAmount,
      paymentStatus,
      // v289：建立時不寫付款方式，等客戶到付款頁選
      paymentMethod: data.paymentMethod ?? null,
      paymentNote: data.paymentNote ?? null,
      // v296：公開付款連結 token
      payLinkToken: generatePayLinkToken(),
      creditUsed,
      // v592：節慶優惠 + 早鳥
      promoCode: promoCodeApplied,
      promoDiscount,
      earlyBirdCredit: earlyBirdReward,
      status,
      agreedToTermsAt: new Date(),
      overCapacity,
    },
  });

  // v278：記錄初始狀態
  void import("@/lib/booking-status-log").then((m) =>
    m.logBookingStatusChange({
      bookingId: booking.id,
      fromStatus: null,
      toStatus: status,
      actorId: auth.user.lineUserId,
      actorRole: "customer",
      note: `下單（付款狀態：${paymentStatus}）`,
    }),
  ).catch((e) => console.error("[booking-status-log]", e));

  // v260/v612：手寫簽名 — 先存進 DB 暫存欄位（快、永久不掉）→ 立刻回應；
  //   R2 上傳交「立即背景嘗試 + cron 補傳」，成功後清空 pending。簽名是法律證據但延遲/失敗都不擋下單。
  if (data.signatureDataUrl) {
    const ua = req.headers.get("user-agent") ?? null;
    try {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          signaturePending: data.signatureDataUrl,
          signaturePendingAt: new Date(),
          signedAt: new Date(),
          signedFromUserAgent: ua,
        } as never,
      });
      // 立即嘗試上傳（最佳路徑；失敗/崩潰由 cron /api/cron/flush-signatures 補傳）
      void import("@/lib/signature-flush")
        .then((m) => m.flushPendingSignature(booking.id))
        .catch((e) => console.error("[signature immediate flush]", e));
    } catch (e) {
      console.error("[booking signature pending save] failed", e);
    }
  }

  // 扣抵用金（v592：批次「先用最近到期」FIFO）
  if (creditUsed > 0) {
    try {
      await spendCreditFIFO({
        userId: auth.user.lineUserId,
        amount: creditUsed,
        refType: "booking",
        refId: booking.id,
        note: `日潛預約折抵`,
      });
    } catch (e) {
      // 扣抵用金失敗 → 把 booking 回滾（保護資料一致性）
      console.error("[booking credit deduct]", e);
      await prisma.booking.delete({ where: { id: booking.id } });
      return NextResponse.json(
        { error: "credit deduction failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // v592：優惠代碼使用次數 +1（總量上限統計用）
  if (promoCodeApplied) {
    await prisma.promoCode.updateMany({ where: { code: promoCodeApplied }, data: { usedCount: { increment: 1 } } }).catch((e) => console.error("[promo usedCount]", e));
  }

  // 超賣警示 → 推 Flex 給該場次的教練（fire-and-forget；失敗不影響預約建立）
  if (overCapacity && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    void notifyCoachesOvercap({
      coachIds: trip.coachIds,
      tripDate: trip.date.toISOString().slice(0, 10),
      tripTime: trip.startTime,
      siteIds: trip.diveSiteIds,
      customerName: data.realName || auth.user.realName || auth.user.displayName,
      requestedCount: data.participants,
      currentBooked,
      capacity: trip.capacity ?? 0,
      bookingId: booking.id,
    }).catch((e) => console.error("[overcap notify]", e));
  }

  // v480：預約確認改走 notifyCustomer — LINE flex + Email + 站內通知 全由 booking_confirm 模板組稿
  void sendBookingConfirmNotify({
    bookingId: booking.id,
    userId: auth.user.lineUserId,
  }).catch((e) => console.error("[booking confirm notify]", e));

  // v270：首單獎勵改在 attendance=completed 時觸發，不在這裡

  // v334：客戶活動紀錄
  void logCustomerActivity({
    req,
    user: { lineUserId: auth.user.lineUserId, realName: auth.user.realName, displayName: auth.user.displayName },
    action: "customer.booking.create",
    targetType: "booking",
    targetId: booking.id,
    targetLabel: booking.code ?? undefined,
    metadata: { type: "daily", tripId: data.tripId, participants: data.participants, totalAmount: booking.totalAmount },
  });

  return NextResponse.json({ ok: true, booking, overCapacity });
}

async function sendBookingConfirmNotify(args: {
  bookingId: string;
  userId: string;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: { user: true },
  });
  if (!booking) return;

  const trip = await prisma.divingTrip.findUnique({
    where: { id: booking.refId },
  });
  if (!trip) return;

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: trip.diveSiteIds } },
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz";
  const url = booking.payLinkToken
    ? `${base}/pay/${booking.id}?t=${booking.payLinkToken}`
    : `${base}/liff/my`;

  // v480：LINE flex + Email + 站內通知 全由 booking_confirm 模板組稿（後台填什麼發什麼）
  notifyCustomer({
    userId: args.userId,
    templateKey: "booking_confirm",
    params: {
      name: booking.user.realName ?? booking.user.displayName,
      date: trip.date.toISOString().slice(0, 10),
      time: trip.startTime,
      site: sites.map((s) => s.name).join("、") || "東北角",
      total: booking.totalAmount,
      activityNote: trip.activityNote ?? "", // v667：活動提醒（場次層級，客戶可見）
      notes: booking.notes ?? "",            // v667：客戶下單備註
      url,
    },
  });
}

async function notifyCoachesOvercap(args: {
  coachIds: string[];
  tripDate: string;
  tripTime: string;
  siteIds: string[];
  customerName: string;
  requestedCount: number;
  currentBooked: number;
  capacity: number;
  bookingId: string;
}) {
  const coaches = await prisma.coach.findMany({
    where: { id: { in: args.coachIds }, lineUserId: { not: null } },
  });
  if (coaches.length === 0) return;

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: args.siteIds } },
  });
  const siteName = sites.map((s) => s.name).join(" · ") || "東北角";

  // v480：改 async 版 — 套後台 override（標題/按鈕/通知列文字）
  const msg = await buildFlexByKeyAsync(
    "overcap_alert",
    {
      tripDate: args.tripDate,
      tripTime: args.tripTime,
      site: siteName,
      customerName: args.customerName,
      requestedCount: args.requestedCount,
      currentBooked: args.currentBooked,
      capacity: args.capacity,
      bookingId: args.bookingId,
      url:
        process.env.NEXT_PUBLIC_BASE_URL
          ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/coach/today`
          : "https://haiwangzi.xyz/liff/coach/today",
    },
    `${args.tripDate} ${args.tripTime} 超賣警示`,
  );

  const client = getLineClient();
  for (const c of coaches) {
    if (!c.lineUserId) continue;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.pushMessage({ to: c.lineUserId, messages: [msg as any] });
    } catch (e) {
      console.error("[overcap push to coach]", c.id, e);
    }
  }
}
