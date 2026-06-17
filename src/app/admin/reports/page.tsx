"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch, getAdminToken } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw } from "lucide-react";

interface Stats {
  users: { total: number; customers: number; coaches: number; admins: number };
  trips: { total: number; open: number; bookable: number };
  tours: { total: number; open: number; bookable: number };
  bookings: { total: number; active: number };
  revenue: { paid: number; booked: number };
  pendingProofs: number;
}

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1 text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color ?? "var(--foreground)" }}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--muted-foreground)]">{sub}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<Stats>("/api/admin/stats");
      setStats(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const token = getAdminToken();
      const res = await fetch("/api/admin/bookings/csv", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "下載失敗");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--foreground)]">營運統計</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              重新整理
            </Button>
            <Button size="sm" style={primaryBtn} onClick={downloadCsv} disabled={downloading}>
              <Download className="mr-1.5 h-4 w-4" />
              {downloading ? "下載中..." : "匯出訂單 CSV"}
            </Button>
          </div>
        </div>

        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : stats ? (
          <div className="space-y-6">
            {/* Revenue */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">💰 收入</p>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="已收款金額" value={`NT$ ${stats.revenue.paid.toLocaleString()}`} color="var(--color-phosphor)" />
                <StatCard label="預計總收入" value={`NT$ ${stats.revenue.booked.toLocaleString()}`} sub="含未付款訂單" />
              </div>
            </div>

            {/* Users */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">👥 會員</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="總會員數" value={stats.users.total.toString()} />
                <StatCard label="客戶" value={stats.users.customers.toString()} />
                <StatCard label="教練" value={stats.users.coaches.toString()} />
                <StatCard label="管理員" value={stats.users.admins.toString()} />
              </div>
            </div>

            {/* Trips */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">🔱 場次</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard label="日潛場次（總計）" value={stats.trips.total.toString()} />
                <StatCard label="開放中" value={stats.trips.open.toString()} />
                <StatCard label="可預約（未來）" value={stats.trips.bookable.toString()} color="var(--color-phosphor)" />
              </div>
            </div>

            {/* Tours */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">🚢 潛水團</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard label="潛水團（總計）" value={stats.tours.total.toString()} />
                <StatCard label="開放中" value={stats.tours.open.toString()} />
                <StatCard label="可預約（未來）" value={stats.tours.bookable.toString()} color="var(--color-phosphor)" />
              </div>
            </div>

            {/* Bookings */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">📋 訂單</p>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="訂單總數" value={stats.bookings.total.toString()} />
                <StatCard label="進行中訂單" value={stats.bookings.active.toString()} sub="未來場次且未取消" />
              </div>
            </div>

            {/* Pending proofs */}
            {stats.pendingProofs > 0 && (
              <div className="rounded-xl p-4" style={{ background: "rgba(255,123,90,0.1)", border: "1px solid rgba(255,123,90,0.3)" }}>
                <p className="font-semibold" style={{ color: "var(--color-coral)" }}>⚠️ {stats.pendingProofs} 筆付款證明待審核</p>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">請前往「訂單管理」頁面處理</p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
