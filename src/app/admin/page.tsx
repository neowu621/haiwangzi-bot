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

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };

const SHORTCUTS = [
  { href: "/admin/bookings", icon: BookOpen, label: "訂單管理", color: "var(--color-phosphor)" },
  { href: "/admin/trips",    icon: Waves,    label: "日潛場次", color: "#34d399" },
  { href: "/admin/tours",    icon: Ship,     label: "潛水團",   color: "#a78bfa" },
  { href: "/admin/users",    icon: Users,    label: "會員管理", color: "#60a5fa" },
  { href: "/admin/coaches",  icon: GraduationCap, label: "教練", color: "#f59e0b" },
  { href: "/admin/sites",    icon: MapPin,   label: "潛點",     color: "#f472b6" },
  { href: "/admin/reports",  icon: BarChart2,label: "報表",     color: "#4ade80" },
  { href: "/admin/broadcast",icon: Megaphone,label: "群發通知", color: "#fb923c" },
  { href: "/admin/vip-tiers",icon: Star,     label: "VIP 設定", color: "#fbbf24" },
  { href: "/admin/settings", icon: Settings, label: "系統設定", color: "#94a3b8" },
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
        <div className="rounded-xl p-5 text-sm" style={{ ...cardStyle, color: "var(--color-coral)" }}>{err}</div>
      ) : stats ? (
        <div className="space-y-5">
          {/* ── ① Shortcuts (置頂) ── */}
          <div className="rounded-xl p-4" style={cardStyle}>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {SHORTCUTS.map(({ href, icon: Icon, label, color }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="flex flex-col items-center gap-1.5 rounded-lg p-2.5 transition-colors hover:bg-white/10"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <Icon className="h-5 w-5" style={{ color }} />
                  <span className="text-[10px] text-center leading-tight" style={{ color: "rgba(230,240,255,0.75)" }}>{label}</span>
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
              <div className="text-[10px] mb-1" style={subStyle}>進行中訂單</div>
              <div className="text-2xl font-bold" style={{ color: "#e6f0ff" }}>{stats.bookings.active}</div>
              <div className="text-[10px] mt-1" style={subStyle}>共 {stats.bookings.total} 筆</div>
            </div>
          </div>

          {/* ── ③ 待辦事項 banner ── */}
          {(stats.pendingProofs + stats.pendingSettlement + stats.pendingRefunds > 0) && (
            <div className="rounded-xl p-4" style={{ background: "rgba(255,123,90,0.12)", border: "1px solid rgba(255,123,90,0.35)" }}>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertCircle className="h-4 w-4" style={{ color: "var(--color-coral)" }} />
                <span className="text-sm font-semibold" style={{ color: "var(--color-coral)" }}>待辦事項</span>
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
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "rgba(230,240,255,0.7)" }}>
                <Calendar className="h-4 w-4" />
                開團狀況（接下來 14 天）
              </h2>
              <button onClick={() => router.push("/admin/trips")}
                className="text-xs flex items-center gap-1" style={{ color: "var(--color-phosphor)" }}>
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
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="col-span-3 tabular-nums">
                        <div style={{ color: "#e6f0ff" }} className="font-medium">{t.date}</div>
                        <div className="flex items-center gap-1" style={subStyle}>
                          {t.isNightDive ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3 text-amber-400" />}
                          {t.startTime}
                        </div>
                      </div>
                      <div className="col-span-4" style={{ color: "rgba(230,240,255,0.85)" }}>
                        {t.sites.join("・") || "—"}
                      </div>
                      <div className="col-span-3 text-[10px]" style={subStyle}>
                        {noCoach ? (
                          <span className="text-amber-400">⚠ 無教練</span>
                        ) : (
                          <>👤 {t.coaches.join(", ")}</>
                        )}
                      </div>
                      <div className="col-span-2 text-right">
                        <span className={`font-semibold ${isFull ? "text-rose-400" : isEmpty ? "text-amber-400" : "text-[#e6f0ff]"}`}>
                          {t.booked}/{t.capacity ?? "∞"}
                        </span>
                        {isFull && <div className="text-[9px] text-rose-400">滿</div>}
                        {isEmpty && fillRate === 0 && <div className="text-[9px] text-amber-400">缺人</div>}
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
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "rgba(230,240,255,0.7)" }}>
                <UserCheck className="h-4 w-4" />
                會員動向
              </h2>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniStat label="今日新加入" value={`+${stats.users.todayNew}`} color="phosphor" />
                <MiniStat label="本週新加入" value={`+${stats.users.last7DaysNew}`} color="blue" />
                <MiniStat label="本週活躍" value={`${stats.users.activeWeekly}`} color="muted" sub="登入過 LIFF" />
                <MiniStat label="會員總數" value={`${stats.users.total}`} color="muted" />
              </div>
              {stats.churningHighVips.length > 0 && (
                <div className="rounded-lg p-3 mt-2" style={{ background: "rgba(255,123,90,0.08)", border: "1px solid rgba(255,123,90,0.2)" }}>
                  <div className="text-[10px] font-semibold mb-1.5" style={{ color: "var(--color-coral)" }}>💔 流失警告（VIP4+ 30 天未下單）</div>
                  <div className="space-y-1">
                    {stats.churningHighVips.map((u, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span style={{ color: "rgba(230,240,255,0.85)" }}>{u.name}</span>
                        <span style={subStyle}>LV{u.vipLevel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.highIntentLeads && stats.highIntentLeads.length > 0 && (
                <div className="rounded-lg p-3 mt-2" style={{ background: "rgba(99,235,164,0.08)", border: "1px solid rgba(99,235,164,0.2)" }}>
                  <div className="text-[10px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--color-phosphor)" }}>
                    <Heart className="h-3 w-3" />
                    高意願客戶（7 天內看過場次但沒下單）
                  </div>
                  <div className="space-y-1">
                    {stats.highIntentLeads.slice(0, 5).map((l, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span style={{ color: "rgba(230,240,255,0.85)" }}>{l.name}</span>
                        <span style={subStyle}>{l.tripDate} · {l.tripSite}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 業務洞察 */}
            <div className="rounded-xl p-5" style={cardStyle}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "rgba(230,240,255,0.7)" }}>
                <Trophy className="h-4 w-4" />
                業務洞察（近 30 天）
              </h2>
              <div className="space-y-3">
                <RankList title="🏆 教練績效 Top 3" items={stats.topCoaches.map((c) => ({ name: c.name, value: `${c.participants} 人次 / ${c.trips} 場` }))} />
                <RankList title="🔥 熱門潛點 Top 3" items={stats.topSites.map((s) => ({ name: s.name, value: `${s.participants} 人次 / ${s.trips} 場` }))} />
                {stats.nearBirthdays.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold mb-1.5 flex items-center gap-1" style={subStyle}>
                      <Cake className="h-3 w-3" />
                      近 7 天生日
                    </div>
                    <div className="space-y-0.5">
                      {stats.nearBirthdays.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px]">
                          <span style={{ color: "rgba(230,240,255,0.85)" }}>{b.name}</span>
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
      <div className="text-[10px] mb-1 flex items-center justify-between" style={subStyle}>
        <span>{label}</span>
        {trendUp !== undefined && (trendUp ?
          <TrendingUp className="h-3 w-3" style={{ color: "var(--color-phosphor)" }} /> :
          <TrendingDown className="h-3 w-3" style={{ color: "var(--color-coral)" }} />
        )}
      </div>
      <div className={big ? "text-3xl font-bold" : "text-2xl font-bold"} style={{ color: "#e6f0ff" }}>
        NT$ {value.toLocaleString()}
      </div>
      <div className="text-[10px] mt-1" style={subStyle}>{sub}</div>
    </div>
  );
}

function TodoItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,123,90,0.2)" }}>
      <span className="text-xs" style={{ color: "#e6f0ff" }}>
        <span className="mr-1.5">{icon}</span>
        {label}
      </span>
      <ChevronRight className="h-3 w-3" style={{ color: "var(--color-coral)" }} />
    </button>
  );
}

function MiniStat({ label, value, color, sub }: { label: string; value: string; color: "phosphor" | "blue" | "muted"; sub?: string }) {
  const colorMap = {
    phosphor: "var(--color-phosphor)",
    blue: "#60a5fa",
    muted: "rgba(230,240,255,0.7)",
  };
  return (
    <div className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div className="text-[10px]" style={{ color: "rgba(230,240,255,0.45)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: colorMap[color] }}>{value}</div>
      {sub && <div className="text-[9px]" style={{ color: "rgba(230,240,255,0.4)" }}>{sub}</div>}
    </div>
  );
}

function RankList({ title, items }: { title: string; items: Array<{ name: string; value: string }> }) {
  return (
    <div>
      <div className="text-[10px] font-semibold mb-1.5" style={{ color: "rgba(230,240,255,0.5)" }}>{title}</div>
      {items.length === 0 ? (
        <div className="text-[10px]" style={{ color: "rgba(230,240,255,0.35)" }}>尚無資料</div>
      ) : (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span style={{ color: "rgba(230,240,255,0.85)" }}>
                <span style={{ color: "var(--color-phosphor)" }} className="font-semibold mr-1.5">{i + 1}.</span>
                {item.name}
              </span>
              <span style={{ color: "rgba(230,240,255,0.45)" }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
