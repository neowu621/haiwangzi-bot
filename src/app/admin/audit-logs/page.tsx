"use client";
import React, { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toTaipeiDateTimeString } from "@/lib/utils";

interface AuditLog {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
}

const ROLE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  admin:    { label: "管理員", color: "#7c3aed", bg: "#f3e8ff" },
  boss:     { label: "老闆",   color: "#dc2626", bg: "#fee2e2" },
  coach:    { label: "教練",   color: "#0891b2", bg: "#cffafe" },
  customer: { label: "會員",   color: "#475569", bg: "#f1f5f9" },
};

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


function formatDate(iso: string) {
  return toTaipeiDateTimeString(iso);
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
                  : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Actor search */}
          <Input
            className="h-8 text-sm"
            placeholder="搜尋操作者 ID..."
            value={actorFilter}
            onChange={e => { setActorFilter(e.target.value); setPage(1); }}
            style={{ width: 180 }}
          />

          <Button size="sm" variant="outline" onClick={load} disabled={loading} style={{ height: 32 }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Stats */}
        {data && (
          <div className="text-xs text-[var(--muted-foreground)]">
            共 {data.total.toLocaleString()} 筆紀錄，第 {data.page} / {data.pages} 頁
          </div>
        )}

        {/* Log table */}
        {loading && !data ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                  {["時間", "操作者", "操作", "對象類型", "對象", "詳情"].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.logs.map((log, i) => (
                  <React.Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className={`cursor-pointer border-t transition-colors hover:bg-[var(--muted)]/40 ${i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20"}`}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--muted-foreground)]">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        {log.actorId === "system" || !log.actorId ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            🤖 系統
                          </span>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-slate-800">{log.actorName ?? "（未知）"}</span>
                              {log.actorRole && ROLE_LABEL[log.actorRole] && (
                                <span className="rounded px-1 py-0.5 text-[9px] font-bold"
                                  style={{ color: ROLE_LABEL[log.actorRole].color, background: ROLE_LABEL[log.actorRole].bg }}>
                                  {ROLE_LABEL[log.actorRole].label}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[9px] text-slate-400">{log.actorId.slice(0, 10)}…</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-[var(--foreground)]">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted-foreground)]">
                        {log.targetType ? TARGET_TYPE_LABELS[log.targetType] ?? log.targetType : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs text-[var(--foreground)]">{log.targetLabel ?? "—"}</div>
                        {log.targetId && <div className="font-mono text-[10px] text-[var(--muted-foreground)]">{log.targetId.slice(0, 16)}…</div>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--muted-foreground)]">
                        {log.metadata ? "點擊展開 ▾" : "—"}
                      </td>
                    </tr>
                    {expandedId === log.id && log.metadata && (
                      <tr className="bg-slate-50">
                        <td colSpan={6} className="px-4 py-3">
                          <MetadataDisplay metadata={log.metadata} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {(!data || data.logs.length === 0) && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
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
              style={{ height: 32, width: 32, padding: 0 }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-[var(--muted-foreground)]">{page} / {data.pages}</span>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages || loading}
              style={{ height: 32, width: 32, padding: 0 }}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

// v200：metadata 改用 key-value table + 高對比配色
const META_KEY_LABELS: Record<string, string> = {
  notes: "客戶備註",
  siteNotes: "網站備註",
  adminNotes: "管理備註",
  paidAmount: "已付金額",
  totalAmount: "總金額",
  participants: "參加人數",
  paymentMethod: "付款方式",
  paymentStatus: "付款狀態",
  status: "訂單狀態",
  refundAmount: "退款金額",
  refundMethod: "退款方式",
  reason: "原因",
  amount: "金額",
  method: "方式",
  title: "標題",
  date: "日期",
  startTime: "時間",
  capacity: "容量",
  basePrice: "基本費用",
  deposit: "訂金",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "現場支付", bank: "銀行轉帳", linepay: "LINE Pay", other: "其他",
};
const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "未付款", deposit_paid: "已付訂金", fully_paid: "已付清",
  refunding: "退款中", refunded: "已退款",
};
const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "待確認", confirmed: "已確認", completed: "已完成",
  no_show: "未到場", cancelled_by_user: "客戶取消", cancelled_by_weather: "天氣取消",
};

function formatValue(key: string, val: unknown): React.ReactNode {
  if (val === null || val === undefined) return <span className="italic text-slate-400">空值</span>;
  if (typeof val === "boolean") return val ? "✓ 是" : "✗ 否";
  if (typeof val === "number") {
    if (/amount|price|deposit/i.test(key)) return <span className="font-mono font-bold">NT$ {val.toLocaleString()}</span>;
    return <span className="font-mono">{val.toLocaleString()}</span>;
  }
  if (typeof val === "string") {
    if (key === "paymentMethod") return PAYMENT_METHOD_LABELS[val] ?? val;
    if (key === "paymentStatus") return PAYMENT_STATUS_LABELS[val] ?? val;
    if (key === "status") return BOOKING_STATUS_LABELS[val] ?? val;
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) return <span className="font-mono">{val}</span>;
    return val;
  }
  return <pre className="text-[11px] font-mono whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>;
}

function MetadataDisplay({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return <span className="text-xs text-slate-500">（無詳情）</span>;
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        詳細變更內容（{entries.length} 個欄位）
      </div>
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([k, v], i) => (
            <tr key={k} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
              <td className="px-3 py-1.5 font-semibold text-slate-700 w-32 align-top whitespace-nowrap border-r border-slate-100">
                {META_KEY_LABELS[k] ?? k}
                <span className="block font-mono text-[9px] font-normal text-slate-400">{k}</span>
              </td>
              <td className="px-3 py-1.5 text-slate-800">
                {formatValue(k, v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
