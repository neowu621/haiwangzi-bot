// Demo 環境專用 seed
// 跑法：npm run db:seed:demo
//
// 設計：
//  - 在「乾淨 DB」或「reset 後」跑
//  - 灌 6 個 dev personas + DiveSites + Coaches + 未來 30 天 trips + 2 個 tour
//  - customer_2 有歷史訂單（讓「我的預約」非空）
//  - admin 有禮金紀錄（讓禮金卡有東西看）
//  - customer_1 生日是今天（demo 生日禮金）
//
// ⚠️ 不會動 SiteConfig / MessageTemplate（admin 設定保留）

import { PrismaClient } from "@prisma/client";
import { DEV_PERSONAS } from "../src/lib/dev-personas";

const prisma = new PrismaClient();

const PRICING_DEFAULT = {
  baseTrip: 0,
  extraTank: 600,
  nightDive: 500,
  scooterRental: 1500,
};

const addDays = (d: number) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

async function main() {
  console.log("🌱 [demo] seeding...");

  // ─── DiveSites ────────────────────────────────────────
  const sites = [
    { id: "longdong-82.8", name: "龍洞 82.8", region: "northeast" as const, description: "東北角熱門潛點，軟珊瑚豐富，適合進階。", difficulty: "medium" as const, maxDepth: 25, features: ["軟珊瑚", "海蛞蝓"] },
    { id: "yingge-stone", name: "鶯歌石", region: "northeast" as const, description: "東北角入門潛點。", difficulty: "easy" as const, maxDepth: 18, features: ["軟珊瑚", "豆丁海馬"] },
    { id: "shen-ao", name: "深奧", region: "northeast" as const, description: "可夜潛的潛點。", difficulty: "easy" as const, maxDepth: 20, features: ["夜潛", "章魚"] },
    { id: "chaojing-park", name: "潮境公園", region: "northeast" as const, description: "基隆水下保護區。", difficulty: "easy" as const, maxDepth: 22, features: ["魚群", "保護區"] },
    { id: "green-island-da-bai-sha", name: "綠島大白沙", region: "green_island" as const, description: "綠島經典點。", difficulty: "medium" as const, maxDepth: 30, features: ["水推", "海狼"] },
    { id: "lanyu-bayan-bay", name: "蘭嶼八代灣", region: "lanyu" as const, description: "蘭嶼東岸代表潛點。", difficulty: "hard" as const, maxDepth: 35, features: ["珊瑚礁", "海龜"] },
  ];
  for (const s of sites) {
    await prisma.diveSite.upsert({ where: { id: s.id }, create: s, update: s });
  }
  console.log(`  ${sites.length} dive sites`);

  // ─── Coaches ──────────────────────────────────────────
  const coaches = [
    { id: "coach-akai", lineUserId: "U_dev_coach_1", realName: "王阿凱", cert: "Instructor" as const, specialty: ["夜潛", "水推"], feePerDive: 1500 },
    { id: "coach-azhi", lineUserId: "U_dev_coach_2", realName: "陳阿志", cert: "DM" as const, specialty: ["教學", "拍照"], feePerDive: 1000 },
  ];

  // ─── Dev personas (User) ──────────────────────────────
  // 注意：先建 user，再建綁定的 coach (FK)
  const today = new Date();
  for (const p of DEV_PERSONAS) {
    let birthday: Date | null = null;
    // customer_1 生日設為今天 - 1 年（讓今天可發禮金）
    if (p.lineUserId === "U_dev_customer_1") {
      birthday = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
    }
    // customer_2 生日下個月某天
    if (p.lineUserId === "U_dev_customer_2") {
      birthday = new Date(1995, today.getMonth() + 1 > 11 ? 0 : today.getMonth() + 1, 15);
    }

    await prisma.user.upsert({
      where: { lineUserId: p.lineUserId },
      create: {
        lineUserId: p.lineUserId,
        displayName: p.displayName,
        realName: p.realName,
        phone: p.phone ?? null,
        email: p.email ?? null,
        cert: p.cert ?? null,
        certNumber: p.certNumber ?? null,
        role: p.roles[0],
        roles: p.roles,
        birthday,
        // customer_2 經驗較多
        logCount: p.lineUserId === "U_dev_customer_2" ? 35 : (p.cert === "OW" ? 5 : p.cert === "AOW" ? 20 : 0),
        haiwangziLogCount: p.lineUserId === "U_dev_customer_2" ? 12 : 0,
        totalSpend: p.lineUserId === "U_dev_customer_2" ? 25000 : 0,
        vipLevel: p.lineUserId === "U_dev_customer_2" ? 2 : 1,
      },
      update: {
        displayName: p.displayName,
        realName: p.realName,
        roles: p.roles,
        role: p.roles[0],
        cert: p.cert ?? null,
        birthday,
      },
    });
  }
  console.log(`  ${DEV_PERSONAS.length} dev personas (users)`);

  // 建 Coach 記錄（綁定到剛建的 user）
  for (const c of coaches) {
    await prisma.coach.upsert({
      where: { id: c.id },
      create: c,
      update: c,
    });
  }
  console.log(`  ${coaches.length} coaches`);

  // ─── DivingTrips (清舊 demo + 灌新的) ──────────────────
  await prisma.divingTrip.deleteMany({ where: { weatherNote: "[demo]" } });

  const trips: Parameters<typeof prisma.divingTrip.create>[0]["data"][] = [];
  // 未來 14 天：週間 1 場（早上）、週末 2 場（早+夜）
  for (let d = 1; d <= 21; d++) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    trips.push({
      date: new Date(addDays(d)),
      startTime: "08:00",
      isNightDive: false,
      isScooter: false,
      diveSiteIds: [["yingge-stone", "longdong-82.8", "shen-ao", "chaojing-park"][d % 4]],
      tankCount: 3,
      capacity: 8,
      coachIds: ["coach-akai"],
      pricing: PRICING_DEFAULT,
      status: "open",
      weatherNote: "[demo]",
    });
    if (isWeekend) {
      trips.push({
        date: new Date(addDays(d)),
        startTime: "17:00",
        isNightDive: true,
        isScooter: false,
        diveSiteIds: ["shen-ao"],
        tankCount: 3,
        capacity: 6,
        coachIds: ["coach-azhi"],
        pricing: PRICING_DEFAULT,
        status: "open",
        weatherNote: "[demo]",
      });
    }
  }
  for (const t of trips) await prisma.divingTrip.create({ data: t });
  console.log(`  ${trips.length} diving trips`);

  // ─── TourPackages ─────────────────────────────────────
  await prisma.tourPackage.deleteMany({ where: { title: { contains: "[demo]" } } });

  const tour1 = await prisma.tourPackage.create({
    data: {
      title: "[demo] 綠島 3 天 2 夜潛水團",
      destination: "green_island",
      dateStart: new Date(addDays(45)),
      dateEnd: new Date(addDays(47)),
      basePrice: 12800,
      deposit: 5000,
      capacity: 8,
      diveSiteIds: ["green-island-da-bai-sha"],
      itinerary: [
        { day: 1, title: "出發 + 大白沙 2 潛", description: "中午抵達綠島，下午 2 潛" },
        { day: 2, title: "鋼鐵礁 + 雞仔礁 3 潛", description: "全日船潛" },
        { day: 3, title: "晨潛 + 返程", description: "上午 1 潛後返台東搭船" },
      ],
      includes: ["民宿 2 晚", "機車 1 台", "船潛 6 支", "餐食"],
      excludes: ["來回交通", "保險"],
      status: "open",
    },
  });
  const tour2 = await prisma.tourPackage.create({
    data: {
      title: "[demo] 蘭嶼 4 天 3 夜深潛之旅",
      destination: "lanyu",
      dateStart: new Date(addDays(60)),
      dateEnd: new Date(addDays(63)),
      basePrice: 18800,
      deposit: 8000,
      capacity: 6,
      diveSiteIds: ["lanyu-bayan-bay"],
      itinerary: [
        { day: 1, title: "出發", description: "搭船至蘭嶼" },
        { day: 2, title: "全島 3 潛", description: "八代灣 + 大象岩 + 軍艦岩" },
        { day: 3, title: "全島 3 潛", description: "東岸 deep dive" },
        { day: 4, title: "晨潛 + 返程", description: "上午 1 潛後返程" },
      ],
      includes: ["民宿 3 晚", "船潛 7 支", "餐食"],
      excludes: ["來回機票/船票"],
      status: "open",
    },
  });
  console.log(`  2 tour packages`);

  // ─── customer_2 歷史訂單 ──────────────────────────────
  // 清舊的（不可能在 reset 後存在，但保險）
  await prisma.booking.deleteMany({ where: { userId: "U_dev_customer_2" } });

  // 1 筆已完成（過去）— 建一個過去的 trip 來綁
  // 把第一個 trip 改成過去日期讓「已完成」邏輯成立
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const completedTrip = await prisma.divingTrip.create({
    data: {
      date: oneWeekAgo,
      startTime: "08:00",
      isNightDive: false,
      isScooter: false,
      diveSiteIds: ["yingge-stone"],
      tankCount: 3,
      capacity: 8,
      coachIds: ["coach-akai"],
      pricing: PRICING_DEFAULT,
      status: "completed",
      weatherNote: "[demo]",
    },
  });
  await prisma.booking.create({
    data: {
      userId: "U_dev_customer_2",
      type: "daily",
      refId: completedTrip.id,
      participants: 1,
      participantDetails: [{ name: "林小華", phone: "0912-345002", cert: "AOW", isSelf: true }],
      totalAmount: 1800,
      depositAmount: 0,
      paidAmount: 1800,
      paymentStatus: "fully_paid",
      paymentMethod: "cash",
      status: "completed",
      agreedToTermsAt: new Date(oneWeekAgo.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // 1 筆未來的 confirmed booking — 抓 demo 第一個未來 open trip
  const futureTrip = await prisma.divingTrip.findFirst({
    where: { weatherNote: "[demo]", status: "open" },
    orderBy: { date: "asc" },
  });
  if (futureTrip) {
    await prisma.booking.create({
      data: {
        userId: "U_dev_customer_2",
        type: "daily",
        refId: futureTrip.id,
        participants: 2,
        participantDetails: [
          { name: "林小華", phone: "0912-345002", cert: "AOW", isSelf: true },
          { name: "陳小明", phone: "0912-345001", cert: "OW" },
        ],
        totalAmount: 3600,
        depositAmount: 0,
        paidAmount: 0,
        paymentStatus: "pending",
        paymentMethod: "cash",
        status: "confirmed",
        agreedToTermsAt: new Date(),
      },
    });
  }

  // 1 筆 tour booking pending
  await prisma.booking.create({
    data: {
      userId: "U_dev_customer_2",
      type: "tour",
      refId: tour1.id,
      participants: 1,
      participantDetails: [{ name: "林小華", phone: "0912-345002", cert: "AOW", isSelf: true }],
      totalAmount: 12800,
      depositAmount: 5000,
      paidAmount: 5000,
      paymentStatus: "deposit_paid",
      paymentMethod: "bank",
      status: "confirmed",
      agreedToTermsAt: new Date(),
    },
  });
  console.log(`  3 bookings for customer_2`);

  // ─── customer_2 禮金歷史 ──────────────────────────────
  await prisma.creditTx.deleteMany({ where: { userId: "U_dev_customer_2" } });
  // 升到 LV2 獎勵
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
  // 生日禮金
  await prisma.creditTx.create({
    data: {
      userId: "U_dev_customer_2",
      amount: 100,
      reason: "birthday",
      note: `${new Date().getFullYear() - 1} 生日禮金`,
      balanceAfter: 300,
    },
  });
  await prisma.user.update({
    where: { lineUserId: "U_dev_customer_2" },
    data: { creditBalance: 300 },
  });
  console.log(`  customer_2 creditBalance = 300`);

  // ─── admin 預存禮金（用來測扣回 / 發放）──────────────
  await prisma.creditTx.deleteMany({ where: { userId: "U_dev_admin" } });
  await prisma.creditTx.create({
    data: {
      userId: "U_dev_admin",
      amount: 5000,
      reason: "admin_adjust",
      note: "Demo 預設禮金",
      balanceAfter: 5000,
    },
  });
  await prisma.user.update({
    where: { lineUserId: "U_dev_admin" },
    data: { creditBalance: 5000 },
  });
  console.log(`  admin creditBalance = 5000`);

  console.log("✅ [demo] seed done");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
