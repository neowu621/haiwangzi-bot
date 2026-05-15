/**
 * 海王子潛水會員等級系統
 *
 * 5 個等級，升級條件是 OR（潛次 OR 消費金額 任一達標就升）
 */

export interface VipTier {
  level: 1 | 2 | 3 | 4 | 5;
  key: "shrimp" | "lobster" | "seaTurtle" | "mantaRay" | "whaleShark";
  name: string; // 中文名
  enName: string; // 英文名
  emoji: string;
  /** 達到此等級所需最低潛次 */
  minLogs: number;
  /** 達到此等級所需最低累計消費 (NT$) */
  minSpend: number;
  /** 福利描述（簡短） */
  benefits: string[];
  /** UI 配色 */
  color: string;
}

export const VIP_TIERS: VipTier[] = [
  {
    level: 1,
    key: "shrimp",
    name: "小蝦",
    enName: "Shrimp",
    emoji: "🦐",
    minLogs: 0,
    minSpend: 0,
    benefits: [
      "潛水裝備租借 95 折",
      "基礎會員電子報",
    ],
    color: "#FFB1B1", // pinkish
  },
  {
    level: 2,
    key: "lobster",
    name: "龍蝦",
    enName: "Lobster",
    emoji: "🦞",
    minLogs: 21,
    minSpend: 10_000,
    benefits: [
      "潛水裝備租借 9 折",
      "個人裝備購買專屬折扣",
      "生日當月一般潛水行程 9 折",
    ],
    color: "#FF7B5A", // coral (品牌色)
  },
  {
    level: 3,
    key: "seaTurtle",
    name: "海龜",
    enName: "Sea Turtle",
    emoji: "🐢",
    minLogs: 51,
    minSpend: 30_001,
    benefits: [
      "潛水裝備租借 85 折",
      "免費高氧氣瓶升級（每月限次）",
      "每年免費基礎裝備健檢服務",
    ],
    color: "#00D9CB", // phosphor (品牌色)
  },
  {
    level: 4,
    key: "mantaRay",
    name: "鬼蝠魟",
    enName: "Manta Ray",
    emoji: "🪼",
    minLogs: 101,
    minSpend: 80_001,
    benefits: [
      "潛水裝備租借 8 折",
      "進階潛水課程專屬優惠",
      "熱門海外行程早鳥優先卡位權",
    ],
    color: "#1B3A5C", // ocean (品牌色)
  },
  {
    level: 5,
    key: "whaleShark",
    name: "鯨鯊",
    enName: "Whale Shark",
    emoji: "🦈",
    minLogs: 201,
    minSpend: 150_001,
    benefits: [
      "潛水裝備租借全面免費或 7 折",
      "專屬 VIP 客服對接",
      "海外特殊行程保證名額 + 最高折扣",
      "年底高級 VIP 專屬感恩晚宴",
    ],
    color: "#FFB800", // gold (品牌色)
  },
];

export const VIP_TIER_MAP: Record<number, VipTier> = Object.fromEntries(
  VIP_TIERS.map((t) => [t.level, t]),
);

/**
 * 計算用戶應有等級（OR 條件：潛次 or 消費金額 任一達標就升）
 */
export function computeVipLevel(
  logCount: number,
  totalSpend: number,
): VipTier["level"] {
  // 從最高等級往下檢查
  for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
    const tier = VIP_TIERS[i];
    if (logCount >= tier.minLogs || totalSpend >= tier.minSpend) {
      return tier.level;
    }
  }
  return 1;
}

/**
 * 取得指定 level 的 tier 資訊
 */
export function getVipTier(level: number): VipTier {
  return VIP_TIER_MAP[level] ?? VIP_TIERS[0];
}

/**
 * 距離下一級還差多少（給「升等進度條」用）
 * 回傳：null = 已是最高，或 { nextTier, logsLeft, spendLeft }
 */
export function getNextTierProgress(
  logCount: number,
  totalSpend: number,
): {
  current: VipTier;
  next: VipTier;
  logsLeft: number;
  spendLeft: number;
} | null {
  const currentLevel = computeVipLevel(logCount, totalSpend);
  if (currentLevel === 5) return null;
  const next = VIP_TIER_MAP[currentLevel + 1];
  return {
    current: VIP_TIER_MAP[currentLevel],
    next,
    logsLeft: Math.max(0, next.minLogs - logCount),
    spendLeft: Math.max(0, next.minSpend - totalSpend),
  };
}
