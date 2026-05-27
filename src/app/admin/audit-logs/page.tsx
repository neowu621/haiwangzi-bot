"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditLog {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
}

interface ApiResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// 操作類型的中文說明
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "🔑 登入",
  "auth.password_set": "🔐 設定密碼",
  "auth.password_reset": "🔄 重設密碼",
  "booking.update": "📝 修改訂單",
  "booking.cancel": "❌ 取消訂單",
  "booking.delete": "🗑️ 刪除訂單",
  "booking.refund": "💸 退費",
  "credit.grant": "🎁 發放禮金",
  "credit.deduct": "➖ 扣除禮金",
  "trip.create": "✨ 建立場次",
  "trip.update": "📝 修改場次",
  "trip.cancel": "❌ 取消場次",
  "trip.delete": "🗑️ 刪除場次",
  "tour.create": "✨ 建立潛水團",
  "tour.update": "📝 修改潛水團",
  "tour.delete": "🗑️ 刪除潛水團",
  "user.update": "👤 修改會員",
  "user.delete": "🗑️ 刪除會員",
  "coach.create": "✨ 新增教練",
  "coach.update": "📝 修改教練",
  "coach.delete": "🗑️ 刪除教練",
  "site.create": "✨ 新增潛點",
  "site.update": "📝 修改潛點",
  "site.delete": "🗑️ 刪除潛點",
  "config.update": "⚙️ 修改系統設定",
  "vip_tiers.update": "⭐ 修改 VIP 設定",
  "vip_tiers.reset": "🔄 還原 VIP 預設",
  "broadcast.send": "📣 群發通知",
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  booking: "訂單", trip: "場次", tour: "潛水團",
  user: "會員", coach: "教練", site: "潛點",
  config: "設定", broadcast: "群發",
};

const cardStyle: React.CSSProperties = {
  background: "var(--color-ocean-surface)",
  border: "1px solid rgba(255,255,255,0.1)",
};
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };
const inputCls = "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)] h-8 text-sm";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

const ACTION_CATEGORIES = [
  { label: "全部", value: "" },
  { label: "登入", value: "auth" },
  { label: "訂單", value: "booking" },
  { label: "禮金", value: "credit" },
  { label: "場次", value: "trip" },
  { label: "潛水團", value: "tour" },
  { label: "會員", value: "user" },
  { label: "教練/潛點", value: "coach" },
  { label: "設定", value: "config" },
  { label: "群發", value: "broadcast" },
];

export default function AuditLogsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: "50" });
      if (actionFilter) params.set("action", actionFilter);
      if (actorFilter) params.set("actorId", actorFilter);
      const result = await adminFetch<ApiResponse>(`/api/admin/audit-logs?${params}`);
      setData(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, actorFilter]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(action: string) {
    setActionFilter(action);
    setPage(1);
  }

  return (
    <AdminShell>
      <div className="space-y-4">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Action category filter */}
          <div className="flex flex-wrap gap-1">
            {ACTION_CATEGORIES.map(cat => (
              <button key={cat.value} onClick={() => handleFilterChange(cat.value)}
                className="rounded-full px-2.5 py-1 text-xs transition-colors"
                style={actionFilter === cat.value
                  ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                  : { background: "rgba(255,255,255,0.08)", color: "rgba(230,240,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Actor search */}
          <Input
            className={inputCls}
            placeholder="搜尋操作者 ID..."
            value={actorFilter}
            onChange={e => { setActorFilter(e.target.value); setPage(1); }}
            style={{ width: 180 }}
          />

          <Button size="sm" variant="outline" onClick={load} disabled={loading}
            style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(230,240,255,0.7)", height: 32 }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Stats */}
        {data && (
          <div className="text-xs" style={subStyle}>
            共 {data.total.toLocaleString()} 筆紀錄，第 {data.page} / {data.pages} 頁
          </div>
        )}

        {/* Log table */}
        {loading && !data ? (
          <div className="flex h-40 items-center justify-center text-sm" style={subStyle}>載入中...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={cardStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {["時間", "操作者", "操作", "對象類型", "對象", "詳情"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={subStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log, i) => (
                  <>
                    <tr
                      key={log.id}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className="cursor-pointer transition-colors hover:bg-white/5"
                      style={{ borderBottom: i < (data.logs.length - 1) ? "1px solid rgba(255,255,255,0.05)" : undefined }}
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px]" style={subStyle}>{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-xs" style={{ color: "#e6f0ff" }}>{log.actorName ?? "—"}</div>
                        {log.actorId && <div className="font-mono text-[10px]" style={subStyle}>{log.actorId.slice(0, 14)}…</div>}
                      </td>
                      <td className="px-4 py-2.5 text-sm" style={{ color: "#e6f0ff" }}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={subStyle}>
                        {log.targetType ? TARGET_TYPE_LABELS[log.targetType] ?? log.targetType : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs" style={{ color: "#e6f0ff" }}>{log.targetLabel ?? "—"}</div>
                        {log.targetId && <div className="font-mono text-[10px]" style={subStyle}>{log.targetId.slice(0, 16)}…</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={subStyle}>
                        {log.metadata ? "點擊展開 ▾" : "—"}
                      </td>
                    </tr>
                    {expandedId === log.id && log.metadata && (
                      <tr key={`${log.id}-detail`} style={{ background: "rgba(255,255,255,0.03)" }}>
                        <td colSpan={6} className="px-4 py-3">
                          <pre className="overflow-x-auto rounded-lg p-3 text-[11px] font-mono"
                            style={{ background: "rgba(0,0,0,0.3)", color: "var(--color-phosphor)", maxHeight: 200 }}>
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {(!data || data.logs.length === 0) && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={subStyle}>
                    {loading ? "載入中..." : "沒有操作紀錄"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(230,240,255,0.7)", height: 32, width: 32, padding: 0 }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm" style={subStyle}>{page} / {data.pages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages || loading}
              style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(230,240,255,0.7)", height: 32, width: 32, padding: 0 }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
