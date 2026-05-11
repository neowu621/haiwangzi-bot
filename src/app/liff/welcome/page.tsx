"use client";
import Link from "next/link";
import { CalendarDays, Plane, ListChecks, User2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLiff } from "@/lib/liff/LiffProvider";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";

const QUICKLINKS = [
  { href: "/liff/calendar", label: "日潛預約", desc: "東北角｜當日現場收費", Icon: CalendarDays, accent: "phosphor" },
  { href: "/liff/tour", label: "旅遊潛水", desc: "蘭嶼·綠島·墾丁多日團", Icon: Plane, accent: "coral" },
  { href: "/liff/my", label: "我的預約", desc: "即將前往 / 已完成", Icon: ListChecks, accent: "gold" },
  { href: "/liff/profile", label: "個人資料", desc: "證照·緊急聯絡人", Icon: User2, accent: "ocean" },
] as const;

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
        {QUICKLINKS.map(({ href, label, desc, Icon, accent }) => (
          <Link key={href} href={href}>
            <Card className="h-full p-4 transition-transform active:scale-[0.97]">
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${accentBg[accent]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-base font-bold">{label}</div>
              <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                {desc}
              </div>
            </Card>
          </Link>
        ))}
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
