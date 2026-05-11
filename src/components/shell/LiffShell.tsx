"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { useLiff } from "@/lib/liff/LiffProvider";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

interface LiffShellProps {
  title?: string;
  /** 沒有歷史時 fallback 的回退路徑（直接 URL 開進來的情境） */
  backHref?: string;
  midnight?: boolean;
  bottomNav?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function LiffShell({
  title,
  backHref,
  midnight = false,
  bottomNav,
  rightSlot,
  children,
}: LiffShellProps) {
  const liff = useLiff();
  const router = useRouter();

  function handleBack() {
    // 永遠優先用瀏覽器歷史（router.back 對 Next.js App Router 客戶端導航是可靠的）
    // 只有真的「直接打 URL 進來、history 只有 1 筆」才走 backHref fallback。
    //
    // 注意：document.referrer 在 Next.js client navigation 不會更新，
    // 因此我們不用 referrer 作為條件。
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref ?? "/liff/welcome");
  }

  // 只要 backHref 或 title 有定，就顯示返回鈕
  const showBack = backHref !== undefined;

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col",
        midnight && "midnight bg-[var(--color-midnight)]",
      )}
    >
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur">
        {/* 左側：Logo 永遠在這，點按回首頁 */}
        <Link
          href="/liff/welcome"
          aria-label="回首頁"
          className="flex-shrink-0 rounded-full active:scale-95"
        >
          <Wordmark />
        </Link>

        {/* 右側：返回鈕 + 頁面標題 + 動作 slot */}
        <div className="flex items-center gap-2">
          {title ? (
            <h1 className="text-base font-bold tracking-tight">{title}</h1>
          ) : null}
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--muted)] active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          {rightSlot}
        </div>
      </header>

      {liff.mode === "mock" && (
        <div className="bg-[var(--color-gold)] px-4 py-1 text-center text-[11px] font-semibold text-[var(--color-ocean-deep)]">
          🧪 桌面 Mock 模式 — 設 NEXT_PUBLIC_LIFF_MOCK=0 切回真 LIFF
        </div>
      )}
      {liff.error && (
        <div className="bg-[var(--color-coral)]/15 px-4 py-2 text-center text-xs text-[var(--color-coral)]">
          LIFF 錯誤: {liff.error}
        </div>
      )}

      <main className="flex-1 pb-24">{children}</main>

      {bottomNav ? bottomNav : null}

      <footer className="pointer-events-none fixed bottom-1 right-2 z-10 text-[10px] tabular text-[var(--muted-foreground)] opacity-60">
        v{APP_VERSION}
      </footer>
    </div>
  );
}
