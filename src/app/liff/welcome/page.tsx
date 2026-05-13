"use client";
import Link from "next/link";
import {
  CalendarDays,
  Plane,
  ListChecks,
  User2,
  Camera,
  Users,
  ChevronRight,
} from "lucide-react";
import { Trident } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useLiff } from "@/lib/liff/LiffProvider";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";

const FB_PAGE = "https://www.facebook.com/wang.cheng.ru.350053";

type CardConfig = {
  href: string;
  external?: boolean;
  label: string;
  enLabel: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** 卡片漸層 (背景的深海主題 + 強調色) */
  gradient: string;
  iconColor: string;
};

const CARDS: CardConfig[] = [
  {
    href: "/liff/calendar",
    label: "日潛水",
    enLabel: "FUN DIVE",
    desc: "今日出航",
    Icon: CalendarDays,
    gradient:
      "linear-gradient(135deg, #0A2342 0%, #1B3A5C 60%, #00D9CB22 100%)",
    iconColor: "#00D9CB",
  },
  {
    href: "/liff/tour",
    label: "潛水團",
    enLabel: "DIVE TRIP",
    desc: "國內外行程",
    Icon: Plane,
    gradient:
      "linear-gradient(135deg, #0F1B2D 0%, #1B3A5C 60%, #FF7B5A22 100%)",
    iconColor: "#FF7B5A",
  },
  {
    href: "/liff/media",
    label: "最新動態",
    enLabel: "DIVE MEDIA",
    desc: "影像日誌",
    Icon: Camera,
    gradient:
      "linear-gradient(135deg, #0A2342 0%, #1B3A5C 60%, #FFB80022 100%)",
    iconColor: "#FFB800",
  },
  {
    href: "/liff/my",
    label: "我的預約",
    enLabel: "BOOKING",
    desc: "課程紀錄",
    Icon: ListChecks,
    gradient:
      "linear-gradient(135deg, #0F1B2D 0%, #0A2342 60%, #00D9CB22 100%)",
    iconColor: "#00D9CB",
  },
  {
    href: FB_PAGE,
    external: true,
    label: "FB 社群",
    enLabel: "COMMUNITY",
    desc: "Facebook 粉絲頁",
    Icon: Users,
    gradient:
      "linear-gradient(135deg, #0A2342 0%, #1B3A5C 60%, #1877F222 100%)",
    iconColor: "#1877F2",
  },
  {
    href: "/liff/profile",
    label: "個人中心",
    enLabel: "MY PROFILE",
    desc: "潛水紀錄",
    Icon: User2,
    gradient:
      "linear-gradient(135deg, #0F1B2D 0%, #1B3A5C 60%, #FF7B5A22 100%)",
    iconColor: "#FF7B5A",
  },
];

export default function WelcomePage() {
  const liff = useLiff();

  return (
    <LiffShell bottomNav={<BottomNav />} midnight>
      {/* 全頁深海背景 */}
      <div className="min-h-[calc(100dvh-3.5rem)] bg-[var(--color-midnight)] pb-24">
        {/* Hero — 三叉戟 + 品牌 */}
        <section
          className="relative overflow-hidden px-5 pt-8 pb-6 text-white"
          style={{
            background:
              "linear-gradient(180deg, #0A2342 0%, #1B3A5C 50%, #0F1B2D 100%)",
          }}
        >
          {/* 海底光斑裝飾 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 30%, #00D9CB55, transparent 40%), radial-gradient(circle at 80% 70%, #FF7B5A33, transparent 50%)",
            }}
          />
          <div className="relative flex flex-col items-center text-center">
            <Trident size={56} color="#00D9CB" />
            <h1 className="mt-3 text-2xl font-bold tracking-[0.15em]">
              東 北 角 海 王 子
            </h1>
            <div className="mt-1 text-[10px] tracking-[0.35em] text-[var(--color-phosphor)]">
              NEIL OCEAN PRINCE
            </div>
            {liff.profile?.displayName && (
              <div className="mt-3 text-xs opacity-70">
                嗨，{liff.profile.displayName}
              </div>
            )}
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
        </section>

        {/* 6 卡 grid */}
        <section className="grid grid-cols-2 gap-3 px-5 pt-5">
          {CARDS.map((c) => {
            const inner = (
              <div
                className="relative h-full overflow-hidden rounded-2xl border border-white/10 p-4 text-white shadow-lg backdrop-blur transition-transform active:scale-[0.97]"
                style={{ background: c.gradient }}
              >
                {/* 海底光斑 */}
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
                  style={{ backgroundColor: c.iconColor }}
                />
                <div className="relative">
                  <div
                    className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/5 backdrop-blur"
                    style={{ color: c.iconColor }}
                  >
                    <c.Icon className="h-6 w-6" />
                  </div>
                  <div className="text-base font-bold leading-tight">
                    {c.label}
                  </div>
                  <div
                    className="text-[10px] font-semibold tracking-[0.2em]"
                    style={{ color: c.iconColor }}
                  >
                    {c.enLabel}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="text-xs opacity-70">{c.desc}</span>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </div>
                </div>
              </div>
            );
            return c.external ? (
              <a
                key={c.href}
                href={c.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <Link key={c.href} href={c.href}>
                {inner}
              </Link>
            );
          })}
        </section>

        {/* 海況卡 — 保留但融入暗色主題 */}
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
              <div className="mt-1 text-xl font-bold">明日海況沉穩 · 適合下水</div>
              <p className="mt-2 text-sm opacity-80">
                北風 3 級｜浪高 1m｜水溫 24°C｜能見度 8-12m
              </p>
              <Link href="/liff/calendar">
                <Button
                  variant="default"
                  size="sm"
                  className="mt-4 bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)] hover:bg-[var(--color-phosphor-soft)]"
                >
                  查看明日場次
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* footer slogan */}
        <section className="mt-6 px-5 pb-2 text-center">
          <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-[var(--color-phosphor)] opacity-70">
            探索海洋 · 安全潛水 · 專業教學
          </div>
          <div className="mt-1 text-[9px] tracking-[0.2em] text-white/40">
            EXPLORE THE OCEAN
          </div>
        </section>
      </div>
    </LiffShell>
  );
}
