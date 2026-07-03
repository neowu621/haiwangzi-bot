import * as React from "react";

// v781：潛水員踢水 loading 動畫（純 CSS + inline SVG，無外部資源、~1KB）。
//   用途：上傳（付款證明/簽名/照片）與大量讀取資料庫的頁面，給明確「處理中」回饋。
//   keyframes 在 globals.css（.hwz-diver-*），此元件只畫 SVG + 掛 class。
//   支援 prefers-reduced-motion（globals.css 內關閉動畫）。

export interface DiverLoaderProps {
  /** 主標，如「上傳中，請稍候…」。省略則只顯示動畫（inline 用）。 */
  label?: string;
  /** 副標，如「依你的網路速度，可能需要幾秒」。 */
  subLabel?: string;
  /** SVG 寬度 px，預設 120。inline 小尺寸可傳 28~40。 */
  size?: number;
  /** true = 蓋整頁半透明遮罩（上傳時擋操作、避免重複送出）。 */
  overlay?: boolean;
  className?: string;
}

function DiverSvg({ size = 120 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 170 110"
      width={size}
      height={Math.round((size * 110) / 170)}
      role="img"
      aria-label="處理中"
    >
      <title>潛水員踢水中</title>
      {/* 泡泡 */}
      <circle className="hwz-diver-bub hwz-diver-b1" cx="140" cy="48" r="3.2" fill="#7dd3fc" />
      <circle className="hwz-diver-bub hwz-diver-b2" cx="147" cy="48" r="2.2" fill="#bae6fd" />
      <circle className="hwz-diver-bub hwz-diver-b3" cx="134" cy="48" r="2.6" fill="#7dd3fc" />
      {/* 會游動的整體 */}
      <g className="hwz-diver-body">
        {/* 氣瓶 */}
        <rect x="52" y="40" width="11" height="24" rx="5.5" fill="#0e7490" />
        <rect x="55" y="36" width="5" height="6" rx="2" fill="#155e75" />
        {/* 腿 + 蛙鞋（交替踢動）*/}
        <g className="hwz-diver-leg hwz-diver-legA">
          <rect x="30" y="55" width="26" height="6" rx="3" fill="#155e75" />
          <path d="M32 58 L10 50 L10 70 Z" fill="#22d3ee" />
        </g>
        <g className="hwz-diver-leg hwz-diver-legB">
          <rect x="30" y="59" width="26" height="6" rx="3" fill="#0f766e" />
          <path d="M32 62 L10 56 L10 76 Z" fill="#06b6d4" />
        </g>
        {/* 身體 */}
        <ellipse cx="92" cy="58" rx="42" ry="15" fill="#0e7490" />
        {/* 手臂前伸 */}
        <rect x="108" y="50" width="30" height="6" rx="3" fill="#155e75" transform="rotate(-10 108 53)" />
        {/* 頭 */}
        <circle cx="132" cy="52" r="14" fill="#0891b2" />
        {/* 面鏡 */}
        <rect x="134" y="46" width="13" height="10" rx="3.5" fill="#a5f3fc" />
        {/* 呼吸器 */}
        <circle cx="146" cy="60" r="2.6" fill="#155e75" />
      </g>
    </svg>
  );
}

export function DiverLoader({
  label,
  subLabel,
  size = 120,
  overlay = false,
  className,
}: DiverLoaderProps) {
  const inner = (
    <div
      role="status"
      aria-live="polite"
      className={
        "flex flex-col items-center justify-center gap-1.5 text-center" +
        (className ? " " + className : "")
      }
    >
      <DiverSvg size={size} />
      {label && <div className="text-sm font-bold text-[#0e7490]">{label}</div>}
      {subLabel && <div className="text-xs text-[var(--muted-foreground)]">{subLabel}</div>}
    </div>
  );

  if (!overlay) return inner;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(2px)" }}
    >
      {inner}
    </div>
  );
}

export default DiverLoader;
