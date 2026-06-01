"use client";
/**
 * v197：總覽 Dashboard — 老闆視角重構
 * 上層：需要您處理（pending actions）+ 今/明天場次（含客戶名單）
 * 下層：營運數字 + 業務洞察（次要資訊）
 */
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { useRouter } from "next/navigation";
import {
  Calendar, ChevronRight, Sun, Moon,
  UserCheck, Trophy, Cake, RotateCw,
} from "lucide-react";

interface CustomerOnTrip {
  name: string;
  phone: string | null;
  participants: number;
  paymentStatus: string;
}
interface TripDetail {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  sites: string[];
  coaches: string[];
  booked: number;
  capacity: number | null;
  customers: CustomerOnTrip[];
}

interface UnpaidBooking {
  id: string;
  code: string | null;
  type: "daily" | "tour";
  name: string;
  phone: string | null;
  totalAmount: number;
  createdAt: string;
  when: string;
  what: string;
}
interface PendingProof {
  id: string;
  bookingId: string;
  bookingCode: string | null;
  name: string;
  phone: string | null;
  amount: number;
  type: "deposit" | "final" | "refund";
  uploadedAt: string;
}

interface Stats {
  users: { total: number; todayNew: number; last7DaysNew: number; activeWeekly: number };
  revenue: { paid: number; booked: number; today: number; thisMonth: number; lastMonthSameWindow: number };
  bookings: { total: number; active: number };
  pendingProofs: number;
  pendingProofsDetails?: PendingProof[];
  pendingSettlement: number;
  pendingRefunds: number;
  partiallyPaid: number;
  overCapacity: number;
  unpaidCount?: number;
  unpaidBookings?: UnpaidBooking[];
  todayTripsDetail: TripDetail[];
  tomorrowTripsDetail: TripDetail[];
  topCoaches: Array<{ name: string; trips: number; participants: number }>;
  topSites: Array<{ name: string; trips: number; participants: number }>;
  nearBirthdays: Array<{ name: string; date: string; vipLevel: number }>;
  churningHighVips: Array<{ name: string; vipLevel: number }>;
  highIntentLeads?: Array<{ name: string; tripDate: string; tripSite: string }>;
}

