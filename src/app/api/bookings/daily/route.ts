import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

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
        price: z.number().int(),
        // 數量；舊版客戶不送 qty 視為 1 (per person 模式由 totalAmount 公式統一處理)
        qty: z.number().int().min(1).max(20).default(1),
      }),
    )
    .default([]),
  notes: z.string().optional(),
  agreedToTerms: z.literal(true),
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
// 建立日潛訂單 (現場收費,所以 paymentStatus=pending,當天現場結算)
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

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
          "您的帳號被標記為黑名單，請聯絡海王子潛水團處理",
      },
      { status: 403 },
    );
  }

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
  let baseAmount = pricing.baseTrip + (effectiveTanks - 1) * pricing.extraTank;
  if (trip.isNightDive) baseAmount += pricing.nightDive;
  if (trip.isScooter) baseAmount += pricing.scooterRental;
  // 裝備改為各自獨立數量 (不再 ×人數)
  const gearAmount = data.rentalGear.reduce((s, g) => s + g.price * g.qty, 0);
  const totalAmount = baseAmount * data.participants + gearAmount;

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

  const booking = await prisma.booking.create({
    data: {
      userId: auth.user.lineUserId,
      type: "daily",
      refId: data.tripId,
      participants: data.participants,
      participantDetails: (data.participantDetails ?? []) as never,
      rentalGear: data.rentalGear,
      notes: data.notes,
      totalAmount,
      depositAmount: 0,
      paidAmount: 0,
      paymentStatus: "pending",
      status: "confirmed", // 日潛當天現場收費,直接 confirmed
      agreedToTermsAt: new Date(),
      overCapacity,
    },
  });

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

  return NextResponse.json({ ok: true, booking, overCapacity });
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
