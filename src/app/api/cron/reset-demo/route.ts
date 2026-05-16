import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// /api/cron/reset-demo
// ─────────────────────────────────────────────────────────
//
// Demo 環境每日 reset：清掉所有「使用者產生」資料 + 重跑 demo seed
//
// 安全：
//  - 只在 RESET_DEMO_DAILY=1 時執行（防止 prod 誤跑）
//  - 認證：Authorization: Bearer <CRON_SECRET>
//
// 保留：SiteConfig, MessageTemplate（admin 設定）
// 清掉：CreditTx, PaymentProof, Booking, ReminderLog, TripPhoto, TripMedia,
//       DivingTrip([demo]), TourPackage([demo]), User(U_dev_*)
//
// 重跑：./prisma/seed-demo.ts 的邏輯（內嵌精簡版）
// ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (process.env.RESET_DEMO_DAILY !== "1") {
    return NextResponse.json(
      {
        error: "demo reset disabled",
        hint: "set RESET_DEMO_DAILY=1 to enable (demo env only)",
      },
      { status: 403 },
    );
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const counts: Record<string, number> = {};

  // 1. 清使用者產生資料（按 FK 順序）
  counts.reminderLogs = (await prisma.reminderLog.deleteMany({})).count;
  counts.paymentProofs = (await prisma.paymentProof.deleteMany({})).count;
  counts.creditTxs = (await prisma.creditTx.deleteMany({})).count;
  counts.bookings = (await prisma.booking.deleteMany({})).count;
  counts.tripPhotos = (await prisma.tripPhoto.deleteMany({})).count;
  counts.tripMedia = (await prisma.tripMedia.deleteMany({})).count;
  // 清 [demo] 標記的 trips / tours
  counts.divingTrips = (
    await prisma.divingTrip.deleteMany({ where: { weatherNote: "[demo]" } })
  ).count;
  counts.tourPackages = (
    await prisma.tourPackage.deleteMany({
      where: { title: { contains: "[demo]" } },
    })
  ).count;

  // 2. 把 dev personas 的「個人變動資料」reset（保留 user row 避免 FK 問題）
  counts.usersReset = (
    await prisma.user.updateMany({
      where: { lineUserId: { startsWith: "U_dev_" } },
      data: {
        logCount: 0,
        haiwangziLogCount: 0,
        totalSpend: 0,
        vipLevel: 1,
        creditBalance: 0,
        birthdayCreditYear: null,
        noShowCount: 0,
        notes: null,
        blacklisted: false,
        blacklistReason: null,
        companions: [],
        emergencyContact: Prisma.DbNull,
      },
    })
  ).count;

  // 3. 觸發 demo seed（用 spawn 跑同 repo 的 npm script）
  // 但是在 Next.js serverless 跑 child_process 不可靠，直接 inline 呼叫核心邏輯
  //
  // 因為 seed 邏輯較長且會引入 prisma client 雙重連線問題，
  // 簡化版：呼叫一個 helper 函式 reseedDemo()
  await reseedDemo();

  return NextResponse.json({
    ok: true,
    cleared: counts,
    reseededAt: new Date().toISOString(),
  });
}

/**
 * 精簡 demo reseed（從 prisma/seed-demo.ts 抽出共用核心）
 * 灌：sites / coaches / trips / 1 個 tour / customer_2 一筆完成歷史 + 200 禮金
 */
async function reseedDemo() {
  const PRICING = {
    baseTrip: 0,
    extraTank: 600,
    nightDive: 500,
    scooterRental: 1500,
  };

  // sites
  const sites = [
    { id: "longdong-82.8", name: "龍洞 82.8", region: "northeast" as const, description: "東北角熱門潛點。", difficulty: "medium" as const, maxDepth: 25, features: ["軟珊瑚"] },
    { id: "yingge-stone", name: "鶯歌石", region: "northeast" as const, description: "入門潛點。", difficulty: "easy" as const, maxDepth: 18, features: ["軟珊瑚"] },
    { id: "shen-ao", name: "深奧", region: "northeast" as const, description: "夜潛潛點。", difficulty: "easy" as const, maxDepth: 20, features: ["夜潛"] },
    { id: "chaojing-park", name: "潮境公園", region: "northeast" as const, description: "水下保護區。", difficulty: "easy" as const, maxDepth: 22, features: ["魚群"] },
    { id: "green-island-da-bai-sha", name: "綠島大白沙", region: "green_island" as const, description: "綠島經典點。", difficulty: "medium" as const, maxDepth: 30, features: ["水推"] },
  ];
  for (const s of sites)
    await prisma.diveSite.upsert({ where: { id: s.id }, create: s, update: s });

  // coaches
  await prisma.coach.upsert({
    where: { id: "coach-akai" },
    create: {
      id: "coach-akai",
      lineUserId: "U_dev_coach_1",
      realName: "王阿凱",
      cert: "Instructor",
      feePerDive: 1500,
    },
    update: {},
  });
  await prisma.coach.upsert({
    where: { id: "coach-azhi" },
    create: {
      id: "coach-azhi",
      lineUserId: "U_dev_coach_2",
      realName: "陳阿志",
      cert: "DM",
      feePerDive: 1000,
    },
    update: {},
  });

  // trips：未來 14 天每天 1 場
  for (let d = 1; d <= 14; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    await prisma.divingTrip.create({
      data: {
        date,
        startTime: "08:00",
        diveSiteIds: [
          ["yingge-stone", "longdong-82.8", "shen-ao", "chaojing-park"][d % 4],
        ],
        tankCount: 3,
        capacity: 8,
        coachIds: ["coach-akai"],
        pricing: PRICING,
        status: "open",
        weatherNote: "[demo]",
      },
    });
  }

  // tour
  const dateStart = new Date();
  dateStart.setDate(dateStart.getDate() + 45);
  const dateEnd = new Date();
  dateEnd.setDate(dateEnd.getDate() + 47);
  await prisma.tourPackage.create({
    data: {
      title: "[demo] 綠島 3 天 2 夜潛水團",
      destination: "green_island",
      dateStart,
      dateEnd,
      basePrice: 12800,
      deposit: 5000,
      capacity: 8,
      diveSiteIds: ["green-island-da-bai-sha"],
      includes: ["民宿 2 晚", "船潛 6 支"],
      status: "open",
    },
  });

  // customer_2 預存 300 禮金（重設 birthdayCreditYear 與 creditBalance）
  await prisma.user.update({
    where: { lineUserId: "U_dev_customer_2" },
    data: { creditBalance: 300, totalSpend: 1800, vipLevel: 2, haiwangziLogCount: 3 },
  });
  await prisma.creditTx.create({
    data: {
      userId: "U_dev_customer_2",
      amount: 200,
      reason: "vip_upgrade",
      refType: "vip",
      refId: "2",
      note: "升等 LV2 獎勵",
      balanceAfter: 200,
    },
  });
  await prisma.creditTx.create({
    data: {
      userId: "U_dev_customer_2",
      amount: 100,
      reason: "birthday",
      note: "去年生日禮金",
      balanceAfter: 300,
    },
  });

  // admin 預存 5000 禮金
  await prisma.user.update({
    where: { lineUserId: "U_dev_admin" },
    data: { creditBalance: 5000 },
  });
  await prisma.creditTx.create({
    data: {
      userId: "U_dev_admin",
      amount: 5000,
      reason: "admin_adjust",
      note: "Demo 預設禮金",
      balanceAfter: 5000,
    },
  });
}