const PAY_STATUS_LABEL: Record<string, string> = {
  pending: "未付", deposit_paid: "已付訂金", fully_paid: "已付清",
  refunding: "退款中", refunded: "已退款",
};
const PAY_STATUS_COLOR: Record<string, string> = {
  pending: "#dc2626", deposit_paid: "#d97706", fully_paid: "#16a34a",
  refunding: "#7c3aed", refunded: "#64748b",
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const d = await adminFetch<Stats>("/api/admin/stats");
      setStats(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AdminShell title="總覽">
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">載入中...</div>
      ) : err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{err}</div>
      ) : stats ? (
        <div className="space-y-5">
          {/* refresh bar — v213：移除「需要您處理」整個區塊，待後續重新定義 */}
          <div className="flex items-center justify-end">
            <button onClick={load} disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              重新整理
            </button>
          </div>


          {/* ═══════ 區塊 2：📅 今日 + 明日場次（含客戶名單） ═══════ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DayTripsBlock
              title="今日場次"
              subtitle={new Date().toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "long" })}
              trips={stats.todayTripsDetail}
              accentColor="#0891b2"
              onClickTrip={(id) => router.push(`/admin/trips?focus=${id}`)}
            />
            <DayTripsBlock
              title="明日場次"
              subtitle={new Date(Date.now() + 86400000).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", weekday: "long" })}
              trips={stats.tomorrowTripsDetail}
              accentColor="#7c3aed"
              onClickTrip={(id) => router.push(`/admin/trips?focus=${id}`)}
            />
          </div>

          {/* ═══════ 區塊 3：營運數字（次要） ═══════ */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">📊 營運數字</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label="今日營收" value={`NT$ ${stats.revenue.today.toLocaleString()}`}
                sub="實收（已核可）" color="#0891b2"
              />
              <MetricCard
                label="本月營收" value={`NT$ ${stats.revenue.thisMonth.toLocaleString()}`}
                sub={(() => {
                  if (stats.revenue.lastMonthSameWindow === 0) return "vs 上月同期 N/A";
                  const diff = stats.revenue.thisMonth - stats.revenue.lastMonthSameWindow;
                  const pct = Math.round((diff / stats.revenue.lastMonthSameWindow) * 100);
                  return `vs 上月同期 ${pct >= 0 ? "+" : ""}${pct}%`;
                })()}
                color="#16a34a"
              />
              <MetricCard
                label="總收入" value={`NT$ ${stats.revenue.paid.toLocaleString()}`}
                sub={`預計 NT$ ${stats.revenue.booked.toLocaleString()}`}
                color="#475569"
              />
              <MetricCard
                label="進行中訂單" value={`${stats.bookings.active}`}
                sub={`累計 ${stats.bookings.total} 筆`}
                color="#0a2342"
              />
            </div>
          </section>

          {/* ═══════ 區塊 4：業務洞察（次要） ═══════ */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <InsightCard title="🏆 教練績效 Top 3" subtitle="近 30 天" items={
              stats.topCoaches.map((c) => ({ name: c.name, value: `${c.participants} 人次 / ${c.trips} 場` }))
            } />
            <InsightCard title="🔥 熱門潛點 Top 3" subtitle="近 30 天" items={
              stats.topSites.map((s) => ({ name: s.name, value: `${s.participants} 人次 / ${s.trips} 場` }))
            } />
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-1 text-sm font-bold text-slate-700 flex items-center gap-2">
                <UserCheck className="h-4 w-4" /> 會員動向
              </div>
              <div className="text-[11px] text-slate-500 mb-3">近期統計</div>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="今日新加入" value={`+${stats.users.todayNew}`} color="#0891b2" />
                <MiniStat label="本週新加入" value={`+${stats.users.last7DaysNew}`} color="#2563eb" />
                <MiniStat label="本週活躍" value={`${stats.users.activeWeekly}`} color="#475569" />
                <MiniStat label="會員總數" value={`${stats.users.total}`} color="#0a2342" />
              </div>
              {stats.nearBirthdays.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Cake className="h-3 w-3" />
                    近 7 天生日
                  </div>
                  <div className="space-y-0.5">
                    {stats.nearBirthdays.map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-700">{b.name}</span>
                        <span className="text-slate-500 tabular-nums">{b.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function ActionCard({
  show, icon, count, label, desc, tone, onClick,
}: {
  show: boolean; icon: React.ReactNode; count: number; label: string; desc: string;
  tone: "red" | "amber" | "purple"; onClick: () => void;
}) {
  if (!show) return null;
  const toneMap = {
    red:    { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626", text: "#991b1b" },
    amber:  { bg: "#fffbeb", border: "#fde68a", icon: "#d97706", text: "#92400e" },
    purple: { bg: "#faf5ff", border: "#e9d5ff", icon: "#9333ea", text: "#6b21a8" },
  };
  const c = toneMap[tone];
  return (
    <button onClick={onClick}
      className="group flex flex-col gap-1 rounded-xl border p-3 text-left transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{ background: c.bg, borderColor: c.border }}>
      <div className="flex items-center justify-between">
        <span style={{ color: c.icon }}>{icon}</span>
        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-50" style={{ color: c.icon }} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums" style={{ color: c.icon }}>{count}</span>
        <span className="text-[10px] font-semibold" style={{ color: c.text }}>{label}</span>
      </div>
      <div className="text-[10px] leading-tight" style={{ color: c.text, opacity: 0.7 }}>{desc}</div>
    </button>
  );
}

function DayTripsBlock({
  title, subtitle, trips, accentColor, onClickTrip,
}: {
  title: string; subtitle: string; trips: TripDetail[]; accentColor: string;
  onClickTrip: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 p-4" style={{ background: `${accentColor}08` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" style={{ color: accentColor }} />
            <h2 className="text-sm font-bold" style={{ color: accentColor }}>{title}</h2>
          </div>
          <span className="text-[11px] text-slate-500">{subtitle}</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          共 {trips.length} 場 · {trips.reduce((s, t) => s + t.booked, 0)} 人參加
        </div>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
        {trips.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">沒有場次</div>
        ) : trips.map((t) => (
          <div key={t.id} className="rounded-lg border border-slate-200 overflow-hidden">
            {/* 場次標頭 */}
            <div onClick={() => onClickTrip(t.id)}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50"
              style={{ background: "#fafafa" }}>
              {t.isNightDive ? (
                <Moon className="h-3.5 w-3.5 text-slate-500" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-amber-500" />
              )}
              <span className="font-mono text-sm font-bold tabular-nums text-slate-800">{t.startTime}</span>
              <span className="text-xs text-slate-600">{t.sites.join("・") || "—"}</span>
              <span className="ml-auto text-[11px] font-semibold tabular-nums" style={{ color: accentColor }}>
                {t.booked}{t.capacity != null ? `/${t.capacity}` : ""} 人
              </span>
            </div>
            {/* 客戶名單 */}
            {t.customers.length > 0 && (
              <div className="bg-white px-3 py-1.5">
                <div className="space-y-0.5">
                  {t.customers.map((c, j) => (
                    <div key={j} className="flex items-center justify-between text-[12px]">
                      <span className="text-slate-700">
                        <span className="font-medium">{c.name}</span>
                        {c.participants > 1 && <span className="text-slate-400 ml-1">×{c.participants}</span>}
                        {c.phone && <span className="ml-1.5 text-[10px] text-slate-400 tabular-nums">{c.phone}</span>}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums"
                        style={{ color: PAY_STATUS_COLOR[c.paymentStatus] ?? "#64748b" }}>
                        {PAY_STATUS_LABEL[c.paymentStatus] ?? c.paymentStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* 教練 / 容量警示 */}
            <div className="border-t border-slate-100 px-3 py-1 text-[10px] flex items-center justify-between bg-slate-50">
              <span className="text-slate-600">
                {t.coaches.length === 0 ? (
                  <span className="text-amber-600 font-semibold">⚠ 尚未指派教練</span>
                ) : (
                  <>👤 {t.coaches.join(", ")}</>
                )}
              </span>
              {t.capacity != null && t.booked >= t.capacity && (
                <span className="text-rose-600 font-bold">已滿</span>
              )}
              {t.booked === 0 && <span className="text-amber-600">⚠ 無人報名</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-1 text-slate-500">{sub}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-2">
      <div className="text-[10px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function InsightCard({
  title, subtitle, items,
}: { title: string; subtitle: string; items: Array<{ name: string; value: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1 text-sm font-bold text-slate-700 flex items-center gap-2">
        <Trophy className="h-4 w-4" /> {title}
      </div>
      <div className="text-[11px] text-slate-500 mb-3">{subtitle}</div>
      {items.length === 0 ? (
        <div className="text-[11px] text-slate-400">尚無資料</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-700">
                <span className="text-cyan-600 font-bold mr-1.5">{i + 1}.</span>
                {item.name}
              </span>
              <span className="text-slate-500">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
