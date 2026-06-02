"use client";
import { cn } from "@/lib/utils";

/**
 * v240：客戶端 LIFF 共用 loading 動畫
 * 避免「載入中...」純文字讓客戶以為當機
 *
 * 三種變體：
 *   - "bubbles"  ：海洋氣泡上升（首頁、列表頁載入）
 *   - "ring"     ：海洋色旋轉環（短暫操作 / 表單載入）
 *   - "skeleton" ：卡片骨架（已知會出現多筆卡片的列表）
 *
 * Usage:
 *   <LiffLoading label="載入訂單中..." />
 *   <LiffLoading variant="ring" label="處理中..." />
 *   <LiffLoading variant="skeleton" count={3} />
 */
export function LiffLoading({
  variant = "bubbles",
  label,
  count = 3,
  className,
}: {
  variant?: "bubbles" | "ring" | "skeleton";
  label?: string;
  count?: number;
  className?: string;
}) {
  if (variant === "skeleton") {
    return (
      <div className={cn("space-y-3 px-4 pt-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--color-phosphor)]/15" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-[var(--color-phosphor)]/15" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--color-phosphor)]/10" />
              </div>
            </div>
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-[var(--color-phosphor)]/10" />
          </div>
        ))}
        {label && (
          <div className="pt-2 text-center text-xs text-[var(--muted-foreground)]">
            {label}
          </div>
        )}
      </div>
    );
  }

  if (variant === "ring") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-12",
          className,
        )}
      >
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-[var(--color-phosphor)]/20" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[var(--color-phosphor)]" />
        </div>
        {label && (
          <div className="text-sm text-[var(--muted-foreground)]">{label}</div>
        )}
      </div>
    );
  }

  // bubbles (default)
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 py-16",
        className,
      )}
    >
      <div className="relative h-16 w-16">
        {/* 三顆氣泡上升動畫 */}
        <span
          className="absolute left-1 bottom-0 h-3 w-3 rounded-full bg-[var(--color-phosphor)] opacity-70"
          style={{
            animation: "liff-bubble 1.4s ease-in infinite",
            animationDelay: "0s",
          }}
        />
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-0 h-4 w-4 rounded-full bg-[var(--color-phosphor)] opacity-80"
          style={{
            animation: "liff-bubble 1.4s ease-in infinite",
            animationDelay: "0.25s",
          }}
        />
        <span
          className="absolute right-1 bottom-0 h-3 w-3 rounded-full bg-[var(--color-phosphor)] opacity-70"
          style={{
            animation: "liff-bubble 1.4s ease-in infinite",
            animationDelay: "0.5s",
          }}
        />
      </div>
      {label && (
        <div className="text-sm text-[var(--muted-foreground)]">{label}</div>
      )}
      <style jsx>{`
        @keyframes liff-bubble {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          20% {
            opacity: 0.9;
          }
          100% {
            transform: translateY(-44px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
