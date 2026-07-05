import * as React from "react";

// v800：潛水員 loading 動畫 V2 —— 老闆提供的高質感潛水員圖（webp 16KB）+ 腳蹼踢水。
//   腳蹼動畫不是重畫：用同一張圖做 clipped overlay 小角度旋轉（3–6 度），本體不變形。
//   用途不變：上傳（付款證明/簽名/照片）與大量讀取頁面的「處理中」回饋。
//   樣式在 globals.css（.hwzd2-*）；支援 prefers-reduced-motion（自動停用動畫）。

const DIVER_SRC = "/assets/ocean-prince-premium-diver.webp";

export interface DiverLoaderProps {
  /** 主標，如「上傳中，請稍候…」。省略則只顯示動畫（inline 用）。 */
  label?: string;
  /** 副標，如「依你的網路速度，可能需要幾秒」。 */
  subLabel?: string;
  /** 潛水員顯示寬度基準 px（inline 模式用），預設 120 → 實際寬約 200px。 */
  size?: number;
  /** true = 全螢幕遮罩 + 白色卡片（上傳時擋操作、避免重複送出）。 */
  overlay?: boolean;
  className?: string;
}

function DiverV2({ width }: { width: number }) {
  return (
    <div className="hwzd2-wrap" style={{ width }} role="img" aria-label="處理中">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzd2-img" src={DIVER_SRC} alt="" width={725} height={600} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzd2-fin hwzd2-ft" src={DIVER_SRC} alt="" aria-hidden width={725} height={600} draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hwzd2-fin hwzd2-fb" src={DIVER_SRC} alt="" aria-hidden width={725} height={600} draggable={false} />
      <span className="hwzd2-rip" aria-hidden />
      <span className="hwzd2-bub hwzd2-b1" aria-hidden />
      <span className="hwzd2-bub hwzd2-b2" aria-hidden />
      <span className="hwzd2-bub hwzd2-b3" aria-hidden />
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
  if (overlay) {
    // 全螢幕：深海遮罩 + 白色卡片（老闆 V2 設計：卡片 + 大潛水員 + 進度條）
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
            width: "min(90vw, 340px)",
            padding: "26px 22px 22px",
            borderRadius: 30,
            background: "linear-gradient(180deg, rgba(255,255,255,0.99), rgba(247,251,255,0.96))",
            boxShadow: "0 28px 80px rgba(0,0,0,0.34), 0 12px 32px rgba(32,137,190,0.14)",
            border: "1px solid rgba(255,255,255,0.72)",
          }}
        >
          <p style={{ margin: "0 0 6px", color: "rgba(117,130,144,0.78)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Northeast Coast Ocean Prince
          </p>
          <DiverV2 width={230} />
          {label && (
            <div style={{ marginTop: 4, fontSize: 22, lineHeight: 1.2, letterSpacing: "-0.04em", fontWeight: 800, color: "#17324a" }}>
              {label}
            </div>
          )}
          {subLabel && (
            <p style={{ margin: "8px 0 18px", fontSize: 13.5, lineHeight: 1.5, color: "#758290" }}>{subLabel}</p>
          )}
          <div className="hwzd2-prog" aria-hidden />
        </div>
      </div>
    );
  }

  // inline：小潛水員 + 文字（LIFF 內容載入等）
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "flex flex-col items-center justify-center gap-1.5 text-center" +
        (className ? " " + className : "")
      }
    >
      <DiverV2 width={Math.min(260, Math.round(size * 1.7))} />
      {label && <div className="text-sm font-bold" style={{ color: "#17324a" }}>{label}</div>}
      {subLabel && <div className="text-xs text-[var(--muted-foreground)]">{subLabel}</div>}
    </div>
  );
}

export default DiverLoader;
