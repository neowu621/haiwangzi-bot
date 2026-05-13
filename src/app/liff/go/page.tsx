"use client";
import { use, useEffect, useState } from "react";
import { Trident } from "@/components/brand/Logo";

/**
 * /liff/go?to=URL
 * 顯示 splash 約 3 秒後跳到 to URL（可內部或外部）。
 * 主要給「外部連結 (FB / IG / YT)」用 — 內部連結不需要走這裡。
 */
export default function GoPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const params = use(searchParams);
  const to = params.to ?? "/liff/welcome";
  const [progress, setProgress] = useState(0);
  const [cfg, setCfg] = useState({
    splashDurationMs: 3000,
    heroTitle: "東 北 角 海 王 子",
    heroSubtitle: "NEIL OCEAN PRINCE",
    footerSloganZh: "探索海洋 · 安全潛水 · 專業教學",
  });

  // 抓 SiteConfig
  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((d) =>
        setCfg((c) => ({
          ...c,
          splashDurationMs: d.splashDurationMs ?? 3000,
          heroTitle: d.heroTitle ?? c.heroTitle,
          heroSubtitle: d.heroSubtitle ?? c.heroSubtitle,
          footerSloganZh: d.footerSloganZh ?? c.footerSloganZh,
        })),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const duration = cfg.splashDurationMs;
    const tick = 50;
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += tick;
      setProgress(Math.min(100, (elapsed / duration) * 100));
    }, tick);

    const t = setTimeout(() => {
      clearInterval(interval);
      // 外部連結用 window.location；內部用 router.replace 也可
      window.location.href = to;
    }, duration);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [cfg.splashDurationMs, to]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center text-white"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, #1B3A5C 0%, #0A2342 50%, #0F1B2D 100%)",
      }}
    >
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
        <div className="mt-10 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-[var(--color-phosphor)] transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-[9px] tracking-[0.3em] text-white/40">
          REDIRECTING
        </div>
      </div>
    </div>
  );
}
