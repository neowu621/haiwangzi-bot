/**
 * SiteConfig — 首頁 / 全站設定的型別 + 預設值
 *
 * Admin 可在 /liff/admin/site-config 改：
 *   - Hero (title / subtitle / greeting)
 *   - 6 個 quick-link 卡片
 *   - 海況卡 (今日 / 浪高 / 集合等)
 *   - Footer slogan (中/英)
 *   - Splash (enabled / duration / cooldown)
 *
 * Welcome 頁讀 `/api/site-config` 套用；DB 沒值就用下方預設。
 */

export const ACCENT_PALETTE = [
  "phosphor",
  "coral",
  "gold",
  "ocean",
] as const;

export type CardAccent = (typeof ACCENT_PALETTE)[number];

/** 可用的 icon (對應 lucide-react)。Welcome 頁靜態 map */
export const ICON_NAMES = [
  "CalendarDays",
  "Plane",
  "ListChecks",
  "User2",
  "Camera",
  "Users",
  "Anchor",
  "Sparkles",
  "Compass",
  "Waves",
] as const;

export type CardIconName = (typeof ICON_NAMES)[number];

export interface SiteCard {
  id: string; // 唯一識別（給 React key 用）
  label: string;
  enLabel: string;
  desc: string;
  href: string; // 內部如 /liff/calendar 或 外部 https://...
  external: boolean;
  icon: CardIconName;
  accent: CardAccent;
  enabled: boolean;
  order: number;
}

export interface SiteConfig {
  heroTitle: string;
  heroSubtitle: string;
  heroGreeting: string;

  cards: SiteCard[];

  seaEnabled: boolean;
  seaTitle: string;
  seaInfo: string;
  seaCtaLabel: string | null;
  seaCtaHref: string | null;

  footerSloganZh: string;
  footerSloganEn: string;

  splashEnabled: boolean;
  splashDurationMs: number;
  splashCooldownMs: number;
}

export const DEFAULT_CARDS: SiteCard[] = [
  {
    id: "calendar",
    label: "日潛水",
    enLabel: "FUN DIVE",
    desc: "今日出航",
    href: "/liff/calendar",
    external: false,
    icon: "CalendarDays",
    accent: "phosphor",
    enabled: true,
    order: 1,
  },
  {
    id: "tour",
    label: "潛水團",
    enLabel: "DIVE TRIP",
    desc: "國內外行程",
    href: "/liff/tour",
    external: false,
    icon: "Plane",
    accent: "coral",
    enabled: true,
    order: 2,
  },
  {
    id: "media",
    label: "最新動態",
    enLabel: "DIVE MEDIA",
    desc: "影像日誌",
    href: "/liff/media",
    external: false,
    icon: "Camera",
    accent: "gold",
    enabled: true,
    order: 3,
  },
  {
    id: "my",
    label: "我的預約",
    enLabel: "BOOKING",
    desc: "課程紀錄",
    href: "/liff/my",
    external: false,
    icon: "ListChecks",
    accent: "phosphor",
    enabled: true,
    order: 4,
  },
  {
    id: "fb",
    label: "FB 社群",
    enLabel: "COMMUNITY",
    desc: "Facebook 粉絲頁",
    href: "https://www.facebook.com/wang.cheng.ru.350053",
    external: true,
    icon: "Users",
    accent: "coral",
    enabled: true,
    order: 5,
  },
  {
    id: "profile",
    label: "個人中心",
    enLabel: "MY PROFILE",
    desc: "潛水紀錄",
    href: "/liff/profile",
    external: false,
    icon: "User2",
    accent: "ocean",
    enabled: true,
    order: 6,
  },
];

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  heroTitle: "東 北 角 海 王 子",
  heroSubtitle: "NEIL OCEAN PRINCE",
  heroGreeting: "嗨",
  cards: DEFAULT_CARDS,
  seaEnabled: true,
  seaTitle: "明日海況沉穩 · 適合下水",
  seaInfo: "北風 3 級｜浪高 1m｜水溫 24°C｜能見度 8-12m",
  seaCtaLabel: "查看明日場次",
  seaCtaHref: "/liff/calendar",
  footerSloganZh: "探索海洋 · 安全潛水 · 專業教學",
  footerSloganEn: "EXPLORE THE OCEAN",
  splashEnabled: true,
  splashDurationMs: 3000,
  splashCooldownMs: 3600000, // 1 hour
};
