"use client";
import { cn } from "@/lib/utils";
import { DiverLoader } from "@/components/ui/DiverLoader";

/**
 * v240：客戶端 LIFF 共用 loading 動畫
 * v801：依老闆指示——所有「資料載入等待畫面」統一為高質感潛水員腳蹼踢水（DiverLoader V2）。
 *   variant / count 參數保留（呼叫點不用改），但一律渲染潛水員：
 *   - "bubbles" / "skeleton"：標準尺寸潛水員
 *   - "ring"（短暫操作）：縮小版潛水員
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
  return (
    <div className={cn("flex items-center justify-center py-12", className)}>
      <DiverLoader label={label} size={size} />
    </div>
  );
}
