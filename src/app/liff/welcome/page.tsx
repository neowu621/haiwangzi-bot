"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Plane,
  ListChecks,
  User2,
  Camera,
  Users,
  Anchor,
  Sparkles,
  Compass,
  Waves,
  ChevronRight,
} from "lucide-react";
import { Trident } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useLiff } from "@/lib/liff/LiffProvider";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import {
  DEFAULT_SITE_CONFIG,
  type SiteConfig,
  type CardAccent,
  type CardIconName,
} from "@/lib/site-config";

// icon 名稱 → lucide component
const ICON_MAP: Record<CardIconName, React.ComponentType<{ className?: string }>> = {
  CalendarDays,
  Plane,
  ListChecks,
  User2,
  Camera,
  Users,
  Anchor,
  Sparkles,
  Compass,
  Waves,
};

// accent → 漸層 + icon 色
const ACCENT_STYLES: Record<
  CardAccent,
  { gradient: string; iconColor: string }
> = {
  phosphor: {
    gradient: "linear-gradient(135deg, #0A2342 0%, #1B3A5C 60%, #00D9CB22 100%)",
    iconColor: "#00D9CB",
  },
  coral: {
    gradient: "linear-gradient(135deg, #0F1B2D 0%, #1B3A5C 60%, #FF7B5A22 100%)",
    iconColor: "#FF7B5A",
  },
  gold: {
    gradient: "linear-gradient(135deg, #0A2342 0%, #1B3A5C 60%, #FFB80022 100%)",
    iconColor: "#FFB800",
  },
  ocean: {
    gradient: "linear-gradient(135deg, #0F1B2D 0%, #1B3A5C 60%, #1877F222 100%)",
    iconColor: "#1877F2",
  },
};

