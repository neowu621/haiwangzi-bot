import * as React from "react";

// v802：螃蟹 loading 動畫 V11（老闆提供，取代 v800 潛水員）。
//   圖為透明背景（無白色區塊）→ 珍珠色/白色/深色底都不突兀。
//   大螯動畫＝同一張圖 tight clip overlay 小角度開合（不含眼睛、base 不挖空）。
//   元件名沿用 DiverLoader（介面不變），全站呼叫點自動換裝。
//   樣式在 globals.css（.hwzc-*）；支援 prefers-reduced-motion。

const CRAB_SRC = "/assets/reference-crab-clean-full.webp";

export interface DiverLoaderProps {
  /** 主標，如「上傳中，請稍候」。尾端的 …/... 會自動改為動態點點。 */
  label?: string;
  /** 副標，如「依你的網路速度，可能需要幾秒」。 */
  subLabel?: string;
  /** 顯示尺寸基準 px（inline 模式），預設 120 → 螃蟹寬約 170px。 */
  size?: number;
  /** true = 全螢幕遮罩 + 白色卡片（上傳時擋操作、避免重複送出）。 */
  overlay?: boolean;
  className?: string;
}

/** 尾端 …/... 交給動態點點呈現（避免「載入中…...」疊字） */
function splitDots(label?: string): { text: string; dots: boolean } {
  if (!label) return { text: "", dots: false };
  const stripped = label.replace(/[….]+$/u, "");
  return { text: stripped, dots: stripped.length !== label.length || /中$/.test(stripped) };
}

function CrabArt({ width }: { width: number }) {
  return (
    <div className="hwzc-art" style={{ width }} role="img" aria-label="處理中">
      <span className="hwzc-shadow" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzc-layer hwzc-base" src={CRAB_SRC} alt="" width={289} height={204} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzc-layer hwzc-claw hwzc-left" src={CRAB_SRC} alt="" aria-hidden width={289} height={204} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzc-layer hwzc-claw hwzc-right" src={CRAB_SRC} alt="" aria-hidden width={289} height={204} draggable={false} />
    </div>
  );
}

export function DiverLoader({
  label,
  subLabel,
  size = 120,
  overlay = false,
  className,
}: DiverLoaderProps) {
  const { text, dots } = splitDots(label);

  if (overlay) {
    // 全螢幕：深海遮罩 + 白色卡片（老闆 V11 設計：螃蟹 + 標題點點 + 副標）
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-5"
        style={{ background: "rgba(4, 26, 43, 0.62)", backdropFilter: "blur(2px)" }}
      >
        <div
          role="status"
          aria-live="polite"
          className="text-center"
          style={{
            width: "min(88vw, 330px)",
            padding: "26px 22px",
            borderRadius: 32,
            background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(247,251,255,0.94))",
            boxShadow: "0 28px 80px rgba(0,0,0,0.34), 0 12px 32px rgba(32,137,190,0.12)",
            border: "1px solid rgba(255,255,255,0.72)",
          }}
        >
          <CrabArt width={210} />
          {text && (
            <div style={{ marginTop: 8, fontSize: 24, lineHeight: 1.2, letterSpacing: "-0.04em", fontWeight: 800, color: "#17324a" }}>
              {text}
              {dots && <span className="hwzc-dots" aria-hidden />}
            </div>
          )}
          {subLabel && (
            <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.5, color: "#758290" }}>{subLabel}</p>
          )}
        </div>
      </div>
    );
  }

  // inline：小螃蟹 + 文字（透明底圖，襯任何頁面底色都不突兀）
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "flex flex-col items-center justify-center gap-1 text-center" +
        (className ? " " + className : "")
      }
    >
      <CrabArt width={Math.min(224, Math.round(size * 1.45))} />
      {text && (
        <div className="text-sm font-bold" style={{ color: "#17324a" }}>
          {text}
          {dots && <span className="hwzc-dots" aria-hidden />}
        </div>
      )}
      {subLabel && <div className="text-xs text-[var(--muted-foreground)]">{subLabel}</div>}
    </div>
  );
}

export default DiverLoader;
