// Design tokens — Deep & Quiet (對應 brand.jsx)
// 海王子潛水團 LIFF UI 視覺系統

export const colors = {
  // Primary
  deepOcean: "#0A2342",
  midnight: "#0F1B2D",
  oceanSurface: "#1B3A5C",

  // Accent
  phosphor: "#00D9CB",
  coral: "#FF7B5A",
  gold: "#FFB800",

  // Neutral
  white: "#FFFFFF",
  bg: "#F9FAFB", // page background
  surface: "#FFFFFF", // card background
  surface2: "#F3F4F6", // pill / chip background
  line: "#E5E7EB",
  ink: "#0F172A",
  ink2: "#64748B",
  ink3: "#94A3B8",

  // Semantic
  success: "#10B981",
  successBg: "#ECFDF5",
  successFg: "#047857",
  warning: "#F59E0B",
  warningBg: "#FFFBEB",
  warningFg: "#B45309",
  danger: "#EF4444",
  dangerBg: "#FEF2F2",
  dangerFg: "#B91C1C",
  info: "#3B82F6",
} as const;

export const font = {
  zh: '"Noto Sans TC", system-ui, sans-serif',
  num: '"Inter", "SF Pro Display", system-ui, sans-serif',
} as const;

// Status → badge mapping
export const badgeTone = {
  open: { bg: colors.successBg, fg: colors.successFg, dot: colors.success, label: "開放預約" },
  partial: { bg: colors.warningBg, fg: colors.warningFg, dot: colors.warning, label: "部分額滿" },
  full: { bg: colors.dangerBg, fg: colors.dangerFg, dot: colors.danger, label: "已滿" },
  confirmed: { bg: colors.deepOcean, fg: colors.phosphor, dot: colors.phosphor, label: "已確認" },
  pending: { bg: colors.warningBg, fg: colors.warningFg, dot: colors.warning, label: "待確認" },
  cancelled: { bg: colors.surface2, fg: colors.ink2, dot: colors.ink3, label: "已取消" },
  completed: { bg: colors.successBg, fg: colors.successFg, dot: colors.success, label: "已完成" },
} as const;

// CSS shadow / radius helpers
export const card: React.CSSProperties = {
  background: colors.surface,
  borderRadius: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 0 0 1px rgba(15,23,42,0.03)",
};

export const pageStyle: React.CSSProperties = {
  fontFamily: font.zh,
  background: colors.bg,
  color: colors.ink,
  minHeight: "100vh",
};
