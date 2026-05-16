/**
 * 海王子潛水會員等級系統
 *
 * 5 個等級，升級條件是 OR（潛次 OR 消費金額 任一達標就升）
 */

export interface VipTier {
  level: number; // 1-10 (admin 可調)
  key: string; // 唯一識別字串，admin 可隨意命名
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
 * @param tiers 自訂等級表（admin 設的），不傳就用內建預設
 */
export function computeVipLevel(
  logCount: number,
  totalSpend: number,
  tiers: VipTier[] = VIP_TIERS,
): number {
  if (tiers.length === 0) tiers = VIP_TIERS;
  // 從最高等級往下檢查
  const sorted = [...tiers].sort((a, b) => b.level - a.level);
  for (const tier of sorted) {
    if (logCount >= tier.minLogs || totalSpend >= tier.minSpend) {
      return tier.level;
    }
  }
  return sorted[sorted.length - 1]?.level ?? 1;
}

/**
 * 取得指定 level 的 tier 資訊
 */
export function getVipTier(level: number, tiers: VipTier[] = VIP_TIERS): VipTier {
  const map = Object.fromEntries(tiers.map((t) => [t.level, t]));
  return map[level] ?? tiers[0] ?? VIP_TIERS[0];
}

/**
 * 距離下一級還差多少
 */
export function getNextTierProgress(
  logCount: number,
  totalSpend: number,
  tiers: VipTier[] = VIP_TIERS,
): {
  current: VipTier;
  next: VipTier;
  logsLeft: number;
  spendLeft: number;
} | null {
  if (tiers.length === 0) tiers = VIP_TIERS;
  const sorted = [...tiers].sort((a, b) => a.level - b.level);
  const currentLevel = computeVipLevel(logCount, totalSpend, sorted);
  const maxLevel = sorted[sorted.length - 1].level;
  if (currentLevel >= maxLevel) return null;
  const current = sorted.find((t) => t.level === currentLevel) ?? sorted[0];
  const next = sorted.find((t) => t.level > currentLevel) ?? sorted[sorted.length - 1];
  return {
    current,
    next,
    logsLeft: Math.max(0, next.minLogs - logCount),
    spendLeft: Math.max(0, next.minSpend - totalSpend),
  };
}

/**
 * 從 DB SiteConfig.vipTiers (Json) 拿，回 fallback 內建預設
 */
export function normalizeVipTiers(raw: unknown): VipTier[] {
  if (!Array.isArray(raw) || raw.length === 0) return VIP_TIERS;
  try {
    return (raw as VipTier[]).map((t) => ({
      level: Number(t.level) as VipTier["level"],
      key: t.key,
      name: t.name,
      enName: t.enName,
      emoji: t.emoji,
      minLogs: Math.max(0, Number(t.minLogs)),
      minSpend: Math.max(0, Number(t.minSpend)),
      benefits: Array.isArray(t.benefits) ? t.benefits : [],
      color: t.color,
    }));
  } catch {
    return VIP_TIERS;
  }
}
