/**
 * 海王子潛水會員等級系統
 *
 * 5 個等級，升級條件：**僅依「海王子累積潛水次數」(haiwangziLogCount)**
 *
 * 註：minSpend 欄位保留於 schema/data 中（向下相容），
 * 但升等邏輯（computeVipLevel）已不再使用累計消費。
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
  /** 福利描述（簡短，也作為客戶端 FAQ 內容） */
  benefits: string[];
  /** 升級獎勵抵用金 (NT$)。會員首次達到此 LV 時自動發放，每個 LV 僅一次 */
  upgradeCredit: number;
  /** v388：裝備租借折扣 %（此級會員下單裝備時自動套用）。100=原價、90=9折、0/未設=不折 */
  gearDiscountPct?: number;
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
    upgradeCredit: 50, // 註冊抵用金（新會員首次加入時自動發放）
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
    upgradeCredit: 200,
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
    upgradeCredit: 500,
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
    upgradeCredit: 1000,
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
    upgradeCredit: 3000,
    color: "#FFB800", // gold (品牌色)
  },
];

/**
 * 計算用戶應有等級 — 僅依潛水次數（海王子累積）
 * 累計消費（totalSpend）參數保留以維持 callsite 向下相容，但不會影響結果
 * @param tiers 自訂等級表（admin 設的），不傳就用內建預設
 */
export function computeVipLevel(
  logCount: number,
  _totalSpend: number,
  tiers: VipTier[] = VIP_TIERS,
): number {
  if (tiers.length === 0) tiers = VIP_TIERS;
  // 從最高等級往下檢查
  const sorted = [...tiers].sort((a, b) => b.level - a.level);
  for (const tier of sorted) {
    if (logCount >= tier.minLogs) {
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
      upgradeCredit: Math.max(0, Number(t.upgradeCredit ?? 0)),
      // v388：裝備折扣 %（缺省 100 = 不折）；夾在 0~100
      gearDiscountPct: Math.min(100, Math.max(0, Number(t.gearDiscountPct ?? 100))),
      color: t.color,
    }));
  } catch {
    return VIP_TIERS;
  }
}

/** v388：取某 VIP 等級的裝備折扣 %（100=不折）。用 normalize 後的 tiers */
export function getGearDiscountPct(level: number, tiers: VipTier[] = VIP_TIERS): number {
  const t = tiers.find((x) => x.level === level);
  const p = t?.gearDiscountPct;
  return typeof p === "number" && p > 0 && p <= 100 ? p : 100;
}
