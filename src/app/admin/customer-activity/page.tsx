"use client";
/**
 * v334: 前台客戶活動紀錄
 *
 * 顯示 audit_log where actor_role='customer' 的所有紀錄
 * 含 IP / User Agent / metadata，方便老闆查證
 */
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Row {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  user: { lineUserId: string; displayName: string; realName: string | null; phone: string | null } | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: unknown;
}

// 動作 → 中文 + emoji
const ACTION_LABELS: Record<string, { label: string; emoji: string; group: string }> = {
  "customer.login":                  { label: "LIFF 登入",      emoji: "🔐", group: "login" },
  "customer.view.product":           { label: "瀏覽產品",       emoji: "👀", group: "view" },
  "customer.booking.create":         { label: "建立預約",       emoji: "📋", group: "booking" },
  "customer.booking.update":         { label: "修改預約",       emoji: "📋", group: "booking" },
  "customer.booking.cancel":         { label: "取消預約",       emoji: "📋", group: "booking" },
  "customer.payment_proof.upload":   { label: "上傳付款證明",   emoji: "💰", group: "payment" },
  "customer.pay_link.open":          { label: "開啟付款連結",   emoji: "💰", group: "payment" },
  "customer.refund.request":         { label: "申請退款",       emoji: "💸", group: "refund" },
  "customer.refund.decide":          { label: "回覆退款方案",   emoji: "💸", group: "refund" },
  "customer.wish.create":            { label: "提出願望單",     emoji: "📝", group: "wish" },
  "customer.wish.reply":             { label: "回覆願望單",     emoji: "📝", group: "wish" },
  "customer.wish.cancel":            { label: "取消願望單",     emoji: "📝", group: "wish" },
  "customer.profile.update":         { label: "修改個人資料",   emoji: "👤", group: "profile" },
  "customer.email.verify":           { label: "驗證 Email",     emoji: "👤", group: "profile" },
  "customer.terms.sign":             { label: "簽署同意聲明",   emoji: "👤", group: "profile" },
};

const FILTER_CHIPS = [
  { key: "all",     label: "全部" },
  { key: "login",   label: "🔐 登入" },
  { key: "view",    label: "👀 瀏覽" },
  { key: "booking", label: "📋 訂單" },
  { key: "payment", label: "💰 付款" },
  { key: "refund",  label: "💸 退款" },
  { key: "wish",    label: "📝 願望單" },
  { key: "profile", label: "👤 個資" },
];

const DATE_CHIPS = [
  { key: "today",  label: "今天" },
  { key: "3days",  label: "3 天內" },
  { key: "7days",  label: "7 天內" },
  { key: "30days", label: "30 天內" },
  { key: "all",    label: "全部" },
];

function shortAction(a: string): { label: string; emoji: string; group: string } {
  return ACTION_LABELS[a] ?? { label: a, emoji: "•", group: "other" };
}

function formatTime(s: string): string {
  return new Date(s).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CustomerActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterDate, setFilterDate] = useState("7days");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (filterGroup !== "all") params.set("action", `customer.${filterGroup}.*`);
      if (filterDate !== "all") {
        const days = filterDate === "today" ? 0 : filterDate === "3days" ? 3 : filterDate === "7days" ? 7 : 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        from.setHours(0, 0, 0, 0);
        params.set("from", from.toISOString());
      }
      const r = await adminFetch<{ total: number; rows: Row[] }>(`/api/admin/customer-activity?${params}`);
      let filtered = r.rows ?? [];
      if (search.trim()) {
        const k = search.trim().toLowerCase();
        filtered = filtered.filter((row) =>
          (row.user?.realName ?? "").toLowerCase().includes(k) ||
          (row.user?.displayName ?? "").toLowerCase().includes(k) ||
          (row.user?.phone ?? "").includes(k) ||
          (row.actorId ?? "").includes(k),
        );
      }
      setRows(filtered);
      setTotal(r.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterGroup, filterDate, page]);

  return (
    <AdminShell title="前台活動紀錄">
      <div className="space-y-3 mb-4">
        {/* 日期 filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] w-16">時間：</span>
          {DATE_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setFilterDate(key); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                filterDate === key
                  ? "bg-[var(--color-ocean-deep)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 動作 filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] w-16">動作：</span>
          {FILTER_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setFilterGroup(key); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                filterGroup === key
                  ? "bg-[var(--color-ocean-deep)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 客戶搜尋 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)] w-16">客戶：</span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
            placeholder="姓名 / 電話 / LINE userId"
            className="max-w-xs"
          />
          <Button size="sm" variant="outline" onClick={() => void load()}>🔍 搜尋</Button>
          <Button size="sm" variant="outline" onClick={() => { setSearch(""); void load(); }}>清除</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                <th className="px-3 py-2.5 font-medium">時間</th>
                <th className="px-3 py-2.5 font-medium">客戶</th>
                <th className="px-3 py-2.5 font-medium">動作</th>
                <th className="px-3 py-2.5 font-medium">目標</th>
                <th className="px-3 py-2.5 font-medium">IP</th>
                <th className="px-3 py-2.5 font-medium text-right">詳情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-sm text-[var(--muted-foreground)]">沒有符合條件的活動紀錄</td></tr>
              ) : rows.map((r) => {
                const meta = shortAction(r.action);
                return (
                  <tr key={r.id} className="border-t hover:bg-sky-50" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] tabular text-[var(--muted-foreground)]">
                      {formatTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.user ? (
                        <button
                          type="button"
                          onClick={() => setOpenCustomerId(r.user!.lineUserId)}
                          className="text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                        >
                          {r.user.realName ?? r.user.displayName}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">{r.actorName ?? r.actorId ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant="muted" className="text-[10px]">
                        {meta.emoji} {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {r.targetLabel ? (
                        <span className="font-mono rounded bg-teal-50 px-1.5 py-0.5 text-teal-800 text-[10px]">
                          {r.targetLabel}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] tabular text-[var(--muted-foreground)]">
                      {r.actorIp ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="text-[11px] text-[var(--color-ocean-deep)] underline hover:no-underline"
                      >
                        看詳情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分頁 */}
      {total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-[var(--muted-foreground)]">
            共 {total} 筆，第 {page} / {Math.ceil(total / PAGE_SIZE)} 頁
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ 上一頁</Button>
            <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>下一頁 ›</Button>
          </div>
        </div>
      )}

      {/* 客戶詳情 modal (全站統一) */}
      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />

      {/* 紀錄詳情 modal */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>活動紀錄詳情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-xs">
              <Row k="時間" v={new Date(detail.createdAt).toLocaleString("zh-TW")} />
              <Row k="動作" v={`${shortAction(detail.action).emoji} ${shortAction(detail.action).label}（${detail.action}）`} />
              <Row k="客戶" v={detail.user ? `${detail.user.realName ?? detail.user.displayName} (${detail.user.lineUserId.slice(0, 20)}...)` : detail.actorId ?? "—"} />
              <Row k="IP" v={detail.actorIp ?? "—"} />
              <Row k="User Agent" v={detail.actorUserAgent ?? "—"} />
              <Row k="目標" v={`${detail.targetType ?? "—"} ${detail.targetLabel ?? detail.targetId ?? ""}`} />
              <div>
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">Metadata</div>
                <pre className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] overflow-x-auto">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <div className="text-[10px] text-[var(--muted-foreground)] pt-0.5">{k}</div>
      <div className="text-xs break-all">{v}</div>
    </div>
  );
}
