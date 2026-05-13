"use client";
import Link from "next/link";
import {
  CalendarDays,
  Plane,
  ListChecks,
  User2,
  Camera,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";

const FB_PAGE = "https://www.facebook.com/wang.cheng.ru.350053";

type QuickLink = {
  href: string;
  external?: boolean;
  label: string;
  enLabel: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "phosphor" | "coral" | "gold" | "ocean";
};

const QUICKLINKS: QuickLink[] = [
  {
    href: "/liff/calendar",
    label: "日潛水",
    enLabel: "FUN DIVE",
    desc: "今日出航",
    Icon: CalendarDays,
    accent: "phosphor",
  },
  {
    href: "/liff/tour",
    label: "潛水團",
    enLabel: "DIVE TRIP",
    desc: "國內外行程",
    Icon: Plane,
    accent: "coral",
  },
  {
    href: "/liff/media",
    label: "最新動態",
    enLabel: "DIVE MEDIA",
    desc: "影像日誌",
    Icon: Camera,
    accent: "gold",
  },
  {
    href: "/liff/my",
    label: "我的預約",
    enLabel: "BOOKING",
    desc: "課程紀錄",
    Icon: ListChecks,
    accent: "phosphor",
  },
  {
    href: FB_PAGE,
    external: true,
    label: "FB 社群",
    enLabel: "COMMUNITY",
    desc: "Facebook 粉絲頁",
    Icon: Users,
    accent: "coral",
  },
  {
    href: "/liff/profile",
    label: "個人中心",
    enLabel: "MY PROFILE",
    desc: "潛水紀錄",
    Icon: User2,
    accent: "ocean",
  },
];

const accentBg: Record<string, string> = {
  phosphor: "bg-[var(--color-phosphor)]/15 text-[var(--color-ocean-deep)]",
  coral: "bg-[var(--color-coral)]/15 text-[var(--color-coral)]",
  gold: "bg-[var(--color-gold)]/20 text-[var(--color-ocean-deep)]",
  ocean: "bg-[var(--color-ocean-deep)]/10 text-[var(--color-ocean-deep)]",
};

export default function WelcomePage() {
  const liff = useLiff();

  return (
    <LiffShell bottomNav={<BottomNav />}>
      <section className="px-5 pt-6">
        <div className="flex items-center gap-4">
          <Logo size={72} />
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight">
              {liff.profile?.displayName ? `嗨，${liff.profile.displayName}` : "歡迎潛入"}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              東北角海王子潛水團 · 安全．專業．陪你看見海
            </p>
          </div>
        </div>

        {!liff.loggedIn && liff.mode === "real" && liff.ready && (
          <Card className="mt-5 p-4">
            <p className="text-sm">尚未登入 LINE，部分功能需登入後使用</p>
            <Button onClick={liff.login} variant="ocean" className="mt-3 w-full">
              使用 LINE 登入
            </Button>
          </Card>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 px-5 pt-6">
        {QUICKLINKS.map((q) => {
          const inner = (
            <Card className="h-full p-4 transition-transform active:scale-[0.97]">
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${accentBg[q.accent]}`}
              >
                <q.Icon className="h-5 w-5" />
              </div>
              <div className="text-base font-bold leading-tight">{q.label}</div>
              <div className="text-[9px] font-semibold tracking-[0.15em] text-[var(--muted-foreground)]">
                {q.enLabel}
              </div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {q.desc}
              </div>
            </Card>
          );
          return q.external ? (
            <a
              key={q.href}
              href={q.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {inner}
            </a>
          ) : (
            <Link key={q.href} href={q.href}>
              {inner}
            </Link>
          );
        })}
      </section>

      <section className="mt-6 px-5">
        <Card className="overflow-hidden bg-[var(--color-ocean-deep)] text-white">
          <div className="p-5">
            <div className="text-xs tracking-[0.2em] opacity-70">TODAY · 海況</div>
            <div className="mt-1 text-xl font-bold">明日海況沉穩 · 適合下水</div>
            <p className="mt-2 text-sm opacity-85">
              北風 3 級｜浪高 1m｜水溫 24°C｜能見度 8-12m
            </p>
            <Link href="/liff/calendar">
              <Button variant="default" size="sm" className="mt-4">
                查看明日場次
              </Button>
            </Link>
          </div>
        </Card>
      </section>
    </LiffShell>
  );
}
