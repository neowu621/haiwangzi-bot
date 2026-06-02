"use client";
import * as React from "react";

/**
 * v260：手寫簽名板
 *
 * 純 canvas + pointer events（不裝外部 lib）。觸控、滑鼠都支援。
 * 設計重點：
 *  - 內部解析度 1600×600（高 DPI），CSS 顯示 800×300 — 簽名線條清晰
 *  - 一律 PNG（透明背景沒意義改白底）
 *  - 「清除重簽」清空 canvas
 *  - 簽名一筆即視為「已簽」（hasInk=true），父元件可決定何時 export dataURL
 *
 * 用法：
 *   <SignaturePad
 *     onChange={(dataUrl, hasInk) => setSig(hasInk ? dataUrl : null)}
 *     height={300}
 *   />
 */
export interface SignaturePadProps {
  /** 顯示寬度（px）。預設 800（會 cap 到父容器寬度）。 */
  width?: number;
  /** 顯示高度（px）。預設 300。 */
  height?: number;
  /** 每次線條變動時觸發。hasInk = canvas 上有筆畫。 */
  onChange?: (dataUrl: string, hasInk: boolean) => void;
  /** 線條顏色，預設黑。 */
  strokeColor?: string;
  /** 線條粗細，預設 2.5（高 DPI 內部會 ×2）。 */
  strokeWidth?: number;
}

export function SignaturePad({
  width = 800,
  height = 300,
  onChange,
  strokeColor = "#000",
  strokeWidth = 2.5,
}: SignaturePadProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const ctxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = React.useRef(false);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = React.useState(false);

  // 內部解析度倍率（高 DPI，存出來的 PNG 線條清晰）
  const SCALE = 2;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 設定內部像素解析度
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(SCALE, SCALE);
    // 白底（PNG 透明對 LINE OA 預覽可能有問題）
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
  }, [width, height, strokeColor, strokeWidth]);

  // 把瀏覽器事件座標換算成 canvas 顯示像素座標
  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // rect 是 CSS px；canvas internal 是 width*SCALE，但 ctx 已經 scale 過
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  function emitChange() {
    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    onChange(canvas.toDataURL("image/png"), hasInk);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = getPoint(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !ctxRef.current || !lastRef.current) return;
    const p = getPoint(e);
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    if (!hasInk) setHasInk(true);
  }

  function onPointerUp() {
    drawingRef.current = false;
    lastRef.current = null;
    emitChange();
  }

  // hasInk 變動時也通知一次（讓父元件知道 hasInk 從 false→true）
  React.useEffect(() => {
    if (onChange && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"), hasInk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInk]);

  function clear() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    setHasInk(false);
  }

  return (
    <div className="space-y-2">
      <div
        className="overflow-hidden rounded-lg border-2 border-dashed bg-white"
        style={{ borderColor: hasInk ? "var(--color-phosphor)" : "var(--border)" }}
      >
        <canvas
          ref={canvasRef}
          className="block w-full touch-none"
          style={{
            // 等比縮放，maxWidth 跟容器走
            aspectRatio: `${width} / ${height}`,
            height: "auto",
            maxHeight: `${height}px`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--muted-foreground)]">
          {hasInk ? "✓ 已簽署" : "請在上方空白處用手指或滑鼠簽名"}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40 disabled:opacity-40"
        >
          清除重簽
        </button>
      </div>
    </div>
  );
}
