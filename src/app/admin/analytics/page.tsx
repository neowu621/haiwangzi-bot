"use client";
// v580：後台「網站分析」— 把 GA4(近 30 天) 的訪客趨勢 / 熱門頁 / 來源 / 裝置嵌進後台。
//   走 OAuth refresh token（/api/admin/ga/*），不需服務帳戶金鑰。
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { RotateCw, Plug, Unplug, ExternalLink, BarChart3 } from "lucide-react";

interface TrendPt { date: string; users: number; views: number }
interface NameVal { label: string; users?: number; views?: number }
interface Insights {
  trend: TrendPt[];
  topPages: Array<{ label: string; views: number }>;
  sources: Array<{ label: string; users: number }>;
  devices: Array<{ label: string; users: number }>;
  range: string;
}
interface Resp {
  connected: boolean;
  needProperty?: boolean;
  propertyId?: string;
  insights?: Insights;
  error?: string;
}

export default function AnalyticsPage() {
  const { ready } = useAdminAuth();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [propInput, setPropInput] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback((force = false) => {
    setLoading(true);
    adminFetch<Resp>(`/api/admin/ga/insights${force ? "?force=1" : ""}`)
      .then((d) => setData(d))
      .catch((e) => setData({ connected: false, error: e instanceof Error ? e.message : "載入失敗" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!ready) return;
    // 處理 callback 導回的 ?ga=...
    try {
      const q = new URLSearchParams(window.location.search).get("ga");
      if (q === "ok") setNote("✅ GA 已連接");
      else if (q === "need_property") setNote("已連接，但需要手動填 GA4 資源 ID");
      else if (q && q.startsWith("err")) setNote(`連接失敗：${decodeURIComponent(q.replace(/^err_?/, ""))}`);
      if (q) window.history.replaceState(null, "", "/admin/analytics");
    } catch { /* ignore */ }
    load();
  }, [ready, load]);

  async function connect() {
    setBusy(true);
    try {
      const { url } = await adminFetch<{ url: string }>("/api/admin/ga/connect");
      window.location.href = url;
    } catch (e) {
      setNote(e instanceof Error ? e.message : "無法開始連接");
      setBusy(false);
    }
  }

  async function saveProperty() {
    const id = propInput.replace(/[^\d]/g, "");
    if (!id) { setNote("請輸入數字資源 ID"); return; }
    setBusy(true);
    try {
      await adminFetch("/api/admin/ga/property", { method: "POST", body: JSON.stringify({ propertyId: id }) });
      setNote("✅ 已儲存資源 ID");
      setPropInput("");
      load(true);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("確定要中斷 GA 連線？（會刪除授權，之後可重新連接）")) return;
    setBusy(true);
    try {
      await adminFetch("/api/admin/ga/property", { method: "DELETE" });
      setNote("已中斷連線");
      load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "中斷失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="網站分析">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <BarChart3 className="h-4 w-4" /> 來源：Google Analytics（近 30 天）
          </div>
          <div className="flex items-center gap-2">
            {data?.connected && data.insights && (
              <button onClick={() => load(true)} disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> 重新整理
              </button>
            )}
            {data?.connected && (
              <button onClick={disconnect} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50">
                <Unplug className="h-3.5 w-3.5" /> 中斷連線
              </button>
            )}
          </div>
        </div>

        {note && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm text-cyan-800">{note}</div>
        )}

        {loading && !data && (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">載入中...</div>
        )}

        {/* 未連接 */}
        {data && !data.connected && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <Plug className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <div className="mb-1 text-base font-bold text-slate-800">尚未連接 Google Analytics</div>
            <p className="mx-auto mb-5 max-w-md text-sm text-slate-500">
              連接後即可在這裡看到網站的訪客趨勢、熱門頁面、流量來源與裝置（近 30 天），不必再跳去 GA 網站。
            </p>
            <button onClick={connect} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"
              style={{ background: "#0891b2" }}>
              <Plug className="h-4 w-4" /> {busy ? "開啟中..." : "連接 Google Analytics"}
            </button>
            {data.error && <div className="mt-4 text-xs text-rose-500">{data.error}</div>}
          </div>
        )}

        {/* 已連接但缺資源 ID */}
        {data?.connected && data.needProperty && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <div className="mb-1 text-base font-bold text-amber-900">已授權，請填入 GA4 資源 ID</div>
            <p className="mb-4 text-sm text-amber-800">
              自動偵測不到資源 ID（可能未開 Admin API）。到 analytics.google.com → 管理 → 資源設定 →「資源 ID」是一串數字，貼進來即可。
            </p>
            <div className="flex gap-2">
              <input value={propInput} onChange={(e) => setPropInput(e.target.value)}
                placeholder="例：123456789" inputMode="numeric"
                className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none" />
              <button onClick={saveProperty} disabled={busy}
                className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: "#d97706" }}>
                儲存
              </button>
            </div>
          </div>
        )}

        {/* 連線但 GA 讀取錯誤 */}
        {data?.connected && !data.needProperty && data.error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            讀取 GA 失敗：{data.error}
            <div className="mt-1 text-xs text-rose-500">若顯示權限/scope 問題，請按「中斷連線」後重新連接並同意所有權限。</div>
          </div>
        )}

        {/* 數據 */}
        {data?.insights && <InsightsView ins={data.insights} />}
      </div>
    </AdminShell>
  );
}

