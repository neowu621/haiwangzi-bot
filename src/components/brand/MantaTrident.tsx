import * as React from "react";

// v490：海王子品牌標誌 — 鬼蝠魟三叉戟（向量）。
//   白色圖案，可放在任何底色上。配色規則：
//     深色頁 → 白圖案透明底（badge=false, tone="white"）
//     淺色頁 / app icon → 深海藍圓角方塊 + 白圖案（badge=true）
export const BRAND_NAVY = "#0D1B2A";

/** 純圖案（無底）— viewBox 64×64，可設色 */
export function MantaTridentMark({
  size = 48,
  color = "#ffffff",
  title = "海王子標誌",
}: {
  size?: number;
  color?: string;
  title?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <g fill={color}>
        {/* 三叉戟中尖 */}
        <path d="M32 20.5 L30.6 8 L32 4.5 L33.4 8 Z" />
        {/* 兩支頭鰭（角） */}
        <path d="M30.2 22 C28.7 16 27.2 11 27.6 7.6 C29.2 10 30.5 14.5 31.4 20.5 Z" />
        <path d="M33.8 22 C35.3 16 36.8 11 36.4 7.6 C34.8 10 33.5 14.5 32.6 20.5 Z" />
        {/* 三叉戟左右側尖 */}
        <path d="M28.4 20.5 L26.8 12.5 L28.8 15 Z" />
        <path d="M35.6 20.5 L37.2 12.5 L35.2 15 Z" />
        {/* 鬼蝠魟雙翼 + 身體 + 尾 */}
        <path d="M32 20.5 C27.4 20.5 21.3 23.6 14.8 29.2 C10.2 32.8 7.2 32.3 5.2 29.2 C6.7 34.3 11.3 40.4 21 42.4 C25.1 43.3 27.3 46 29.1 51.1 C30.3 54.7 31.2 57.6 32 60 C32.8 57.6 33.7 54.7 34.9 51.1 C36.7 46 38.9 43.3 43 42.4 C52.7 40.4 57.3 34.3 58.8 29.2 C56.8 32.3 53.8 32.8 49.2 29.2 C42.7 23.6 36.6 20.5 32 20.5 Z" />
      </g>
    </svg>
  );
}

/**
 * 品牌標記容器。
 *  - badge=true（預設）：深海藍圓角方塊 + 白圖案（淺色頁 / app icon 用）
 *  - badge=false：只有圖案（透明），給深色背景用；可用 tone 設圖案色
 */
export function BrandMark({
  size = 44,
  badge = true,
  tone = "white",
  radius,
  className,
  style,
}: {
  size?: number;
  badge?: boolean;
  tone?: "white" | "navy";
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const emblem = tone === "navy" ? BRAND_NAVY : "#ffffff";
  if (!badge) {
    return (
      <span className={className} style={{ display: "inline-flex", ...style }}>
        <MantaTridentMark size={size} color={emblem} />
      </span>
    );
  }
  const box = size;
  const inner = Math.round(size * 0.72);
  return (
    <span
      className={className}
      style={{
        width: box,
        height: box,
        borderRadius: radius ?? Math.round(box * 0.26),
        background: BRAND_NAVY,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        ...style,
      }}
    >
      <MantaTridentMark size={inner} color="#ffffff" />
    </span>
  );
}
