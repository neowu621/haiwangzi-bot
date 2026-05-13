"use client";
import { use, useEffect } from "react";

/**
 * /liff/go?to=URL
 *
 * 簡單 redirect 頁 — 一掛載就立刻跳到目標。
 * 之前嘗試做 3 秒 splash 但有 hydration race，先回到純 redirect 確保穩定。
 * 未來如要 splash 行為，請在 SplashOverlay 修正後重新啟用。
 */
export default function GoPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const params = use(searchParams);
  const to = params.to ?? "/liff/welcome";

  useEffect(() => {
    window.location.href = to;
  }, [to]);

  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-[var(--muted-foreground)]">
      跳轉中...
    </div>
  );
}
