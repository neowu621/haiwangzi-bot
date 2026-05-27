"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { useRouter } from "next/navigation";
import {
  BookOpen, Users, Waves, Ship, GraduationCap,
  MapPin, Star, Megaphone, BarChart2, Settings,
  AlertCircle,
} from "lucide-react";

interface Stats {
  users: { total: number; customers: number; coaches: number; admins: number };
  trips: { total: number; open: number; bookable: number };
  tours: { total: number; open: number; bookable: number };
  bookings: { total: number; active: number };
  revenue: { paid: number; booked: number };
  pendingProofs: number;
}

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };

const SHORTCUTS = [
  { href: "/admin/bookings", icon: BookOpen, label: "訂單管理", color: "var(--color-phosphor)" },
  { href: "/admin/users",    icon: Users,    label: "會員管理", color: "#60a5fa" },
  { href: "/admin/trips",    icon: Waves,    label: "日潛場次", color: "#34d399" },
  { href: "/admin/tours",    icon: Ship,     label: "潛水團",   color: "#a78bfa" },
  { href: "/admin/coaches",  icon: GraduationCap, label: "教練管理", color: "#f59e0b" },
  { href: "/admin/sites",    icon: MapPin,   label: "潛點管理", color: "#f472b6" },
  { href: "/admin/vip-tiers",icon: Star,     label: "VIP 設定", color: "#fbbf24" },
  { href: "/admin/broadcast",icon: Megaphone,label: "群發通知", color: "#fb923c" },
  { href: "/admin/reports",  icon: BarChart2,label: "報表",     color: "#4ade80" },
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
      .catch(e => setErr(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell title="總覽">
      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm" style={subStyle}>載入中...</div>
      ) : err ? (
        <div className="rounded-xl p-5 text-sm" style={{ ...cardStyle, color: "var(--color-coral)" }}>{err}</div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Pending proofs alert */}
          {stats.pendingProofs > 0 && (
            <button
              onClick={() => router.push("/admin/bookings")}
              className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:opacity-90"
              style={{ background: "rgba(255,123,90,0.15)", border: "1px solid rgba(255,123,90,0.4)" }}
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: "var(--color-coral)" }} />
              <span className="font-semibold" style={{ color: "var(--color-coral)" }}>
                {stats.pendingProofs} 筆付款待審核
              </span>
              <span className="text-sm" style={subStyle}>→ 前往訂單管理</span>
            </button>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "總收入", value: `NT$ ${stats.revenue.paid.toLocaleString()}`, sub: `預計 ${stats.revenue.booked.toLocaleString()}` },
              { label: "會員總數", value: stats.users.total.toString(), sub: `客戶 ${stats.users.customers} / 教練 ${stats.users.coaches}` },
              { label: "可預約場次", value: stats.trips.bookable.toString(), sub: `潛水團 ${stats.tours.bookable}` },
              { label: "進行中訂單", value: stats.bookings.active.toString(), sub: `共 ${stats.bookings.total} 筆` },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl p-4" style={cardStyle}>
                <div className="text-xs mb-1" style={subStyle}>{label}</div>
                <div className="text-2xl font-bold" style={{ color: "#e6f0ff" }}>{value}</div>
                <div className="text-xs mt-1" style={subStyle}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Shortcut grid */}
          <div className="rounded-xl p-5" style={cardStyle}>
            <h2 className="mb-4 text-sm font-semibold" style={{ color: "rgba(230,240,255,0.6)" }}>快速入口</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {SHORTCUTS.map(({ href, icon: Icon, label, color }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="flex flex-col items-center gap-2 rounded-xl p-4 transition-colors hover:bg-white/10"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <Icon className="h-6 w-6" style={{ color }} />
                  <span className="text-xs" style={{ color: "rgba(230,240,255,0.7)" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
