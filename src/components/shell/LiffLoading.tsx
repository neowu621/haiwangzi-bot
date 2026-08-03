"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DiverLoader } from "@/components/ui/DiverLoader";

/**
 * v240：客戶端 LIFF 共用 loading 動畫
 * v801：依老闆指示——所有「資料載入等待畫面」統一為高質感潛水員腳蹼踢水（DiverLoader V2）。
 *   variant / count 參數保留（呼叫點不用改），但一律渲染潛水員：
 *   - "bubbles" / "skeleton"：標準尺寸潛水員
 *   - "ring"（短暫操作）：縮小版潛水員
 * v1004：載入超過 8 秒 → 顯示「重新載入」按鈕（效果＝關 App 重開，一鍵完成），
 *   並附「關閉 LINE 重開」最後備案文字。所有用 LiffLoading 的頁面一次生效。
 *
 * Usage:
 *   <LiffLoading label="載入訂單中..." />
 *   <LiffLoading variant="ring" label="處理中..." />
 */
export function LiffLoading({
  variant = "bubbles",
  label,
  count: _count = 3,
  className,
}: {
  variant?: "bubbles" | "ring" | "skeleton";
  label?: string;
  count?: number;
  className?: string;
}) {
  void _count; // v801：保留參數相容性（skeleton 已統一為潛水員）
  const size = variant === "ring" ? 78 : 110;
  // v1004：連續顯示超過 8 秒 → 亮出重新載入引導
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12", className)}>
      <DiverLoader label={label} size={size} />
      {slow && (
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <div className="text-[13px] font-semibold text-[var(--color-ocean-deep)]">
            載入比平常久了…
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[var(--color-phosphor)] px-6 py-2.5 text-sm font-bold text-[var(--color-ocean-deep)]"
          >
            🔄 重新載入
          </button>
          <div className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
            若重新載入後仍無法使用，請關閉 LINE 後重新開啟
          </div>
        </div>
      )}
    </div>
  );
}
