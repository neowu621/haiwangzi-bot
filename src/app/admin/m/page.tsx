"use client";
// 手機簡版後台首頁（/admin/m）— v570：老闆精選 8 項大卡片啟動器。
//   純 <Link> 導向現有頁(日潛場次走手機版 /admin/m/trips);badge 走輕量 /api/admin/stats/lite。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth } from "@/lib/admin-web-auth";
import { getCached, cachedFetch } from "@/lib/admin-cache";
import {
  Receipt,
  Mail,
  Users,
  CalendarDays,
  Ship,
  Star,
  Eye,
  ChevronRight,
} from "lucide-react";

const LITE_URL = "/api/admin/stats/lite";
const VISITS_URL = "/api/admin/stats/visits";

interface LiteStats {
  tonight: { proofs: number; attendance: number; pendingOrders?: number };
  pendingProofs: number;
  todayTrips: { count: number; people: number };
  tomorrowTrips: { count: number; people: number };
  pendingWishes: number;
  pendingEmails: number;
}

interface DayStat { date: string; views: number; visitors: number }
interface VisitStats {
  today: DayStat;
  week: { views: number; visitors: number };
  days: DayStat[];
}

export default function MobileAdminHome() {
  const { ready, adminUser } = useAdminAuth();
  const router = useRouter();
  // v677/678：教練/助教（非 admin/boss/it）→ 不看手機管理首頁，導到「手機版到場點名」（不導桌機）
  useEffect(() => {
    if (!adminUser) return;
    const roles = adminUser.effectiveRoles ?? [];
    if (!roles.some((r) => r === "admin" || r === "boss" || r === "it")) {
      router.replace("/admin/m/attendance");
    }
  }, [adminUser, router]);
  const [stats, setStats] = useState<LiteStats | undefined>(() => getCached<LiteStats>(LITE_URL));
  const [visits, setVisits] = useState<VisitStats | undefined>(() => getCached<VisitStats>(VISITS_URL));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    cachedFetch<LiteStats>(LITE_URL, { force: true })
      .then((d) => { if (alive) { setStats(d); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "載入失敗"); });
    cachedFetch<VisitStats>(VISITS_URL, { force: true })
      .then((d) => { if (alive) setVisits(d); })
      .catch(() => { /* 訪客數非關鍵，靜默 */ });
    return () => { alive = false; };
  }, [ready]);

  const maxVisitors = visits ? Math.max(1, ...visits.days.map((d) => d.visitors)) : 1;

  // v731：老闆結帳 = 聯合待辦中心（待確認匯款 + 待匯款訂單 + 新願望待回覆）。到場點名已移到個人中心。
  const allPending = (stats?.tonight.proofs ?? 0) + (stats?.tonight.pendingOrders ?? 0) + (stats?.pendingWishes ?? 0);
  const tripsBadge = stats ? stats.todayTrips.count + stats.tomorrowTrips.count : undefined;

  type Row = { href: string; icon: typeof Mail; emoji: string; title: string; badge: number | undefined; sub?: string; accent: boolean };
  const sections: Array<{ title: string; rows: Row[] }> = [
    {
      title: "待我處理",
      rows: [
        { href: "/admin/m/tonight", icon: Receipt, emoji: "🧾", title: "老闆結帳", badge: stats ? allPending : undefined, sub: stats ? `待確認 ${stats.tonight.proofs}・待匯款 ${stats.tonight.pendingOrders ?? 0}・新願望 ${stats.pendingWishes}` : "確認收款 / 願望", accent: allPending > 0 },
        { href: "/admin/m/email", icon: Mail, emoji: "📧", title: "客服信箱", badge: stats?.pendingEmails, sub: "回客人 / LINE", accent: (stats?.pendingEmails ?? 0) > 0 },
      ],
    },
    {
      title: "今日現場",
      rows: [
        { href: "/admin/m/trips", icon: CalendarDays, emoji: "🌊", title: "日潛場次", badge: tripsBadge, sub: stats ? `今 ${stats.todayTrips.count}・明 ${stats.tomorrowTrips.count} 場` : "誰報名 / 集合", accent: false },
      ],
    },
    {
      title: "查詢 / 管理",
      rows: [
        { href: "/admin/m/users", icon: Users, emoji: "👥", title: "會員管理", badge: undefined, sub: "輸入姓名 / 電話查詢", accent: false },
        { href: "/admin/m/tours", icon: Ship, emoji: "⛴️", title: "潛水旅行", badge: undefined, sub: "團況", accent: false },
        { href: "/admin/m/credits", icon: Star, emoji: "⭐", title: "抵用金管理", badge: undefined, sub: "查 / 發抵用金", accent: false },
      ],
    },
  ];

  return (
    <MobileAdminShell>
      {error && !stats && (
        <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}>
          載入失敗：{error}
        </div>
      )}

      {/* v577：訪客計數卡 — 今日/本週訪客 + 近 7 天迷你長條。v679：手機不導桌機分析頁，改純顯示 */}
      <div
        className="mb-3 block rounded-2xl border p-3.5"
        style={{ background: "var(--color-ocean-deep)", borderColor: "rgba(0,0,0,0.08)" }}
      >
        <div className="mb-2 flex items-center gap-1.5" style={{ color: "var(--color-phosphor)" }}>
          <Eye className="h-4 w-4" />
          <span className="text-[11px] font-bold tracking-wide">網站訪客</span>
        </div>
        <div className="flex items-end gap-5">
          <div>
            <div className="font-mono text-2xl font-bold leading-none tabular-nums" style={{ color: "#fff" }}>
              {visits ? visits.today.visitors : "–"}
            </div>
            <div className="mt-1 text-[10px]" style={{ color: "rgba(230,240,255,0.6)" }}>
              今日訪客{visits ? `・${visits.today.views} 次瀏覽` : ""}
            </div>
          </div>
          <div>
            <div className="font-mono text-2xl font-bold leading-none tabular-nums" style={{ color: "var(--color-phosphor)" }}>
              {visits ? visits.week.visitors : "–"}
            </div>
            <div className="mt-1 text-[10px]" style={{ color: "rgba(230,240,255,0.6)" }}>
              近 7 天訪客
            </div>
          </div>
          {/* 迷你長條（近 7 天訪客數） */}
          {visits && (
            <div className="ml-auto flex h-9 items-end gap-1">
              {visits.days.map((d, i) => {
                const isToday = i === visits.days.length - 1;
                return (
                  <div
                    key={d.date}
                    className="w-1.5 rounded-sm"
                    title={`${d.date.slice(5)}：${d.visitors} 人`}
                    style={{
                      height: `${Math.max(8, (d.visitors / maxVisitors) * 100)}%`,
                      background: isToday ? "var(--color-phosphor)" : "rgba(230,240,255,0.35)",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.title}>
          <div className="mb-1.5 mt-4 px-1 text-[11px]" style={{ color: "var(--muted-foreground)" }}>{sec.title}</div>
          <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            {sec.rows.map((c, i) => {
              const Icon = c.icon;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  className="flex items-center gap-3 px-3 py-3 transition-colors active:bg-black/[0.02]"
                  style={{ background: "var(--card, #fff)", borderTop: i > 0 ? "0.5px solid rgba(0,0,0,0.08)" : undefined }}
                >
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl" style={{ background: "var(--color-phosphor)" }}>
                    <Icon className="h-5 w-5" style={{ color: "var(--color-ocean-deep)" }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold leading-tight">{c.emoji} {c.title}</span>
                    {c.sub && <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--muted-foreground)" }}>{c.sub}</span>}
                  </span>
                  {c.badge !== undefined && c.badge > 0 && (
                    <span className="flex h-5 min-w-[22px] flex-none items-center justify-center rounded-full px-1.5 text-xs font-bold text-white" style={{ background: c.accent ? "var(--color-coral)" : "var(--color-ocean-deep)" }}>
                      {c.badge > 99 ? "99+" : c.badge}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 flex-none" style={{ color: "var(--muted-foreground)" }} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </MobileAdminShell>
  );
}
