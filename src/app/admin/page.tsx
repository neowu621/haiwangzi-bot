"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { useRouter } from "next/navigation";
import {
  BookOpen, Users, Waves, Ship, GraduationCap,
  MapPin, Star, Megaphone, BarChart2, Settings,
  AlertCircle, TrendingUp, TrendingDown, Calendar,
  UserCheck, Trophy, Cake, Heart, Moon, Sun,
  ChevronRight,
} from "lucide-react";

interface Stats {
  users: {
    total: number; customers: number; coaches: number; admins: number;
    todayNew: number; last7DaysNew: number; activeWeekly: number;
  };
  trips: { total: number; open: number; bookable: number };
  tours: { total: number; open: number; bookable: number };
  bookings: { total: number; active: number; todayNew: number; last7DaysNew: number };
  revenue: {
    paid: number; booked: number;
    today: number; thisMonth: number; lastMonthSameWindow: number;
  };
  pendingProofs: number;
  pendingSettlement: number;
  pendingRefunds: number;
  upcomingTrips: Array<{
    id: string; date: string; startTime: string; isNightDive: boolean;
    sites: string[]; coaches: string[]; booked: number; capacity: number | null;
  }>;
  topCoaches: Array<{ name: string; trips: number; participants: number }>;
  topSites: Array<{ name: string; trips: number; participants: number }>;
  nearBirthdays: Array<{ name: string; date: string; vipLevel: number }>;
  churningHighVips: Array<{ name: string; vipLevel: number; lastActiveAt: string }>;
  highIntentLeads?: Array<{ name: string; tripDate: string; tripSite: string; viewedAt: string; refId: string }>;
}

// 淺色卡片：白底 + 淡灰邊 + 輕微陰影
const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid rgba(10, 35, 66, 0.08)",
  boxShadow: "0 1px 2px rgba(10, 35, 66, 0.04)",
};
// 標題文字
const headingStyle: React.CSSProperties = { color: "var(--color-ocean-deep)" };
// 次要說明文字（對比 4.5+）
const subStyle: React.CSSProperties = { color: "#64748b" };
// 主要數字 / 強調文字
const valueStyle: React.CSSProperties = { color: "var(--color-ocean-deep)" };

