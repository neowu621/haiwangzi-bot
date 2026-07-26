"use client";
// v903：客服引導問題樹 —— 統計看板。客戶都問什麼、自助解決率、最常轉真人的問題。
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";

interface Row { key: string; label: string; count: number }
interface Stats {
  days: number;
  totals: { category: number; answer: number; resolved: number; escalated: number };
  resolveRate: number | null;
  topQuestions: Row[];
  topEscalated: Row[];
  categories: Row[];
}

const RANGES = [7, 30, 90] as const;

export default function CsTreeStatsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setErr(null);
    adminFetch<Stats>(`/api/admin/cs-tree/stats?days=${days}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [days]);

  const max = (rows: Row[]) => Math.max(1, ...rows.map((r) => r.count));

  return (
    <AdminShell title="客服引導分析">
      <div className="mx-auto max-w-3xl space-y-4">
        {/* 範圍 */}
        <div className="flex items-center gap-2">
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
            {/* 摘要卡 */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="查看答案" value={data.totals.answer} hint="客戶點開問題次數" />
              <Stat label="自助解決率" value={data.resolveRate == null ? "—" : `${data.resolveRate}%`} hint="解決 ÷（解決+轉真人）" accent />
              <Stat label="✅ 解決了" value={data.totals.resolved} hint="點「解決了」" />
              <Stat label="❌ 轉真人" value={data.totals.escalated} hint="點「問老闆」" />
            </div>

            {data.totals.answer === 0 && (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
                這段期間還沒有客戶使用引導問題樹。客戶到「站內訊息 → 常見問題快速解答」點選後，這裡就會有資料。
              </div>
            )}

            {/* 熱門問題 */}
            {data.topQuestions.length > 0 && (
              <Card title="🔥 熱門問題排行" sub="客戶最常點開的問題">
                <BarList rows={data.topQuestions} max={max(data.topQuestions)} color="#13b5a6" />
              </Card>
            )}

            {/* 最常轉真人 */}
            {data.topEscalated.length > 0 && (
              <Card title="⚠️ 最常「轉真人」的問題" sub="代表 FAQ 可能沒講清楚，值得補強或放進場次說明">
                <BarList rows={data.topEscalated} max={max(data.topEscalated)} color="#ff6b5e" />
              </Card>
            )}

            {/* 分類熱度 */}
            {data.categories.length > 0 && (
              <Card title="📂 分類點擊熱度" sub="客戶最常進入的分類">
                <BarList rows={data.categories} max={max(data.categories)} color="#0e4c5a" />
              </Card>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-3.5" style={{ borderColor: "var(--border)" }}>
      <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums" style={{ color: accent ? "#0e9e91" : "var(--foreground)" }}>{value}</div>
      <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{hint}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <div className="mb-3">
        <div className="text-sm font-bold text-[var(--foreground)]">{title}</div>
        {sub && <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function BarList({ rows, max, color }: { rows: Row[]; max: number; color: string }) {
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.key || i} className="flex items-center gap-2">
          <div className="w-5 flex-none text-right text-[11px] font-bold text-[var(--muted-foreground)] tabular-nums">{i + 1}</div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-[var(--foreground)]">{r.label}</span>
              <span className="flex-none text-xs font-bold tabular-nums" style={{ color }}>{r.count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
              <div className="h-full rounded-full" style={{ width: `${Math.max(4, (r.count / max) * 100)}%`, background: color }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
