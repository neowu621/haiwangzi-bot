import * as React from "react";

// v492：海王子品牌標誌 — 鬼蝠魟三叉戟（老闆提供的細節圖檔，10 色可依背景挑）。
//   圖檔為橫向圓角方塊（自帶底色），以 <img> 渲染、依高度等比縮放。
export const BRAND_NAVY = "#0D1B2A";

export type BrandVariant =
  | "deepblue" | "teal" | "ocean" | "obsidian" | "white"
  | "slate" | "aqua" | "gold" | "seagreen" | "twilight";

const SRC: Record<BrandVariant, string> = {
  // v745：主色改用 256px WebP（6KB，原 1024px PNG 629KB）— 全站 Logo 只顯示 24–60px，無需大圖。
  //   resize fit:inside 等比縮放、不裁切（不會切到鬼蝠魟尾巴，遵守 v541 註記）。
  deepblue: "/brand-icons/hwz-deepblue-256.webp",
  teal: "/brand-icons/hwz-teal.png",
  ocean: "/brand-icons/hwz-ocean.png",
  obsidian: "/brand-icons/hwz-obsidian.png",
  white: "/brand-icons/hwz-white.png",
  slate: "/brand-icons/hwz-slate.png",
  aqua: "/brand-icons/hwz-aqua.png",
  gold: "/brand-icons/hwz-gold.png",
  seagreen: "/brand-icons/hwz-seagreen.png",
  twilight: "/brand-icons/hwz-twilight.png",
};

/** 主品牌色（深海藍）；想換色把這裡改成別的 variant */
export const BRAND_DEFAULT: BrandVariant = "deepblue";
export const brandIconSrc = (v: BrandVariant = BRAND_DEFAULT) => SRC[v];

/** 純圖案 — 依高度等比縮放（圖自帶底色與圓角） */
export function MantaTridentMark({
  size = 48,
  variant = BRAND_DEFAULT,
  title = "海王子標誌",
  style,
  // 舊介面相容（color 對 raster 無效，忽略）
}: {
  size?: number;
  variant?: BrandVariant;
  title?: string;
  style?: React.CSSProperties;
  color?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SRC[variant]} alt={title} style={{ height: size, width: "auto", display: "block", ...style }} />
  );
}

/** 品牌標記（與 MantaTridentMark 相同，保留語意名給 Logo / 各 shell 用） */
export function BrandMark({
  size = 44,
  variant = BRAND_DEFAULT,
  radius,
  className,
  style,
  // 舊介面相容（badge/tone 忽略）
}: {
  size?: number;
  variant?: BrandVariant;
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
  badge?: boolean;
  tone?: "white" | "navy";
}) {
  return (
    <span className={className} style={{ display: "inline-flex", ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SRC[variant]} alt="海王子" style={{ height: size, width: "auto", display: "block", borderRadius: radius }} />
    </span>
  );
}
