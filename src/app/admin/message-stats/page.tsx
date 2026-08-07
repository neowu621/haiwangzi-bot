"use client";
/**
 * v1039：訊息成效
 *
 * 「訊息模板」管的是文案長什麼樣；這頁回答的是文案有沒有用 ——
 * 發了幾封、失敗幾封、站內有多少人打開、多少人真的按下按鈕。
 */
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

interface Cell { sent: number; failed: number }
interface Row {
  key: string; label: string; group: string; icon: string;
  line: Cell; email: Cell; inapp: Cell;
  inappTotal: number; read: number; clicked: number;
  totalSent: number; totalFailed: number;
  readRate: number | null; clickRate: number | null;
}
interface Data {
  days: number;
  clickTracking: boolean;
  totals: { sent: number; failed: number; inapp: number; read: number; clicked: number; readRate: number | null; clickRate: number | null };
  rows: Row[];
}

const RANGES = [7, 30, 90] as const;

export default function MessageStatsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    adminFetch<Data>(`/api/admin/message-stats?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <AdminShell title="訊息成效">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">統計範圍</span>
          <div className="inline-flex rounded-lg bg-[var(--muted)] p-0.5">
            {RANGES.map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${days === d ? "bg-white text-[var(--color-ocean-deep)] shadow-sm" : "text-[var(--muted-foreground)]"}`}>
                近 {d} 天
              </button>
            ))}
          </div>
        </div>

        {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">{err}</div>}
        {loading && <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">載入中…</div>}

        {data && !loading && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="總發送" value={data.totals.sent} unit="則" hint="LINE + Email + 站內" />
              <Stat label="發送失敗" value={data.totals.failed} unit="則" hot={data.totals.failed > 0} hint={data.totals.failed > 0 ? "去「發送紀錄」看原因" : "全部送達"} />
              <Stat label="站內已讀率" value={data.totals.readRate} unit="%" accent hint={`${data.totals.read} / ${data.totals.inapp} 則被打開`} />
              <Stat label="站內點擊率" value={data.totals.clickRate} unit="%" accent hint={`${data.totals.clicked} / ${data.totals.inapp} 則按了按鈕`} />
            </div>

            {!data.clickTracking && (
              <div className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed" style={{ background: "#fff7f2", color: "#8a4a28" }}>
                點擊追蹤自 v1039 起才開始記錄。這段期間還沒有任何點擊資料，點擊率的 0% 代表「尚未累積」，不是文案沒效。過幾天再回來看。
              </div>
            )}

            <section className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
              <h2 className="text-sm font-bold">各模板成效</h2>
              <p className="mt-0.5 mb-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                已讀 / 點擊只有站內通知量得到（LINE 和 Email 的開信行為我們看不到）。點擊率低但已讀率高，通常是按鈕文字不夠明確。
              </p>
              {data.rows.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] text-[var(--muted-foreground)]">這段期間沒有發送紀錄。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b text-[11px] text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                      <tr>
                        <th className="py-1.5 pr-3">模板</th>
                        <th className="py-1.5 pr-3 text-right">LINE</th>
                        <th className="py-1.5 pr-3 text-right">Email</th>
                        <th className="py-1.5 pr-3 text-right">站內</th>
                        <th className="py-1.5 pr-3 text-right">已讀率</th>
                        <th className="py-1.5 text-right">點擊率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                          <td className="py-2 pr-3">
                            <div className="font-medium whitespace-nowrap">{r.icon} {r.label}</div>
                            <div className="text-[10px] text-[var(--muted-foreground)]">{r.group}</div>
                          </td>
                          <ChanCell c={r.line} />
                          <ChanCell c={r.email} />
                          <ChanCell c={r.inapp} />
                          <td className="py-2 pr-3 text-right">
                            <Rate value={r.readRate} sub={r.inappTotal > 0 ? `${r.read}/${r.inappTotal}` : undefined} good={70} />
                          </td>
                          <td className="py-2 text-right">
                            <Rate value={r.clickRate} sub={r.inappTotal > 0 ? `${r.clicked}/${r.inappTotal}` : undefined} good={30} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="pb-4 text-center text-[10.5px] leading-relaxed text-[var(--muted-foreground)]">
              要改文案請到「訊息模板」；要看單筆發送成敗請到「發送紀錄」。
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function ChanCell({ c }: { c: Cell }) {
  if (c.sent === 0 && c.failed === 0) return <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">—</td>;
  return (
    <td className="py-2 pr-3 text-right whitespace-nowrap">
      <span className="tabular font-medium">{c.sent}</span>
      {c.failed > 0 && <span className="ml-1 tabular text-[10px] font-bold" style={{ color: "#b3562c" }}>✕{c.failed}</span>}
    </td>
  );
}

function Rate({ value, sub, good }: { value: number | null; sub?: string; good: number }) {
  if (value == null) return <span className="text-[var(--muted-foreground)]">—</span>;
  return (
    <div className="whitespace-nowrap">
      <span className="tabular text-sm font-extrabold" style={{ color: value >= good ? "#0a8f86" : value > 0 ? undefined : "var(--muted-foreground)" }}>
        {value}%
      </span>
      {sub && <div className="tabular text-[10px] text-[var(--muted-foreground)]">{sub}</div>}
    </div>
  );
}

function Stat({ label, value, unit, hint, accent, hot }: { label: string; value: number | null; unit: string; hint?: string; accent?: boolean; hot?: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: hot ? "#f0b48c" : "var(--border)", background: hot ? "#fff7f2" : "#fff" }}>
      <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
      <div className="font-mono text-[21px] font-extrabold leading-tight tabular-nums" style={{ color: hot ? "#b3562c" : accent ? "var(--color-ocean-deep)" : undefined }}>
        {value == null ? "—" : value.toLocaleString()}
        {value != null && <span className="ml-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div>}
    </div>
  );
}
