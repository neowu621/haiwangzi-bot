"use client";
import { useEffect, useState } from "react";
import { Trident } from "@/components/brand/Logo";

/**
 * 直接進入 deep link 時顯示 3 秒品牌 splash，然後讓 children 出現。
 * 之後 session 內導航不會再顯示（用 sessionStorage 標記）。
 *
 * 使用：在 LiffShell wrap children；welcome 頁不會觸發（welcome 本身就是 splash 風格）
 */
export function SplashOverlay({
  enabled = true,
  duration = 3000,
}: {
  enabled?: boolean;
  duration?: number;
}) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // welcome 頁本身不顯示 splash
    const isWelcome =
      window.location.pathname.endsWith("/liff/welcome") ||
      window.location.pathname === "/liff" ||
      window.location.pathname === "/";
    if (isWelcome) {
      // 標記已看過，後續不再顯示
      sessionStorage.setItem("hwz_splash_shown", "1");
      return;
    }

    const seen = sessionStorage.getItem("hwz_splash_shown");
    if (seen) return;

    setVisible(true);
    sessionStorage.setItem("hwz_splash_shown", "1");

    // 進度條動畫
    const tick = 50; // ms
    const total = duration;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += tick;
      setProgress(Math.min(100, (elapsed / total) * 100));
    }, tick);

    const t = setTimeout(() => {
      clearInterval(interval);
      setVisible(false);
    }, duration);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [enabled, duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-white animate-in fade-in duration-300"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, #1B3A5C 0%, #0A2342 50%, #0F1B2D 100%)",
      }}
    >
      {/* 海底光斑裝飾 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #00D9CB66, transparent 40%), radial-gradient(circle at 80% 70%, #FF7B5A33, transparent 50%)",
        }}
      />

      <div className="relative flex flex-col items-center px-8 text-center">
        <Trident size={80} color="#00D9CB" />
        <h1 className="mt-5 text-2xl font-bold tracking-[0.2em]">
          東 北 角 海 王 子
        </h1>
        <div className="mt-1.5 text-[11px] tracking-[0.4em] text-[var(--color-phosphor)]">
          NEIL OCEAN PRINCE
        </div>
        <div className="mt-3 text-[10px] tracking-[0.3em] text-white/60">
          探索海洋 · 安全潛水 · 專業教學
        </div>

        {/* Progress bar */}
        <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--color-phosphor)] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-[9px] tracking-[0.3em] text-white/40">
          LOADING
        </div>
      </div>
    </div>
  );
}
