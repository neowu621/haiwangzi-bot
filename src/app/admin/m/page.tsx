"use client";
// 手機簡版後台首頁（/admin/m）— MVP v1
//   6 張卡，只顯 badge 數字，純 <Link> 導向現有完整頁。
//   資料走 cachedFetch 打輕量 /api/admin/stats/lite（先顯快取值 → 背景更新），避免一次撈大表。
import { useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import {
  Moon,
  Wallet,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Megaphone,
  ChevronRight,
} from "lucide-react";

const LITE_URL = "/api/admin/stats/lite";

interface LiteStats {
  tonight: { proofs: number; attendance: number };
  pendingProofs: number;
  todayTrips: { count: number; people: number };
  tomorrowTrips: { count: number; people: number };
  pendingWishes: number;
}

export default function MobileAdminHome() {
  const { ready } = useAdminAuth();
  // 先用快取值（0 秒顯示），背景再更新
  const [stats, setStats] = useState<LiteStats | undefined>(() => getCached<LiteStats>(LITE_URL));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    cachedFetch<LiteStats>(LITE_URL, { force: true })
      .then((d) => {
        if (alive) {
          setStats(d);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  const tonightBadge =
    (stats?.tonight.proofs ?? 0) + (stats?.tonight.attendance ?? 0);

  const cards: Array<{
    href: string;
    icon: typeof Moon;
    emoji: string;
    title: string;
    badge: number | undefined;
    sub: string | undefined;
    accent: boolean;
  }> = [
    {
      href: "/admin/tonight",
      icon: Moon,
      emoji: "🌙",
      title: "老闆結帳",
      badge: stats ? tonightBadge : undefined,
      sub: stats
        ? `待確認匯款 ${stats.tonight.proofs}・待到場 ${stats.tonight.attendance}`
        : undefined,
      accent: tonightBadge > 0,
    },
    {
      href: "/admin/bookings?status=awaiting_verify",
      icon: Wallet,
      emoji: "💰",
      title: "待審付款",
      badge: stats?.pendingProofs,
      sub: undefined,
      accent: (stats?.pendingProofs ?? 0) > 0,
    },
    {
      href: "/admin/trips",
      icon: CalendarDays,
      emoji: "📅",
      title: "今明場次",
      badge: stats ? stats.todayTrips.count + stats.tomorrowTrips.count : undefined,
      sub: stats
        ? `今 ${stats.todayTrips.count} 場/${stats.todayTrips.people} 人・明 ${stats.tomorrowTrips.count} 場/${stats.tomorrowTrips.people} 人`
        : undefined,
      accent: false,
    },
    {
      href: "/admin/bookings",
      icon: ClipboardList,
      emoji: "📋",
      title: "訂單快查",
      badge: undefined,
      sub: "查看所有訂單",
      accent: false,
    },
    {
      href: "/admin/dive-wishes",
      icon: MessageSquare,
      emoji: "📝",
      title: "待回覆願望單",
      badge: stats?.pendingWishes,
      sub: undefined,
      accent: (stats?.pendingWishes ?? 0) > 0,
    },
    {
      href: "/admin/broadcast",
      icon: Megaphone,
      emoji: "📣",
      title: "快速群發",
      badge: undefined,
      sub: "發送通知給會員",
      accent: false,
    },
  ];

  return (
    <MobileAdminShell>
      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="flex flex-col rounded-2xl border p-3.5 transition-colors active:scale-[0.98]"
              style={{
                background: "var(--card, #fff)",
                borderColor: c.accent
                  ? "var(--color-coral)"
                  : "rgba(0,0,0,0.08)",
              }}
            >
              <div className="mb-1.5 flex items-start justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-base"
                  style={{ background: "var(--color-phosphor)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: "var(--color-ocean-deep)" }} />
                </div>
                {/* badge 數字 */}
                {c.badge !== undefined && c.badge > 0 && (
                  <span
                    className="min-w-[24px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold leading-tight"
                    style={{
                      background: c.accent ? "var(--color-coral)" : "var(--color-ocean-deep)",
                      color: "#fff",
                    }}
                  >
                    {c.badge}
                  </span>
                )}
              </div>
              <div className="text-sm font-bold leading-tight">
                {c.emoji} {c.title}
              </div>
              {c.sub && (
                <div className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--muted-foreground)" }}>
                  {c.sub}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* 更多功能 → 完整版 */}
      <Link
        href="/admin"
        onClick={() => {
          try {
            localStorage.setItem("admin_pref_layout", "full");
          } catch {
            /* ignore */
          }
        }}
        className="mt-4 flex items-center justify-center gap-1 text-xs"
        style={{ color: "var(--muted-foreground)" }}
      >
        更多功能 → 完整版
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </MobileAdminShell>
  );
}