export default function WelcomePage() {
  const liff = useLiff();
  const router = useRouter();
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [emailMissing, setEmailMissing] = useState(false);

  useEffect(() => {
    fetch("/api/site-config")
      .then((r) => r.json())
      .then((d) => setCfg((c) => ({ ...c, ...d })))
      .catch(() => {});
  }, []);

  // Dev mode：第一次進站還沒選身分 → 自動跳到 /dev-login
  useEffect(() => {
    if (liff.mode !== "mock") return;
    if (typeof window === "undefined") return;
    const picked = localStorage.getItem("devPersona");
    if (!picked && !process.env.NEXT_PUBLIC_MOCK_USER_ID) {
      router.push("/dev-login");
    }
  }, [liff.mode, router]);

  // 首次登入：拉 /api/me 看有沒有 email；沒有就提示去填
  useEffect(() => {
    if (!liff.ready || !liff.loggedIn) return;
    liff
      .fetchWithAuth<{ email: string | null }>("/api/me")
      .then((u) => {
        if (!u.email) setEmailMissing(true);
      })
      .catch(() => {});
  }, [liff, liff.ready, liff.loggedIn]);

  const cards = (cfg.cards ?? DEFAULT_SITE_CONFIG.cards)
    .filter((c) => c.enabled)
    .sort((a, b) => a.order - b.order);

  return (
    <LiffShell bottomNav={<BottomNav />} midnight>
      <div className="min-h-[calc(100dvh-3.5rem)] bg-[var(--color-midnight)] pb-24">
        {/* Hero — Logo 左 + 標題右（橫向，省 Y 軸） */}
        <section
          className="relative overflow-hidden px-5 pt-5 pb-5 text-white"
          style={{
            background:
              "linear-gradient(180deg, #0A2342 0%, #1B3A5C 50%, #0F1B2D 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, #00D9CB55, transparent 40%), radial-gradient(circle at 80% 70%, #FF7B5A33, transparent 50%)",
            }}
          />
          <div className="relative flex items-center gap-3">
            <Trident size={48} color="#00D9CB" />
            <div className="flex flex-1 flex-col">
              <h1 className="text-lg font-bold tracking-[0.15em] leading-tight">
                {cfg.heroTitle}
              </h1>
              <div className="mt-0.5 text-[9px] tracking-[0.35em] text-[var(--color-phosphor)]">
                {cfg.heroSubtitle}
              </div>
              {liff.profile?.displayName && (
                <div className="mt-1 text-[11px] opacity-70">
                  {cfg.heroGreeting}，{liff.profile.displayName}
                </div>
              )}
            </div>
          </div>

          {!liff.loggedIn && liff.mode === "real" && liff.ready && (
            <div className="relative mt-5 rounded-lg bg-white/10 p-3 backdrop-blur">
              <p className="text-sm">尚未登入 LINE，部分功能需登入後使用</p>
              <Button
                onClick={liff.login}
                variant="ocean"
                className="mt-3 w-full"
              >
                使用 LINE 登入
              </Button>
            </div>
          )}

          {/* 首次登入提示填 email */}
          {emailMissing && (
            <Link href="/liff/profile">
              <div className="relative mt-4 rounded-lg border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/15 p-3 backdrop-blur transition-colors hover:bg-[var(--color-gold)]/25">
                <div className="flex items-center gap-2">
                  <div className="text-xl">✉️</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">請填寫 Email</div>
                    <div className="text-[11px] opacity-80">
                      用來收預約確認 / 行前通知 / 發票
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 opacity-70" />
                </div>
              </div>
            </Link>
          )}
        </section>

        {/* Cards grid (動態) */}
        <section className="grid grid-cols-2 gap-3 px-5 pt-5">
          {cards.map((c) => {
            const Icon = ICON_MAP[c.icon] ?? Anchor;
            const style = ACCENT_STYLES[c.accent] ?? ACCENT_STYLES.phosphor;
            const inner = (
              <div
                className="relative h-full overflow-hidden rounded-2xl border border-white/10 p-3 text-white shadow-lg backdrop-blur transition-transform active:scale-[0.97]"
                style={{ background: style.gradient }}
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
                  style={{ backgroundColor: style.iconColor }}
                />
                <div className="relative flex items-center gap-2.5">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur"
                    style={{ color: style.iconColor }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold leading-tight">
                      {c.label}
                    </div>
                    {c.enLabel && (
                      <div
                        className="text-[9px] font-semibold tracking-[0.18em]"
                        style={{ color: style.iconColor }}
                      >
                        {c.enLabel}
                      </div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[11px] opacity-70 truncate">
                        {c.desc}
                      </span>
                      <ChevronRight className="h-3 w-3 opacity-50 flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            );
            // External link → /liff/go?to=URL (splash + redirect)
            if (c.external) {
              const goUrl = `/liff/go?to=${encodeURIComponent(c.href)}`;
              return (
                <Link key={c.id} href={goUrl}>
                  {inner}
                </Link>
              );
            }
            return (
              <Link key={c.id} href={c.href}>
                {inner}
              </Link>
            );
          })}
        </section>

        {/* 海況卡 (動態) */}
        {cfg.seaEnabled && (
          <section className="mt-5 px-5">
            <div
              className="overflow-hidden rounded-2xl border border-white/10 text-white"
              style={{
                background:
                  "linear-gradient(135deg, #0F1B2D 0%, #0A2342 100%)",
              }}
            >
              <div className="p-5">
                <div className="text-[10px] tracking-[0.25em] text-[var(--color-phosphor)]">
                  TODAY · 海況
                </div>
                <div className="mt-1 text-xl font-bold">{cfg.seaTitle}</div>
                <p className="mt-2 text-sm opacity-80">{cfg.seaInfo}</p>
                {cfg.seaCtaHref && cfg.seaCtaLabel && (
                  <Link href={cfg.seaCtaHref}>
                    <Button
                      variant="default"
                      size="sm"
                      className="mt-4 bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)] hover:bg-[var(--color-phosphor-soft)]"
                    >
                      {cfg.seaCtaLabel}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Footer slogan */}
        <section className="mt-6 px-5 pb-2 text-center">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-[var(--color-phosphor)] opacity-70">
            {cfg.footerSloganZh}
          </div>
          <div className="mt-1 text-[9px] tracking-[0.2em] text-white/40">
            {cfg.footerSloganEn}
          </div>
        </section>
      </div>
    </LiffShell>
  );
}