const SHORTCUTS = [
  { href: "/admin/bookings", icon: BookOpen,      label: "訂單管理", color: "#0891b2" }, // cyan-600
  { href: "/admin/trips",    icon: Waves,         label: "日潛場次", color: "#059669" }, // emerald-600
  { href: "/admin/tours",    icon: Ship,          label: "潛水團",   color: "#7c3aed" }, // violet-600
  { href: "/admin/users",    icon: Users,         label: "會員管理", color: "#2563eb" }, // blue-600
  { href: "/admin/coaches",  icon: GraduationCap, label: "教練",     color: "#d97706" }, // amber-600
  { href: "/admin/sites",    icon: MapPin,        label: "潛點",     color: "#db2777" }, // pink-600
  { href: "/admin/reports",  icon: BarChart2,     label: "報表",     color: "#16a34a" }, // green-600
  { href: "/admin/broadcast",icon: Megaphone,     label: "群發通知", color: "#ea580c" }, // orange-600
  { href: "/admin/vip-tiers",icon: Star,          label: "VIP 設定", color: "#ca8a04" }, // yellow-600
  { href: "/admin/settings", icon: Settings,      label: "系統設定", color: "#475569" }, // slate-600
];

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Stats>("/api/admin/stats")
      .then(setStats)
      .catch((e) => setErr(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="總覽">
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm" style={subStyle}>載入中...</div>
      ) : err ? (
        <div className="rounded-xl p-5 text-sm" style={{ ...cardStyle, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }}>{err}</div>
      ) : stats ? (
        <div className="space-y-5">
          {/* ── ① Shortcuts (置頂) ── */}
          <div className="rounded-xl p-4" style={cardStyle}>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {SHORTCUTS.map(({ href, icon: Icon, label, color }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 transition-colors hover:bg-slate-100"
                  style={{ border: "1px solid rgba(10, 35, 66, 0.06)" }}
                >
                  <Icon className="h-5 w-5" style={{ color }} />
                  <span className="text-[10px] text-center leading-tight font-medium" style={{ color: "#334155" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── ② 今日營收 + 月對比 ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <RevenueCard label="今日營收" value={stats.revenue.today} sub="實收（已核可付款）" big />
            <RevenueCard
              label="本月營收"
              value={stats.revenue.thisMonth}
              sub={(() => {
                if (stats.revenue.lastMonthSameWindow === 0) return "vs 上月同期 N/A";
                const diff = stats.revenue.thisMonth - stats.revenue.lastMonthSameWindow;
                const pct = Math.round((diff / stats.revenue.lastMonthSameWindow) * 100);
                return `vs 上月同期 ${pct >= 0 ? "+" : ""}${pct}%`;
              })()}
              trendUp={stats.revenue.thisMonth > stats.revenue.lastMonthSameWindow}
            />
            <RevenueCard label="總收入" value={stats.revenue.paid} sub={`預計 ${stats.revenue.booked.toLocaleString()}`} />
            <div className="rounded-xl p-4" style={cardStyle}>
              <div className="text-[10px] mb-1 font-semibold uppercase tracking-wider" style={subStyle}>進行中訂單</div>
              <div className="text-2xl font-bold" style={valueStyle}>{stats.bookings.active}</div>
              <div className="text-[11px] mt-1" style={subStyle}>共 {stats.bookings.total} 筆</div>
            </div>
          </div>

          {/* ── ③ 待辦事項 banner ── */}
          {(stats.pendingProofs + stats.pendingSettlement + stats.pendingRefunds > 0) && (
            <div className="rounded-xl p-4" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertCircle className="h-4 w-4" style={{ color: "#c2410c" }} />
                <span className="text-sm font-semibold" style={{ color: "#9a3412" }}>待辦事項</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {stats.pendingProofs > 0 && (
                  <TodoItem icon="📄" label={`${stats.pendingProofs} 筆付款待審核`} onClick={() => router.push("/admin/bookings")} />
                )}
                {stats.pendingSettlement > 0 && (
                  <TodoItem icon="⏰" label={`${stats.pendingSettlement} 筆訂單待結算`} onClick={() => router.push("/admin/bookings")} />
                )}
                {stats.pendingRefunds > 0 && (
                  <TodoItem icon="💸" label={`${stats.pendingRefunds} 筆退款待處理`} onClick={() => router.push("/admin/bookings")} />
                )}
              </div>
            </div>
          )}

          {/* ── ④ 開團狀況（接下來 14 天）── */}
          <div className="rounded-xl p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2" style={headingStyle}>
                <Calendar className="h-4 w-4" />
                開團狀況（接下來 14 天）
              </h2>
              <button onClick={() => router.push("/admin/trips")}
                className="text-xs flex items-center gap-1 font-medium hover:underline" style={{ color: "#0891b2" }}>
                完整場次 <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {stats.upcomingTrips.length === 0 ? (
              <div className="py-6 text-center text-xs" style={subStyle}>接下來 14 天沒有開團</div>
            ) : (
              <div className="space-y-1.5">
                {stats.upcomingTrips.map((t) => {
                  const fillRate = t.capacity ? t.booked / t.capacity : 0;
                  const isFull = t.capacity != null && t.booked >= t.capacity;
                  const isEmpty = t.booked === 0;
                  const noCoach = t.coaches.length === 0;
                  return (
                    <div key={t.id}
                      className="grid grid-cols-12 gap-2 items-center rounded-lg px-3 py-2 text-xs"
                      style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <div className="col-span-3 tabular-nums">
                        <div style={valueStyle} className="font-semibold">{t.date}</div>
                        <div className="flex items-center gap-1" style={subStyle}>
                          {t.isNightDive ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" style={{ color: "#d97706" }} />}
                          {t.startTime}
                        </div>
                      </div>
                      <div className="col-span-4" style={{ color: "#334155" }}>
                        {t.sites.join("・") || "—"}
                      </div>
                      <div className="col-span-3 text-[11px]" style={subStyle}>
                        {noCoach ? (
                          <span style={{ color: "#b45309" }}>⚠ 無教練</span>
                        ) : (
                          <>👤 {t.coaches.join(", ")}</>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className="font-semibold" style={{ color: isFull ? "#dc2626" : isEmpty ? "#b45309" : "var(--color-ocean-deep)" }}>
                          {t.booked}/{t.capacity ?? "∞"}
                        </span>
                        {isFull && <div className="text-[10px]" style={{ color: "#dc2626" }}>滿</div>}
                        {isEmpty && fillRate === 0 && <div className="text-[10px]" style={{ color: "#b45309" }}>缺人</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── ⑤ 會員動向 + 業務洞察 (兩欄) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 會員動向 */}
            <div className="rounded-xl p-5" style={cardStyle}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={headingStyle}>
                <UserCheck className="h-4 w-4" />
                會員動向
              </h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniStat label="今日新加入" value={`+${stats.users.todayNew}`} color="teal" />
                <MiniStat label="本週新加入" value={`+${stats.users.last7DaysNew}`} color="blue" />
                <MiniStat label="本週活躍" value={`${stats.users.activeWeekly}`} color="dark" sub="登入過 LIFF" />
                <MiniStat label="會員總數" value={`${stats.users.total}`} color="dark" />
              </div>
              {stats.churningHighVips.length > 0 && (
                <div className="rounded-lg p-3 mt-2" style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <div className="text-[11px] font-semibold mb-1.5" style={{ color: "#b91c1c" }}>💔 流失警告（VIP4+ 30 天未下單）</div>
                  <div className="space-y-1">
                    {stats.churningHighVips.map((u, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <span style={{ color: "#334155" }}>{u.name}</span>
                        <span style={subStyle}>LV{u.vipLevel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.highIntentLeads && stats.highIntentLeads.length > 0 && (
                <div className="rounded-lg p-3 mt-2" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "#15803d" }}>
                    <Heart className="h-3 w-3" />
                    高意願客戶（7 天內看過場次但沒下單）
                  </div>
                  <div className="space-y-1">
                    {stats.highIntentLeads.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <span style={{ color: "#334155" }}>{l.name}</span>
                        <span style={subStyle}>{l.tripDate} · {l.tripSite}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 業務洞察 */}
            <div className="rounded-xl p-5" style={cardStyle}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={headingStyle}>
                <Trophy className="h-4 w-4" />
                業務洞察（近 30 天）
              </h2>
              <div className="space-y-3">
                <RankList title="🏆 教練績效 Top 3" items={stats.topCoaches.map((c) => ({ name: c.name, value: `${c.participants} 人次 / ${c.trips} 場` }))} />
                <RankList title="🔥 熱門潛點 Top 3" items={stats.topSites.map((s) => ({ name: s.name, value: `${s.participants} 人次 / ${s.trips} 場` }))} />
                {stats.nearBirthdays.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1" style={subStyle}>
                      <Cake className="h-3 w-3" />
                      近 7 天生日
                    </div>
                    <div className="space-y-0.5">
                      {stats.nearBirthdays.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-[12px]">
                          <span style={{ color: "#334155" }}>{b.name}</span>
                          <span style={subStyle}>{b.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function RevenueCard({ label, value, sub, big = false, trendUp }: {
  label: string; value: number; sub: string; big?: boolean; trendUp?: boolean;
}) {
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="text-[10px] mb-1 flex items-center justify-between font-semibold uppercase tracking-wider" style={subStyle}>
        <span>{label}</span>
        {trendUp !== undefined && (trendUp ?
          <TrendingUp className="h-3.5 w-3.5" style={{ color: "#16a34a" }} /> :
          <TrendingDown className="h-3.5 w-3.5" style={{ color: "#dc2626" }} />
        )}
      </div>
      <div className={big ? "text-3xl font-bold" : "text-2xl font-bold"} style={valueStyle}>
        NT$ {value.toLocaleString()}
      </div>
      <div className="text-[11px] mt-1" style={subStyle}>{sub}</div>
    </div>
  );
}

function TodoItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-orange-100"
      style={{ background: "#ffffff", border: "1px solid #fed7aa" }}>
      <span className="text-xs font-medium" style={{ color: "#9a3412" }}>
        <span className="mr-1.5">{icon}</span>
        {label}
      </span>
      <ChevronRight className="h-3.5 w-3.5" style={{ color: "#c2410c" }} />
    </button>
  );
}

function MiniStat({ label, value, color, sub }: { label: string; value: string; color: "teal" | "blue" | "dark"; sub?: string }) {
  const colorMap = {
    teal: "#0891b2",
    blue: "#2563eb",
    dark: "var(--color-ocean-deep)",
  };
  return (
    <div className="rounded-lg p-2.5" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: colorMap[color] }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
}

function RankList({ title, items }: { title: string; items: Array<{ name: string; value: string }> }) {
  return (
    <div>
      <div className="text-[11px] font-semibold mb-1.5" style={{ color: "#64748b" }}>{title}</div>
      {items.length === 0 ? (
        <div className="text-[11px]" style={{ color: "#94a3b8" }}>尚無資料</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[12px]">
              <span style={{ color: "#334155" }}>
                <span style={{ color: "#0891b2" }} className="font-semibold mr-1.5">{i + 1}.</span>
                {item.name}
              </span>
              <span style={{ color: "#64748b" }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
