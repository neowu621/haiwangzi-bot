// Phase 1 開發期假資料
// 直接對應 diving_bot_kit 範例:鶯歌石/深奧/綠島團/蘭嶼團
// 跑法: npx tsx prisma/seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PRICING_DEFAULT = {
  baseTrip: 1500,
  extraTank: 500,
  nightDive: 500,
  scooterRental: 1500,
};

async function main() {
  console.log("🌱 seeding...");

  // ─── DiveSites ───────────────────────────────────────
  const sites = [
    {
      id: "longdong-82.8",
      name: "龍洞 82.8",
      region: "northeast" as const,
      description: "東北角熱門潛點,軟珊瑚豐富,適合進階潛水員。",
      difficulty: "medium" as const,
      maxDepth: 25,
      features: ["軟珊瑚", "海蛞蝓", "雀鯛"],
    },
    {
      id: "yingge-stone",
      name: "鶯歌石",
      region: "northeast" as const,
      description: "東北角入門潛點,地形變化少,適合 OW 新手。",
      difficulty: "easy" as const,
      maxDepth: 18,
      features: ["軟珊瑚", "豆丁海馬"],
    },
    {
      id: "shen-ao",
      name: "深奧",
      region: "northeast" as const,
      description: "可以夜潛的潛點,夜行海葵跟章魚很多。",
      difficulty: "easy" as const,
      maxDepth: 20,
      features: ["夜潛", "章魚", "海葵"],
    },
    {
      id: "chaojing-park",
      name: "潮境公園",
      region: "northeast" as const,
      description: "基隆水下保護區,魚群密度東北角第一。",
      difficulty: "easy" as const,
      maxDepth: 22,
      features: ["魚群", "保護區"],
    },
    {
      id: "green-island-da-bai-sha",
      name: "綠島大白沙",
      region: "green_island" as const,
      description: "綠島經典點,水推訓練熱門地。",
      difficulty: "medium" as const,
      maxDepth: 30,
      features: ["水推", "鯊魚點", "海狼"],
    },
    {
      id: "lanyu-bayan-bay",
      name: "蘭嶼八代灣",
      region: "lanyu" as const,
      description: "蘭嶼東岸代表潛點。",
      difficulty: "hard" as const,
      maxDepth: 35,
      features: ["珊瑚礁", "海龜", "軸孔珊瑚"],
    },
  ];
  for (const s of sites) {
    await prisma.diveSite.upsert({
      where: { id: s.id },
      create: s,
      update: s,
    });
  }
  console.log(`  ${sites.length} dive sites`);

  // ─── Coaches ──────────────────────────────────────────
  const coaches = [
    { id: "coach-azhi", realName: "阿志", cert: "Instructor" as const, specialty: ["夜潛", "水推"] },
    { id: "coach-xiaolin", realName: "小林", cert: "DM" as const, specialty: ["教學", "拍照"] },
    { id: "coach-haiwangzi", realName: "海王子老闆", cert: "CourseDirector" as const, specialty: ["技術潛水", "船潛"] },
  ];
  for (const c of coaches) {
    await prisma.coach.upsert({
      where: { id: c.id },
      create: c,
      update: c,
    });
  }
  console.log(`  ${coaches.length} coaches`);

  // ─── DivingTrips (近期 4 場 + 未來 1 個月) ──────────
  // 清掉舊的 seed trips 避免重複
  await prisma.divingTrip.deleteMany({
    where: { weatherNote: "[seed]" },
  });

  const today = new Date();
  const addDays = (d: number) => {
    const x = new Date(today);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  const trips: Parameters<typeof prisma.divingTrip.create>[0]["data"][] = [
    {
      date: new Date(addDays(2)),
      startTime: "08:00",
      isNightDive: false,
      isScooter: false,
      diveSiteIds: ["yingge-stone"],
      tankCount: 3,
      capacity: 8,
      coachIds: ["coach-azhi"],
      pricing: PRICING_DEFAULT,
      status: "open",
      weatherNote: "[seed]",
    },
    {
      date: new Date(addDays(2)),
      startTime: "16:00",
      isNightDive: true,
      isScooter: false,
      diveSiteIds: ["shen-ao"],
      tankCount: 3,
      capacity: 6,
      coachIds: ["coach-azhi", "coach-xiaolin"],
      pricing: PRICING_DEFAULT,
      status: "open",
      weatherNote: "[seed]",
    },
    {
      date: new Date(addDays(3)),
      startTime: "08:00",
      isNightDive: false,
      isScooter: false,
      diveSiteIds: ["shen-ao"],
      tankCount: 3,
      capacity: 8,
      coachIds: ["coach-azhi"],
      pricing: PRICING_DEFAULT,
      status: "open",
      weatherNote: "[seed]",
    },
    {
      date: new Date(addDays(3)),
      startTime: "16:30",
      isNightDive: true,
      isScooter: false,
      diveSiteIds: ["shen-ao"],
      tankCount: 3,
      capacity: 6,
      coachIds: ["coach-xiaolin"],
      pricing: PRICING_DEFAULT,
      status: "open",
      weatherNote: "[seed]",
    },
    // 未來 2 週每週一上午
    ...[7, 14, 21].map(
      (offset): Parameters<typeof prisma.divingTrip.create>[0]["data"] => ({
        date: new Date(addDays(offset)),
        startTime: "08:00",
        isNightDive: false,
        isScooter: false,
        diveSiteIds: ["longdong-82.8"],
        tankCount: 3,
        capacity: 8,
        coachIds: ["coach-azhi"],
        pricing: PRICING_DEFAULT,
        status: "open",
        weatherNote: "[seed]",
      }),
    ),
  ];

  for (const t of trips) {
    await prisma.divingTrip.create({ data: t });
  }
  console.log(`  ${trips.length} diving trips`);

  // ─── TourPackages ─────────────────────────────────────
  await prisma.tourPackage.deleteMany({
    where: { title: { contains: "[seed]" } },
  });

  const tours: Parameters<typeof prisma.tourPackage.create>[0]["data"][] = [
    {
      title: "綠島三天兩夜水推團 (平日) [seed]",
      destination: "green_island",
      dateStart: new Date("2026-09-29"),
      dateEnd: new Date("2026-10-01"),
      diveSiteIds: ["green-island-da-bai-sha"],
      basePrice: 14500,
      deposit: 7000,
      depositDeadline: new Date("2026-08-29"),
      finalDeadline: new Date("2026-08-29"),
      capacity: 10,
      includes: ["船潛 6 隻", "民宿 2 晚", "早餐 2 份", "保險"],
      excludes: ["午晚餐", "個人裝備", "額外加購水推"],
      addons: [
        { id: "scooter-self", name: "自備水推", priceDelta: -3500, type: "discount" },
        { id: "double-room", name: "雙人房 (每晚每人 +300)", priceDelta: 600, type: "upgrade" },
        { id: "single-room", name: "單人房 (每晚 +1200)", priceDelta: 2400, type: "upgrade" },
      ],
      itinerary: [
        { day: 1, events: [{ time: "06:00", type: "transport", description: "台東富岡漁港搭船" }, { time: "13:00", type: "dive", description: "大白沙水推" }] },
        { day: 2, events: [{ time: "08:00", type: "dive", description: "綠島經典潛點 ×2" }, { time: "19:00", type: "free", description: "夜遊朝日溫泉" }] },
        { day: 3, events: [{ time: "09:00", type: "dive", description: "最後一潛" }, { time: "15:00", type: "transport", description: "搭船返回富岡" }] },
      ],
      images: [],
      status: "open",
    },
    {
      title: "蘭嶼四天三夜潛旅 (中秋) [seed]",
      destination: "lanyu",
      dateStart: new Date("2026-09-25"),
      dateEnd: new Date("2026-09-28"),
      diveSiteIds: ["lanyu-bayan-bay"],
      basePrice: 17000,
      deposit: 8000,
      depositDeadline: new Date("2026-08-25"),
      finalDeadline: new Date("2026-08-25"),
      capacity: 10,
      includes: ["船潛 8 隻", "民宿 3 晚", "早餐 3 份", "機車 1 台", "保險"],
      excludes: ["往返機票/船票", "午晚餐", "個人裝備"],
      addons: [
        { id: "single-room", name: "單人房升等 (每晚 +1200)", priceDelta: 3600, type: "upgrade" },
        { id: "extra-dive", name: "加 1 隻氣瓶", priceDelta: 1500, type: "upgrade" },
      ],
      itinerary: [
        { day: 1, events: [{ time: "10:00", type: "transport", description: "後壁湖搭船赴蘭嶼" }, { time: "15:00", type: "free", description: "民宿 check-in" }] },
        { day: 2, events: [{ time: "08:00", type: "dive", description: "八代灣 + 母雞岩" }] },
        { day: 3, events: [{ time: "08:00", type: "dive", description: "玉女岩 + 軍艦岩" }] },
        { day: 4, events: [{ time: "10:00", type: "dive", description: "最後一潛" }, { time: "16:00", type: "transport", description: "搭船返台" }] },
      ],
      images: [],
      status: "open",
    },
  ];

  for (const t of tours) {
    await prisma.tourPackage.create({ data: t });
  }
  console.log(`  ${tours.length} tour packages`);

  console.log("✅ seed done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