function InsightsView({ ins }: { ins: Insights }) {
  const totalUsers = ins.trend.reduce((a, d) => a + d.users, 0);
  const totalViews = ins.trend.reduce((a, d) => a + d.views, 0);
  const maxUsers = Math.max(1, ...ins.trend.map((d) => d.users));

  return (
    <div className="space-y-4">
      {/* KPI + 趨勢 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <div className="text-3xl font-bold tabular-nums text-slate-900">{totalUsers.toLocaleString()}</div>
            <div className="text-xs text-slate-500">近 30 天訪客</div>
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums" style={{ color: "#0891b2" }}>{totalViews.toLocaleString()}</div>
            <div className="text-xs text-slate-500">近 30 天瀏覽</div>
          </div>
          <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#0891b2" }}>
            GA 完整報表 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {/* 30 天每日訪客長條 */}
        <div className="flex h-24 items-end gap-[3px]">
          {ins.trend.map((d) => (
            <div key={d.date} className="group relative flex-1" title={`${d.date}：${d.users} 訪客 / ${d.views} 瀏覽`}>
              <div className="w-full rounded-t" style={{ height: `${Math.max(2, (d.users / maxUsers) * 96)}px`, background: "#67e8f9" }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{ins.trend[0]?.date}</span>
          <span>{ins.trend[ins.trend.length - 1]?.date}</span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RankCard title="熱門頁面" rows={ins.topPages.map((p) => ({ label: p.label, val: p.views }))} unit="次" color="#0891b2" />
        <RankCard title="流量來源" rows={ins.sources.map((s) => ({ label: s.label, val: s.users }))} unit="人" color="#7c3aed" />
        <RankCard title="裝置" rows={ins.devices.map((d) => ({ label: deviceLabel(d.label), val: d.users }))} unit="人" color="#16a34a" />
      </div>
    </div>
  );
}

function deviceLabel(s: string): string {
  return s === "mobile" ? "手機" : s === "desktop" ? "電腦" : s === "tablet" ? "平板" : s;
}

function RankCard({ title, rows, unit, color }: { title: string; rows: Array<{ label: string; val: number }>; unit: string; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.val));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</div>
      {rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">尚無資料</div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-slate-700" title={r.label}>{r.label}</span>
                <span className="flex-shrink-0 font-mono text-xs font-bold tabular-nums text-slate-900">
                  {r.val.toLocaleString()}<span className="ml-0.5 text-[10px] font-normal text-slate-400">{unit}</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${(r.val / max) * 100}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
