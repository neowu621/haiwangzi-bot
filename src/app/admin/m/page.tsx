"use client";
// 手機簡版後台首頁（/admin/m）— v570：老闆精選 8 項大卡片啟動器。
//   純 <Link> 導向現有頁(日潛場次走手機版 /admin/m/trips);badge 走輕量 /api/admin/stats/lite。
import { useEffect, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import {
  Wallet,
  BookOpen,
  MessageSquare,
  Mail,
  Users,
  CalendarDays,
  Ship,
  Star,
} from "lucide-react";

const LITE_URL = "/api/admin/stats/lite";

interface LiteStats {
  tonight: { proofs: number; attendance: number };
  pendingProofs: number;
  todayTrips: { count: number; people: number };
  tomorrowTrips: { count: number; people: number };
  pendingWishes: number;
  pendingEmails: number;
}

export default function MobileAdminHome() {
  const { ready } = useAdminAuth();
  const [stats, setStats] = useState<LiteStats | undefined>(() => getCached<LiteStats>(LITE_URL));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    cachedFetch<LiteStats>(LITE_URL, { force: true })
      .then((d) => { if (alive) { setStats(d); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "載入失敗"); });
    return () => { alive = false; };
  }, [ready]);

  const tonightBadge = (stats?.tonight.proofs ?? 0) + (stats?.tonight.attendance ?? 0);
  const tripsBadge = stats ? stats.todayTrips.count + stats.tomorrowTrips.count : undefined;

  const cards: Array<{ href: string; icon: typeof Wallet; emoji: string; title: string; badge: number | undefined; sub?: string; accent: boolean }> = [
    { href: "/admin/m/tonight", icon: Wallet, emoji: "🧾", title: "老闆結帳", badge: stats ? tonightBadge : undefined, sub: stats ? `待匯款 ${stats.tonight.proofs}・待到場 ${stats.tonight.attendance}` : undefined, accent: tonightBadge > 0 },
    { href: "/admin/m/bookings", icon: BookOpen, emoji: "📖", title: "訂單管理", badge: stats?.pendingProofs, sub: "確認 / 收款", accent: (stats?.pendingProofs ?? 0) > 0 },
    { href: "/admin/m/dive-wishes", icon: MessageSquare, emoji: "📝", title: "願望單", badge: stats?.pendingWishes, sub: "新許願 / 回覆", accent: (stats?.pendingWishes ?? 0) > 0 },
    { href: "/admin/m/email", icon: Mail, emoji: "📧", title: "客服信箱", badge: stats?.pendingEmails, sub: "回客人 / LINE", accent: (stats?.pendingEmails ?? 0) > 0 },
    { href: "/admin/m/trips", icon: CalendarDays, emoji: "🌊", title: "日潛場次", badge: tripsBadge, sub: stats ? `今 ${stats.todayTrips.count}・明 ${stats.tomorrowTrips.count} 場` : "誰報名 / 集合", accent: false },
    { href: "/admin/m/users", icon: Users, emoji: "👥", title: "會員管理", badge: undefined, sub: "查詢會員", accent: false },
    { href: "/admin/m/tours", icon: Ship, emoji: "⛴️", title: "潛水旅行", badge: undefined, sub: "團況", accent: false },
    { href: "/admin/m/credits", icon: Star, emoji: "⭐", title: "抵用金管理", badge: undefined, sub: "查 / 發抵用金", accent: false },
  ];

  return (
    <MobileAdminShell>
      {error && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>
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
              style={{ background: "var(--card, #fff)", borderColor: c.accent ? "var(--color-coral)" : "rgba(0,0,0,0.08)" }}
            >
              <div className="mb-1.5 flex items-start justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-base" style={{ background: "var(--color-phosphor)" }}>
                  <Icon className="h-5 w-5" style={{ color: "var(--color-ocean-deep)" }} />
                </div>
                {c.badge !== undefined && c.badge > 0 && (
                  <span className="min-w-[24px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold leading-tight" style={{ background: c.accent ? "var(--color-coral)" : "var(--color-ocean-deep)", color: "#fff" }}>
                    {c.badge > 99 ? "99+" : c.badge}
                  </span>
                )}
              </div>
              <div className="text-sm font-bold leading-tight">{c.emoji} {c.title}</div>
              {c.sub && <div className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--muted-foreground)" }}>{c.sub}</div>}
            </Link>
          );
        })}
      </div>
    </MobileAdminShell>
  );
}
