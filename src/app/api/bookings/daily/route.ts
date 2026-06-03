import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";
import { sendEmail } from "@/lib/email/send";
import { bookingConfirmEmail } from "@/lib/email/templates";
import { grantCredit } from "@/lib/credit";
import { genBookingCode } from "@/lib/code-gen";
import { checkRateLimit, RATE_LIMIT } from "@/lib/rate-limit";

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
  paymentMethod: z.enum(["cash", "bank", "linepay", "other"]).nullable().optional(),
  // 「其他」付款方式時客戶填寫的說明
  paymentNote: z.string().max(200).optional(),
  // 使用抵用金折抵 (NT$)。後端會驗 ≤ user.creditBalance 且 ≤ totalAmount
  creditUsed: z.number().int().min(0).optional().default(0),
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

  const data = BodySchema.parse(await req.json());

  const trip = await prisma.divingTrip.findUnique({ where: { id: data.tripId } });
  if (!trip) return NextResponse.json({ error: "trip not found" }, { status: 404 });
  if (trip.status !== "open")
    return NextResponse.json({ error: `trip status: ${trip.status}` }, { status: 400 });

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
  const divesAmount =
    pricing.extraTank * effectiveTanks * data.participants;
  let extraAmount = pricing.baseTrip;
  if (trip.isNightDive) extraAmount += pricing.nightDive;
  if (trip.isScooter) extraAmount += pricing.scooterRental;
  // 裝備：各自獨立數量
  const gearAmount = data.rentalGear.reduce((s, g) => s + g.price * g.qty, 0);
  const totalAmount = divesAmount + extraAmount + gearAmount;
  // 二次保護：理論上 schema 已擋負數，但 baseAmount 也可能因 admin 設負 pricing 出狀況
  if (totalAmount < 0) {
    return NextResponse.json(
      { error: `計算結果異常 (totalAmount=${totalAmount})，請聯絡客服` },
      { status: 400 },
    );
  }

  // 抵用金折抵：不能超過 user 餘額也不能超過總金額
  const creditUsed = Math.max(
    0,
    Math.min(
      data.creditUsed ?? 0,
      auth.user.creditBalance ?? 0,
      totalAmount,
    ),
  );

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

  const bookingCode = await genBookingCode();
  const booking = await prisma.booking.create({
    data: {
      code: bookingCode,
      userId: auth.user.lineUserId,
      type: "daily",
      refId: data.tripId,
      participants: data.participants,
      participantDetails: (data.participantDetails ?? []) as never,
      rentalGear: data.rentalGear,
      notes: data.notes,
      totalAmount,
      depositAmount: 0,
      paidAmount,
      paymentStatus,
      // v289：建立時不寫付款方式，等客戶到付款頁選
      paymentMethod: data.paymentMethod ?? null,
      paymentNote: data.paymentNote ?? null,
      creditUsed,
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
  );

  // v260：手寫簽名上 R2 → 更新 booking.signatureImageKey + signedAt + UA
  if (data.signatureDataUrl) {
    try {
      const { uploadSignatureFromDataUrl } = await import("@/lib/signature");
      const up = await uploadSignatureFromDataUrl(
        data.signatureDataUrl,
        booking.id,
      );
      if (up.ok && up.key) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            signatureImageKey: up.key,
            signedAt: new Date(),
            signedFromUserAgent: req.headers.get("user-agent") ?? null,
          },
        });
      }
      // 失敗不阻擋下單流程（signature 是法律證據但不該擋客戶完成預約；
      //  R2 未設定 / 網路問題等情況也能用文字 fallback）
    } catch (e) {
      console.error("[booking signature upload] failed", e);
    }
  }

  // 扣抵用金（用 grantCredit 寫 audit + 同步 balance）
  if (creditUsed > 0) {
    try {
      await grantCredit({
        userId: auth.user.lineUserId,
        amount: -creditUsed,
        reason: "used",
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

  // 寄預約確認 email（fire-and-forget；失敗不影響預約建立）
  void sendBookingConfirmEmail({
    bookingId: booking.id,
    userId: auth.user.lineUserId,
  }).catch((e) => console.error("[booking confirm email]", e));

  // v270：首單獎勵改在 attendance=completed 時觸發，不在這裡

  return NextResponse.json({ ok: true, booking, overCapacity });
}

async function sendBookingConfirmEmail(args: {
  bookingId: string;
  userId: string;
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
    include: { user: true },
  });
  if (!booking) return;
  if (!booking.user.notifyByEmail || !booking.user.email) return;

  const trip = await prisma.divingTrip.findUnique({
    where: { id: booking.refId },
  });
  if (!trip) return;

  const sites = await prisma.diveSite.findMany({
    where: { id: { in: trip.diveSiteIds } },
  });

  const tpl = bookingConfirmEmail({
    name: booking.user.realName ?? booking.user.displayName,
    type: "daily",
    date: trip.date.toISOString().slice(0, 10),
    startTime: trip.startTime,
    sites: sites.map((s) => s.name),
    participants: booking.participants,
    totalAmount: booking.totalAmount,
    paidAmount: booking.paidAmount,
    bookingId: booking.id,
    meetingPoint: trip.meetingPoint,
    notes: trip.notes,
  });

  await sendEmail({
    to: booking.user.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
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

  const msg = buildFlexByKey(
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
          : "https://haiwangzi.zeabur.app/liff/coach/today",
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
