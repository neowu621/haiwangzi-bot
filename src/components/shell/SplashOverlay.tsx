"use client";
import { useEffect, useState } from "react";
import { Trident } from "@/components/brand/Logo";

const SPLASH_LAST_SHOWN_KEY = "hwz_splash_last_shown";

interface SiteConfigForSplash {
  splashEnabled: boolean;
  splashDurationMs: number;
  splashCooldownMs: number;
  heroTitle: string;
  heroSubtitle: string;
  footerSloganZh: string;
}

/**
 * 直接進入 deep link 時顯示品牌 splash，然後讓 children 出現。
 *
 * Cooldown：用 localStorage 記錄上次顯示時間，超過 `cooldownMs` 才會再顯示
 * （之前是 sessionStorage 只一次；改成 1 小時一次比較合理）。
 *
 * 使用：在 LiffShell wrap children；welcome 頁不會觸發（welcome 本身就是 splash 風格）
 */
export function SplashOverlay() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cfg, setCfg] = useState<SiteConfigForSplash>({
    splashEnabled: true,
    splashDurationMs: 3000,
    splashCooldownMs: 3600000,
    heroTitle: "東 北 角 海 王 子",
    heroSubtitle: "NEIL OCEAN PRINCE",
    footerSloganZh: "探索海洋 · 安全潛水 · 專業教學",
  });

  // 抓 SiteConfig（fail-open，抓不到用預設）
  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((d) => setCfg((c) => ({ ...c, ...d })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!cfg.splashEnabled) return;

    // welcome 頁本身不顯示 splash，但要標記為已看過
    const isWelcome =
      window.location.pathname.endsWith("/liff/welcome") ||
      window.location.pathname === "/liff" ||
      window.location.pathname === "/";
    if (isWelcome) {
      localStorage.setItem(SPLASH_LAST_SHOWN_KEY, String(Date.now()));
      return;
    }

    // Cooldown 檢查
    const lastShown = Number(
      localStorage.getItem(SPLASH_LAST_SHOWN_KEY) ?? "0",
    );
    if (lastShown && Date.now() - lastShown < cfg.splashCooldownMs) return;

    setVisible(true);
    localStorage.setItem(SPLASH_LAST_SHOWN_KEY, String(Date.now()));

    // 進度條動畫
    const tick = 50; // ms
    const total = cfg.splashDurationMs;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += tick;
      setProgress(Math.min(100, (elapsed / total) * 100));
    }, tick);

    const t = setTimeout(() => {
      clearInterval(interval);
      setVisible(false);
    }, cfg.splashDurationMs);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [cfg]);

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
          {cfg.heroTitle}
        </h1>
        <div className="mt-1.5 text-[11px] tracking-[0.4em] text-[var(--color-phosphor)]">
          {cfg.heroSubtitle}
        </div>
        <div className="mt-3 text-[10px] tracking-[0.3em] text-white/60">
          {cfg.footerSloganZh}
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
