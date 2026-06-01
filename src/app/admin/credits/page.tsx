"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreditTx {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  balanceAfter: number;
  createdBy: string | null;
  expiresAt: string | null;
  createdAt: string;
  user?: { displayName: string; realName: string | null; code: string | null };
}

interface Stats {
  totalGranted: number;
  totalUsed: number;
  circulating: number;
  expiringSoon: number;
  expired: number;
}

const REASON_LABEL: Record<string, string> = {
  birthday: "🎂 生日禮金",
  vip_upgrade: "⭐ VIP 升等",
  admin_adjust: "🛠 管理員調整",
  refund: "💰 退款",
  used: "🛒 使用",
};

export default function CreditsPage() {
  const [txs, setTxs] = useState<CreditTx[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (reasonFilter !== "all") qs.set("reason", reasonFilter);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("limit", "500");
      const r = await adminFetch<{ txs: CreditTx[]; stats: Stats }>(
        `/api/admin/credits?${qs.toString()}`,
      );
      setTxs(r.txs);
      setStats(r.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [reasonFilter, from, to]);

  function expiryStatus(tx: CreditTx): { label: string; color: string } | null {
    if (tx.amount <= 0) return null; // 扣款沒到期日
    if (!tx.expiresAt) return { label: "永不過期", color: "#64748b" };
    const days = Math.floor((new Date(tx.expiresAt).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `已過期 ${-days} 天`, color: "#dc2626" };
    if (days <= 30) return { label: `${days} 天內到期`, color: "#d97706" };
    return { label: `${days} 天後到期`, color: "#16a34a" };
  }

  return (
    <AdminShell title="禮金管理">
      <div className="space-y-4">
        {/* 統計卡 */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard title="總發放" value={stats.totalGranted} color="#16a34a" />
            <StatCard title="總使用" value={stats.totalUsed} color="#0891b2" />
            <StatCard title="目前流通" value={stats.circulating} color="#0a2342" />
            <StatCard title="30 天內到期" value={stats.expiringSoon} color="#d97706" unit="筆" />
            <StatCard title="已過期" value={stats.expired} color="#dc2626" unit="筆" />
          </div>
        )}

        {/* Filters */}
        <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">名義類別</Label>
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="all">全部</option>
                <option value="birthday">生日禮金</option>
                <option value="vip_upgrade">VIP 升等</option>
                <option value="admin_adjust">管理員調整</option>
                <option value="refund">退款</option>
                <option value="used">使用</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">起</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inline-block ml-2 w-36" />
            </div>
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">迄</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inline-block ml-2 w-36" />
            </div>
            <span className="ml-auto text-xs text-[var(--muted-foreground)]">共 {txs.length} 筆</span>
          </div>
        </div>

        {err && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">{err}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">時間</th>
                    <th className="px-3 py-2 font-medium">會員</th>
                    <th className="px-3 py-2 font-medium">類別</th>
                    <th className="px-3 py-2 font-medium">名義</th>
                    <th className="px-3 py-2 font-medium text-right">金額</th>
                    <th className="px-3 py-2 font-medium text-right">餘額</th>
                    <th className="px-3 py-2 font-medium">到期</th>
                    <th className="px-3 py-2 font-medium text-[10px]">經辦人</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t, i) => {
                    const exp = expiryStatus(t);
                    return (
                      <tr key={t.id} className="border-t" style={{
                        borderColor: "var(--border)",
                        background: i % 2 === 0 ? "#ffffff" : "rgba(240,242,245,0.4)",
                      }}>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          {new Date(t.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }).slice(0, 16)}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          <span className="font-semibold">{t.user?.realName ?? t.user?.displayName ?? "—"}</span>
                          {t.user?.code && <span className="ml-1 text-[10px] text-[var(--muted-foreground)] font-mono">{t.user.code}</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          <Badge variant="muted" className="text-[10px]">
                            {REASON_LABEL[t.reason] ?? t.reason}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-xs truncate">{t.note ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: t.amount > 0 ? "#16a34a" : "#dc2626" }}>
                          {t.amount > 0 ? "+" : ""}NT$ {t.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs whitespace-nowrap text-[var(--muted-foreground)]">
                          NT$ {t.balanceAfter.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-[10px]" style={{ color: exp?.color ?? "var(--muted-foreground)" }}>
                          {exp ? exp.label : "—"}
                          {t.expiresAt && (
                            <div className="text-[9px] opacity-70">
                              {new Date(t.expiresAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-[10px] text-[var(--muted-foreground)] font-mono whitespace-nowrap">
                          {t.createdBy ? t.createdBy.slice(0, 8) + "..." : "系統"}
                        </td>
                      </tr>
                    );
                  })}
                  {txs.length === 0 && (
                    <tr><td colSpan={8} className="py-12 text-center text-sm text-[var(--muted-foreground)]">無資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function StatCard({ title, value, color, unit = "" }: { title: string; value: number; color: string; unit?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{title}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>
        {unit ? value : `NT$ ${value.toLocaleString()}`}
        {unit && <span className="ml-1 text-xs">{unit}</span>}
      </div>
    </div>
  );
}
