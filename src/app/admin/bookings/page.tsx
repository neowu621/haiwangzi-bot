"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch, useAdminAuth } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Edit3, X, AlertTriangle, Trash2 } from "lucide-react";
import { cn, weekdayTW, toTaipeiDateString } from "@/lib/utils";

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  else {
    a.addEventListener("abort", abort, { once: true });
    b.addEventListener("abort", abort, { once: true });
  }
  return ctrl.signal;
}

// ── Types ────────────────────────────────────────────────────
interface AdminBooking {
  id: string;
  code?: string | null;
  type: "daily" | "tour";
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  totalAmount: number;
  paidAmount: number;
  participants: number;
  overCapacity?: boolean;
  createdAt: string;
  notes?: string | null;
  siteNotes?: string | null;
  adminNotes?: string | null;
  user: { displayName: string; realName: string | null; phone: string | null };
  ref: {
    date?: string;
    startTime?: string;
    title?: string;
    dateStart?: string;
    dateEnd?: string;
    sites?: string[];
  };
}

// v183: ByTripBooking / ByTripGroup 型別已移除（依場次視圖搬到 /admin/trips）

// ── Helpers ──────────────────────────────────────────────────
function isPastDate(dateStr?: string) {
  if (!dateStr) return false;
  return new Date(dateStr.slice(0, 10)) < new Date(new Date().toDateString());
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  deposit_paid: "已付訂金",
  fully_paid: "已付清",
  refunding: "退款中",
  refunded: "已退款",
};

const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  cancelled_by_user: "客戶取消",
  cancelled_by_weather: "天氣取消",
  completed: "已完成",
  no_show: "未到場",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "現場",
  bank: "轉帳",
  linepay: "LINE Pay",
  other: "其他",
};

function payStatusVariant(s: string): "ocean" | "coral" | "gold" | "muted" {
  if (s === "fully_paid") return "ocean";
  if (s === "refunded" || s === "refunding") return "coral";
  if (s === "deposit_paid") return "gold";
  return "muted";
}

function bookStatusVariant(s: string): "ocean" | "coral" | "muted" {
  if (s === "confirmed" || s === "completed") return "ocean";
  if (s.startsWith("cancelled") || s === "no_show") return "coral";
  return "muted";
}

// ── Main Page ────────────────────────────────────────────────
export default function AdminBookingsPage() {
  const { adminUser } = useAdminAuth();
  const isAdminOrBoss = adminUser?.effectiveRoles.some((r) => r === "admin" || r === "boss") ?? false;

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterPayStatus, setFilterPayStatus] = useState<string>("all");
  const [filterTripKey, setFilterTripKey] = useState<string>("all");
  // v183：訂單管理重構 — 移除『依場次』分頁，加日期區間 filter + 排序 + 分頁
  type SortKey = "date" | "code" | "amount" | "paid" | "status" | "payment";
  const [filterRange, setFilterRange] = useState<"today" | "tomorrow" | "week" | "month" | "all">("week");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
    setPage(1);
  }
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "credit">("credit");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundCreditPct, setRefundCreditPct] = useState<number>(100); // 轉禮金 % (例：110 = 退款金額的 110% 轉禮金)

  // 未到場 dialog
  const [noShowTarget, setNoShowTarget] = useState<AdminBooking | null>(null);
  const [noShowOption, setNoShowOption] = useState<"none" | "cash100" | "credit_custom">("none");
  const [noShowCreditPct, setNoShowCreditPct] = useState<number>(80);
  const [noShowBusy, setNoShowBusy] = useState(false);

  // 完成 quick action
  const [completing, setCompleting] = useState<string | null>(null);

  // 付款憑證
  interface PaymentProof {
    id: string;
    type: "deposit" | "final" | "refund";
    amount: number;
    previewUrl: string | null;
    uploadedAt: string;
    verifiedAt: string | null;
  }
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [proofsLoading, setProofsLoading] = useState(false);

  async function loadProofs(bookingId: string, signal?: AbortSignal) {
    setProofsLoading(true);
    setProofs([]);
    try {
      // 8 秒 timeout 保險
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const merged = signal ? mergeSignals(signal, ctrl.signal) : ctrl.signal;
      const r = await adminFetch<{ proofs: PaymentProof[] }>(
        `/api/admin/payment-proofs?bookingId=${bookingId}`,
        { signal: merged },
      );
      clearTimeout(timer);
      if (signal?.aborted) return;
      setProofs(r.proofs ?? []);
    } catch (e) {
      if (signal?.aborted) return;
      console.error("[load proofs]", e);
    } finally {
      if (!signal?.aborted) setProofsLoading(false);
    }
  }

  async function verifyProof(p: PaymentProof) {
    if (!confirm(`核可此筆 NT$${p.amount.toLocaleString()} 入帳？\n會自動更新 paidAmount + 重算 VIP。`)) return;
    try {
      const r = await adminFetch<{ ok: boolean; newPaid: number; newPaymentStatus: string; newBookingStatus: string }>(
        `/api/admin/payment-proofs/${p.id}/verify`,
        { method: "POST", body: "{}" },
      );
      // 重整 editing + bookings 狀態
      if (editing) {
        setEditing({ ...editing, paidAmount: r.newPaid, paymentStatus: r.newPaymentStatus, status: r.newBookingStatus } as AdminBooking);
        setBookings((arr) => arr.map((x) => x.id === editing.id
          ? { ...x, paidAmount: r.newPaid, paymentStatus: r.newPaymentStatus as AdminBooking["paymentStatus"], status: r.newBookingStatus as AdminBooking["status"] }
          : x));
        await loadProofs(editing.id);
      }
    } catch (e) {
      alert("核可失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function rejectProof(p: PaymentProof) {
    const reason = window.prompt("拒絕原因（必填）：");
    if (!reason) return;
    try {
      await adminFetch(`/api/admin/payment-proofs/${p.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (editing) await loadProofs(editing.id);
    } catch (e) {
      alert("拒絕失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // 編輯 dialog 打開時自動載入付款憑證；關閉或切換 booking 時 abort 舊請求
  useEffect(() => {
    if (!editing) {
      setProofs([]);
      setProofsLoading(false);
      return;
    }
    const ctrl = new AbortController();
    loadProofs(editing.id, ctrl.signal);
    return () => ctrl.abort();
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function quickComplete(b: AdminBooking) {
    if (!confirm(`標記訂單 ${b.code ?? b.id.slice(0, 8)} 為「已完成」？\n\n會：\n• 訂單狀態 → completed\n• 累計潛水次數（按氣瓶數）\n• 重算 VIP 等級${b.paymentMethod === "cash" && b.paidAmount < b.totalAmount ? `\n• 自動補齊現場款 NT$${(b.totalAmount - b.paidAmount).toLocaleString()}` : ""}`)) return;
    setCompleting(b.id);
    try {
      // 1. 若現場付款且未付清 → 先補齊 paidAmount
      if (b.paymentMethod === "cash" && b.paidAmount < b.totalAmount) {
        await adminFetch(`/api/admin/bookings/${b.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            paidAmount: b.totalAmount,
            paymentStatus: "fully_paid",
          }),
        });
      }
      // 2. 標記到場 + VIP 累計
      await adminFetch(`/api/coach/bookings/${b.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action: "completed" }),
      });
      setBookings((arr) => arr.map((x) => x.id === b.id ? {
        ...x,
        status: "completed",
        paidAmount: x.paymentMethod === "cash" ? x.totalAmount : x.paidAmount,
        paymentStatus: x.paymentMethod === "cash" ? "fully_paid" : x.paymentStatus,
      } : x));
    } catch (e) {
      alert("標記完成失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCompleting(null);
    }
  }

  async function doNoShow() {
    if (!noShowTarget) return;
    setNoShowBusy(true);
    try {
      // 1. 標記未到場
      await adminFetch(`/api/coach/bookings/${noShowTarget.id}/attendance`, {
        method: "POST",
        body: JSON.stringify({ action: "no_show" }),
      });
      // 2. 依選項處理已付款
      let paymentStatus = noShowTarget.paymentStatus;
      if (noShowTarget.paidAmount > 0 && noShowOption !== "none") {
        const refundBody: Record<string, unknown> = {
          amount: noShowTarget.paidAmount,
          reason: `未到場退款（${noShowOption === "cash100" ? "退現 100%" : `轉禮金 ${noShowCreditPct}%`}）`,
        };
        if (noShowOption === "cash100") {
          refundBody.method = "cash";
        } else {
          refundBody.method = "credit";
          refundBody.creditAmount = Math.round(noShowTarget.paidAmount * noShowCreditPct / 100);
        }
        await adminFetch(`/api/admin/bookings/${noShowTarget.id}/refund`, {
          method: "POST",
          body: JSON.stringify(refundBody),
        });
        paymentStatus = "refunded";
      }
      setBookings((arr) => arr.map((x) => x.id === noShowTarget.id ? {
        ...x, status: "no_show", paymentStatus,
      } : x));
      setNoShowTarget(null);
      setNoShowOption("none");
    } catch (e) {
      alert("未到場處理失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setNoShowBusy(false);
    }
  }

  useEffect(() => {
    // v183：只載 /api/admin/bookings；by-trip 改放在 /admin/trips 展開
    adminFetch<{ bookings: AdminBooking[] }>("/api/admin/bookings")
      .then((b) => setBookings(b.bookings))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 全部訂單: build unique trip keys for filter
  const tripKeyOptions: { key: string; label: string }[] = [{ key: "all", label: "全部" }];
  const seenKeys = new Set<string>();
  for (const b of bookings) {
    const key =
      b.type === "daily"
        ? `${b.ref.date ?? ""}_${b.ref.startTime ?? ""}`
        : `tour_${b.ref.title ?? ""}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      const label =
        b.type === "daily"
          ? `${b.ref.date ?? ""} ${b.ref.startTime ?? ""} ${(b.ref.sites ?? []).join("·")}`
          : b.ref.title ?? "潛水團";
      tripKeyOptions.push({ key, label });
    }
  }

  // v183：日期區間 filter（今天/明天/一週/一個月/全部）
  function isInRange(dateStr?: string): boolean {
    if (filterRange === "all") return true;
    if (!dateStr) return true;
    const d = dateStr.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const t = new Date(today + "T00:00:00+08:00");
    const tomorrow = new Date(t); tomorrow.setDate(t.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    if (filterRange === "today") return d === today;
    if (filterRange === "tomorrow") return d === tomorrowStr;
    // week / month：今天起 N 天內（含今天）
    const cutoff = new Date(t);
    cutoff.setDate(t.getDate() + (filterRange === "week" ? 7 : 30));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return d >= today && d <= cutoffStr;
  }

  const filteredBookings = bookings.filter((b) => {
    const payOk = filterPayStatus === "all" || b.paymentStatus === filterPayStatus;
    if (!payOk) return false;
    const rangeOk = isInRange(b.ref.date ?? b.ref.dateStart);
    if (!rangeOk) return false;
    if (filterTripKey === "all") return true;
    const key =
      b.type === "daily"
        ? `${b.ref.date ?? ""}_${b.ref.startTime ?? ""}`
        : `tour_${b.ref.title ?? ""}`;
    return key === filterTripKey;
  });

  // v183：排序（日期排序時未來在前、過去在後）
  const todayStr = new Date().toISOString().slice(0, 10);
  const sortedBookings = [...filteredBookings].sort((a, b) => {
    if (sortKey === "date") {
      const ad = (a.ref.date ?? a.ref.dateStart ?? "").slice(0, 10);
      const bd = (b.ref.date ?? b.ref.dateStart ?? "").slice(0, 10);
      const aPast = ad < todayStr;
      const bPast = bd < todayStr;
      if (aPast !== bPast) return aPast ? 1 : -1;
      if (aPast && bPast) {
        // 兩個過去 → desc（最近過去先）
        if (ad < bd) return 1;
        if (ad > bd) return -1;
        return 0;
      }
      // 兩個未來 → 依 sortDir
      if (ad < bd) return sortDir === "asc" ? -1 : 1;
      if (ad > bd) return sortDir === "asc" ? 1 : -1;
      return 0;
    }
    let va: string | number = 0, vb: string | number = 0;
    switch (sortKey) {
      case "code":    va = a.code ?? ""; vb = b.code ?? ""; break;
      case "amount":  va = a.totalAmount; vb = b.totalAmount; break;
      case "paid":    va = a.paidAmount;  vb = b.paidAmount; break;
      case "status":  va = a.status; vb = b.status; break;
      case "payment": va = a.paymentStatus; vb = b.paymentStatus; break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedBookings = sortedBookings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await adminFetch<{ ok: boolean; booking: AdminBooking }>(
        `/api/admin/bookings/${editing.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            participants: editing.participants,
            totalAmount: editing.totalAmount,
            paidAmount: editing.paidAmount,
            paymentStatus: editing.paymentStatus,
            paymentMethod: editing.paymentMethod,
            status: editing.status,
            notes: editing.notes ?? null,
            siteNotes: editing.siteNotes ?? null,
            adminNotes: editing.adminNotes ?? null,
          }),
        },
      );
      setBookings((arr) =>
        arr.map((x) => (x.id === editing.id ? { ...x, ...r.booking } : x)),
      );
      setEditing(null);
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(b: AdminBooking) {
    if (!confirm(`取消訂單「${b.user.realName ?? b.user.displayName}」？`))
      return;
    try {
      await adminFetch(`/api/admin/bookings/${b.id}`, { method: "DELETE" });
      setBookings((arr) =>
        arr.map((x) =>
          x.id === b.id ? { ...x, status: "cancelled_by_user" } : x,
        ),
      );
    } catch (e) {
      alert("取消失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteBooking(b: AdminBooking) {
    if (
      !confirm(
        `永久刪除訂單？\n會員：${b.user.realName ?? b.user.displayName}\n無法復原。`,
      )
    )
      return;
    const ok2 = prompt("輸入「DELETE」確認：");
    if (ok2 !== "DELETE") return;
    try {
      await adminFetch(`/api/admin/bookings/${b.id}?permanent=true`, {
        method: "DELETE",
      });
      setBookings((arr) => arr.filter((x) => x.id !== b.id));
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  // v183 移除 openEditFromByTrip — 依場次視圖已被砍掉

  async function doRefund() {
    if (!editing) return;
    const n = Number(refundAmount);
    if (!n || n <= 0) { alert("請輸入退款金額"); return; }
    const creditAmount = refundMethod === "credit" ? Math.round(n * refundCreditPct / 100) : undefined;
    const desc = refundMethod === "credit"
      ? `轉禮金 NT$${creditAmount?.toLocaleString()}${refundCreditPct !== 100 ? `（${refundCreditPct}%）` : ""}`
      : `退現金 NT$${n.toLocaleString()}`;
    if (!confirm(`確定退款？\n從已付款扣 NT$${n.toLocaleString()}\n→ ${desc}`)) return;
    setRefundBusy(true);
    try {
      const body: Record<string, unknown> = { amount: n, method: refundMethod, reason: refundReason || undefined };
      if (refundMethod === "credit" && creditAmount !== n) body.creditAmount = creditAmount;
      await adminFetch(`/api/admin/bookings/${editing.id}/refund`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setBookings((arr) =>
        arr.map((x) => x.id === editing.id ? { ...x, paymentStatus: "refunded" } : x),
      );
      setEditing({ ...editing, paymentStatus: "refunded" });
      setRefundOpen(false);
      setRefundAmount("");
    } catch (e) {
      alert("退款失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <AdminShell title="訂單管理">
      {/* v183: 移除『依場次』分頁，僅留全部訂單視圖 + 強化 filter / sort / pagination */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <span className="text-sm text-[var(--muted-foreground)]">範圍：</span>
        {(["today", "tomorrow", "week", "month", "all"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { setFilterRange(r); setPage(1); }}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filterRange === r
                ? "bg-[var(--color-ocean-deep)] text-white"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
            )}
          >
            {r === "today" ? "今天" : r === "tomorrow" ? "明天" : r === "week" ? "一週內" : r === "month" ? "一個月內" : "全部"}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--muted-foreground)]">
          共 {sortedBookings.length} 筆 · 每頁 {PAGE_SIZE} 筆 · 第 {currentPage}/{totalPages} 頁
        </span>
      </div>

      {err && (
        <div className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: "rgba(255,123,90,0.1)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>
          {err}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
      )}


      {/* ── 全部訂單 ──────────────────────── */}
      {!loading && (
        <div className="space-y-3">
          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Trip filter */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">場次：</span>
              <select
                value={filterTripKey}
                onChange={(e) => setFilterTripKey(e.target.value)}
                className="min-w-0 max-w-[200px] rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-xs truncate"
              >
                {tripKeyOptions.map((o) => (
                  <option key={o.key} value={o.key} className="truncate">{o.label}</option>
                ))}
              </select>
            </div>
            {/* Payment filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-[var(--muted-foreground)]">付款：</span>
              {["all", "pending", "deposit_paid", "fully_paid", "refunding", "refunded"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilterPayStatus(s)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    filterPayStatus === s
                      ? "bg-[var(--color-ocean-deep)] text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                  )}
                >
                  {s === "all" ? "全部" : PAYMENT_STATUS_LABEL[s] ?? s}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted-foreground)]"
                    style={{ background: "var(--muted)" }}>
                    <th className="px-4 py-3 font-medium">訂單編號</th>
                    <th className="px-4 py-3 font-medium">客戶</th>
                    <th className="px-3 py-3 font-medium text-center">消費</th>
                    <th className="px-4 py-3 font-medium">場次</th>
                    <th className="px-4 py-3 font-medium text-right">金額</th>
                    <th className="px-4 py-3 font-medium text-right">已付</th>
                    <th className="px-4 py-3 font-medium">訂單</th>
                    <th className="px-4 py-3 font-medium">付款</th>
                    <th className="px-4 py-3 font-medium">方式</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBookings.map((b, i) => {
                    const tripDateStr = b.ref.date ?? b.ref.dateStart ?? "";
                    const past = isPastDate(tripDateStr);
                    const tripDisplay = b.type === "daily"
                      ? `${b.ref.date ?? "—"} ${weekdayTW(b.ref.date ?? "")} ${b.ref.startTime ?? ""}`
                      : b.ref.title ?? "潛水團";
                    return (
                      <tr
                        key={b.id}
                        className={cn(
                          "border-t cursor-pointer transition-colors hover:bg-sky-50",
                          i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20",
                        )}
                        style={{ borderColor: "var(--border)" }}
                        onClick={() => {
                          setEditing({ ...b });
                          setRefundOpen(false);
                          setRefundAmount(String(b.paidAmount));
                          setRefundCreditPct(100);
                        }}
                      >
                        {/* 訂單編號 */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {b.code ? (
                            <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-teal-800">
                              {b.code}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">—</span>
                          )}
                        </td>
                        {/* 客戶 — 一行 */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="font-medium text-sm">
                            {b.user.realName ?? b.user.displayName}
                          </span>
                          {b.user.phone && (
                            <span className="ml-1.5 text-xs text-[var(--muted-foreground)] tabular-nums">
                              {b.user.phone}
                            </span>
                          )}
                        </td>
                        {/* 消費狀態：結合 booking status + 場次日期 */}
                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {(() => {
                            // 1. 已取消（不論時間）
                            if (b.status === "cancelled_by_user" || b.status === "cancelled_by_weather") {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)] line-through">
                                  已取消
                                </span>
                              );
                            }
                            // 2. 已完成 — 客戶實際有來
                            if (b.status === "completed") {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-phosphor)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-phosphor)]">
                                  ✓ 已消費
                                </span>
                              );
                            }
                            // 3. 未到場 — 場次已過但客戶沒來
                            if (b.status === "no_show") {
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-coral)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-coral)]">
                                  ✗ 未到場
                                </span>
                              );
                            }
                            // 4. pending / confirmed
                            if (tripDateStr && past) {
                              // 過期了但 booking 還沒結算 — 提醒 admin
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700" title="場次已過，請更新訂單狀態為「已完成」或「未到場」">
                                  ⚠ 待結算
                                </span>
                              );
                            }
                            // 5. 未來場次，未消費
                            return (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] text-sky-700">
                                ⏳ 待消費
                              </span>
                            );
                          })()}
                        </td>
                        {/* 場次 — 一行 */}
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          <span className={cn("tabular-nums", past && "text-[var(--muted-foreground)]")}>{tripDisplay}</span>
                          {b.ref.sites && b.ref.sites.length > 0 && (
                            <span className="ml-1.5 text-[var(--muted-foreground)]">
                              {b.ref.sites.join("·")}
                            </span>
                          )}
                        </td>
                        {/* 金額 */}
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {b.totalAmount.toLocaleString()}
                        </td>
                        {/* 已付 */}
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                          {b.paidAmount.toLocaleString()}
                        </td>
                        {/* 訂單狀態 */}
                        <td className="px-4 py-2.5">
                          <Badge variant={bookStatusVariant(b.status)} className="text-[10px] whitespace-nowrap">
                            {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                          </Badge>
                        </td>
                        {/* 付款狀態 */}
                        <td className="px-4 py-2.5">
                          <Badge variant={payStatusVariant(b.paymentStatus)} className="text-[10px] whitespace-nowrap">
                            {PAYMENT_STATUS_LABEL[b.paymentStatus] ?? b.paymentStatus}
                          </Badge>
                        </td>
                        {/* 方式 */}
                        <td className="px-4 py-2.5 text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                          {PAYMENT_METHOD_LABEL[b.paymentMethod ?? ""] ?? b.paymentMethod ?? "—"}
                        </td>
                        {/* 操作 */}
                        <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 flex-wrap">
                            {/* 待結算（過期+pending/confirmed）→ 快速結算按鈕 */}
                            {past && (b.status === "pending" || b.status === "confirmed") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => quickComplete(b)}
                                  disabled={completing === b.id}
                                  title="標記已完成（已收齊）"
                                  className="border-[var(--color-phosphor)] text-[var(--color-phosphor)] hover:bg-[var(--color-phosphor)]/10"
                                >
                                  ✓
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setNoShowTarget(b); setNoShowOption("none"); setNoShowCreditPct(80); }}
                                  title="標記未到場"
                                  className="border-[var(--color-coral)] text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                                >
                                  ✗
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditing({ ...b });
                                setRefundOpen(false);
                                setRefundAmount(String(b.paidAmount));
                                setRefundCreditPct(100);
                              }}
                              title="編輯"
                            >
                              <Edit3 className="h-3 w-3" />
                            </Button>
                            {(b.status === "pending" || b.status === "confirmed") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => cancelBooking(b)}
                                title="取消訂單"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteBooking(b)}
                              title="永久刪除"
                              className="border-[var(--color-coral)]"
                            >
                              <AlertTriangle className="h-3 w-3 text-[var(--color-coral)]" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagedBookings.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
                        無資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* v183 分頁器 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded border border-[var(--border)] px-3 py-1 hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一頁
              </button>
              <span className="text-[var(--muted-foreground)]">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded border border-[var(--border)] px-3 py-1 hover:bg-[var(--muted)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Dialog ───────────────────────────────── */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>訂單詳情 / 編輯</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] text-[var(--muted-foreground)]">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-[var(--foreground)]">
                    {editing.user.realName ?? editing.user.displayName}
                  </div>
                  {editing.code && (
                    <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-teal-800">
                      {editing.code}
                    </span>
                  )}
                </div>
                <div>
                  {editing.type === "daily"
                    ? `日潛 ${editing.ref.date ?? ""} ${weekdayTW(editing.ref.date ?? "")} ${editing.ref.startTime ?? ""}`
                    : `潛水團 ${editing.ref.title ?? ""}`}
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">參加人數</Label>
                <Input type="number" min={1} max={20} value={editing.participants}
                  onChange={(e) => setEditing({ ...editing, participants: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">總金額</Label>
                <Input type="number" min={0} value={editing.totalAmount}
                  onChange={(e) => setEditing({ ...editing, totalAmount: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">已付金額</Label>
                <Input type="number" min={0} value={editing.paidAmount}
                  onChange={(e) => setEditing({ ...editing, paidAmount: Math.max(0, Number(e.target.value)) })} />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">付款方式</Label>
                <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.paymentMethod ?? "cash"}
                  onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })}>
                  <option value="cash">現場支付</option>
                  <option value="bank">銀行轉帳</option>
                  <option value="linepay">LINE Pay</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">付款狀態</Label>
                <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.paymentStatus}
                  onChange={(e) => setEditing({ ...editing, paymentStatus: e.target.value })}>
                  {["pending", "deposit_paid", "fully_paid", "refunding", "refunded"].map((s) => (
                    <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">訂單狀態</Label>
                <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.status}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  {["pending", "confirmed", "cancelled_by_user", "cancelled_by_weather", "completed", "no_show"].map((s) => (
                    <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>

              {/* ── 備註區塊 ── */}
              <div className="space-y-2 pt-1">
                <div
                  className="rounded-md px-3 py-2 text-[11px] font-semibold tracking-wide"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                >
                  備註
                </div>

                {/* 客戶備註（唯讀） */}
                <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                  <Label className="text-xs pt-1.5">客戶備註</Label>
                  <div
                    className="min-h-[2.5rem] rounded-md border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", background: "var(--muted)/30", color: "var(--muted-foreground)" }}
                  >
                    {editing.notes || <span className="opacity-40">（客戶未填寫）</span>}
                  </div>
                </div>

                {/* 網站備註（admin 寫，客戶可見） */}
                <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                  <Label className="text-xs pt-1.5">
                    網站備註
                    <span className="block font-normal text-[10px]" style={{ color: "var(--muted-foreground)" }}>客戶可見</span>
                  </Label>
                  <textarea
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                    rows={2}
                    placeholder="顯示給客戶的公開備註（如：注意帶泳衣）"
                    value={editing.siteNotes ?? ""}
                    onChange={(e) => setEditing({ ...editing, siteNotes: e.target.value })}
                  />
                </div>

                {/* 管理備註（admin/boss only） */}
                {isAdminOrBoss && (
                  <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                    <Label className="text-xs pt-1.5">
                      管理備註
                      <span className="block font-normal text-[10px]" style={{ color: "var(--color-coral)" }}>僅管理員可見</span>
                    </Label>
                    <textarea
                      className="w-full rounded-md border px-2 py-1.5 text-sm"
                      style={{ borderColor: "rgba(255,123,90,0.4)", background: "rgba(255,123,90,0.04)" }}
                      rows={2}
                      placeholder="內部備註（客戶不可見）"
                      value={editing.adminNotes ?? ""}
                      onChange={(e) => setEditing({ ...editing, adminNotes: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {/* 付款憑證審核區 — 只在 已付>0 OR 真的有憑證 時顯示 */}
              {(proofs.length > 0 || (proofsLoading && editing.paidAmount > 0)) && (
                <div className="rounded-md p-3 space-y-2" style={{ border: "2px solid var(--border)" }}>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    📄 付款憑證
                    <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                      ({proofs.filter(p => !p.verifiedAt).length} 筆待審核 / 共 {proofs.length} 筆)
                    </span>
                  </div>
                  {proofsLoading && proofs.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)]">載入中...</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {proofs.map((p) => (
                      <div key={p.id} className="rounded-md border p-2 space-y-1.5" style={{ borderColor: "var(--border)" }}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-semibold">NT$ {p.amount.toLocaleString()}</span>
                          <span className="text-[10px] text-[var(--muted-foreground)]">
                            {p.type === "deposit" ? "訂金" : p.type === "final" ? "尾款" : "退款"}
                          </span>
                        </div>
                        {p.previewUrl ? (
                          <a href={p.previewUrl} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={p.previewUrl} alt="付款憑證"
                              className="w-full h-32 object-cover rounded border" style={{ borderColor: "var(--border)" }} />
                          </a>
                        ) : (
                          <div className="h-32 flex items-center justify-center text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded">
                            （已清理 / 30 天前）
                          </div>
                        )}
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {new Date(p.uploadedAt).toLocaleDateString("zh-TW")}
                        </div>
                        {p.verifiedAt ? (
                          <div className="text-[10px] font-semibold text-[var(--color-phosphor)]">
                            ✓ 已核可 {new Date(p.verifiedAt).toLocaleDateString("zh-TW")}
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button onClick={() => verifyProof(p)}
                              className="flex-1 rounded px-2 py-1 text-[10px] font-semibold text-white"
                              style={{ background: "var(--color-phosphor)" }}>
                              ✓ 核可入帳
                            </button>
                            <button onClick={() => rejectProof(p)}
                              className="flex-1 rounded px-2 py-1 text-[10px] font-semibold text-white"
                              style={{ background: "var(--color-coral)" }}>
                              ✗ 拒絕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Refund */}
              {editing.paidAmount > 0 && editing.paymentStatus !== "refunded" && (
                <div className="rounded-md p-3 space-y-2"
                  style={{ border: "2px solid rgba(255,123,90,0.4)", background: "rgba(255,123,90,0.05)" }}>
                  <button type="button" onClick={() => setRefundOpen(!refundOpen)}
                    className="flex w-full items-center justify-between text-sm font-semibold"
                    style={{ color: "var(--color-coral)" }}>
                    退款處理（已付 NT$ {editing.paidAmount.toLocaleString()}）
                    {refundOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {refundOpen && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setRefundMethod("credit")}
                          className={cn("rounded-md border px-2 py-2 text-xs",
                            refundMethod === "credit" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold" : "border-[var(--border)]")}>
                          轉禮金
                        </button>
                        <button type="button" onClick={() => setRefundMethod("cash")}
                          className={cn("rounded-md border px-2 py-2 text-xs",
                            refundMethod === "cash" ? "border-[var(--color-coral)] bg-[var(--color-coral)]/15 font-semibold" : "border-[var(--border)]")}>
                          退現金
                        </button>
                      </div>
                      {/* 轉禮金 % 快選 (天氣 110% / 一般 100% / 違約 80%) */}
                      {refundMethod === "credit" && (
                        <div>
                          <Label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">轉禮金 %（可自訂）</Label>
                          <div className="grid grid-cols-4 gap-1 mb-1">
                            {[80, 100, 110, 120].map((p) => (
                              <button key={p} type="button" onClick={() => setRefundCreditPct(p)}
                                className={cn("rounded-md border px-2 py-1 text-xs",
                                  refundCreditPct === p ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold" : "border-[var(--border)]")}>
                                {p}%
                              </button>
                            ))}
                          </div>
                          <Input type="number" min={1} max={500} value={refundCreditPct}
                            onChange={(e) => setRefundCreditPct(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
                            placeholder="自訂百分比" />
                          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                            退款金額 × {refundCreditPct}% = 實際轉入禮金 NT${Math.round(Number(refundAmount || 0) * refundCreditPct / 100).toLocaleString()}
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" min={1} max={editing.paidAmount} value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)} placeholder="退款金額" />
                        <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="原因（選填）" />
                      </div>
                      <Button size="sm" className="w-full" style={{ background: "var(--color-coral)", color: "white" }}
                        disabled={refundBusy} onClick={doRefund}>
                        {refundBusy ? "處理中..." : `確認退款 NT$${Number(refundAmount || 0).toLocaleString()}`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
                <Button onClick={saveEdit} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 未到場處理 Dialog */}
      <Dialog open={noShowTarget !== null} onOpenChange={(o) => { if (!o) setNoShowTarget(null); }}>
        <DialogContent className="max-w-md bg-white text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">標記為未到場</DialogTitle>
          </DialogHeader>
          {noShowTarget && (
            <div className="space-y-3 pt-2">
              <div className="rounded-md p-3" style={{ background: "var(--muted)" }}>
                <div className="text-sm font-medium">{noShowTarget.user.realName ?? noShowTarget.user.displayName}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  訂單 {noShowTarget.code ?? noShowTarget.id.slice(0, 8)}　|　總額 NT$ {noShowTarget.totalAmount.toLocaleString()}　|　已付 NT$ {noShowTarget.paidAmount.toLocaleString()}
                </div>
              </div>

              {noShowTarget.paidAmount > 0 ? (
                <>
                  <Label className="text-sm font-medium">已付款處理方式</Label>
                  <div className="space-y-2">
                    <label className={cn("flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      noShowOption === "none" ? "border-[var(--color-coral)] bg-[var(--color-coral)]/5" : "border-[var(--border)]")}>
                      <input type="radio" checked={noShowOption === "none"} onChange={() => setNoShowOption("none")} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🅐 不退款（預設）</div>
                        <div className="text-xs text-[var(--muted-foreground)]">已付 NT$ {noShowTarget.paidAmount.toLocaleString()} 沒收，作為違約金</div>
                      </div>
                    </label>
                    <label className={cn("flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      noShowOption === "cash100" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5" : "border-[var(--border)]")}>
                      <input type="radio" checked={noShowOption === "cash100"} onChange={() => setNoShowOption("cash100")} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🅑 退現金 100%</div>
                        <div className="text-xs text-[var(--muted-foreground)]">通融客戶（特殊原因如急事），退現 NT$ {noShowTarget.paidAmount.toLocaleString()}</div>
                      </div>
                    </label>
                    <label className={cn("flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      noShowOption === "credit_custom" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5" : "border-[var(--border)]")}>
                      <input type="radio" checked={noShowOption === "credit_custom"} onChange={() => setNoShowOption("credit_custom")} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🅒 轉禮金 (自訂%)</div>
                        {noShowOption === "credit_custom" && (
                          <div className="mt-2 space-y-1">
                            <div className="grid grid-cols-4 gap-1">
                              {[50, 80, 100, 120].map((p) => (
                                <button key={p} type="button" onClick={() => setNoShowCreditPct(p)}
                                  className={cn("rounded-md border px-1 py-1 text-xs",
                                    noShowCreditPct === p ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold" : "border-[var(--border)]")}>
                                  {p}%
                                </button>
                              ))}
                            </div>
                            <Input type="number" min={1} max={500} value={noShowCreditPct}
                              onChange={(e) => setNoShowCreditPct(Math.max(1, Math.min(500, Number(e.target.value) || 80)))}
                              placeholder="自訂百分比" className="h-8 text-xs" />
                            <p className="text-[10px] text-[var(--muted-foreground)]">
                              已付 NT$ {noShowTarget.paidAmount.toLocaleString()} × {noShowCreditPct}% = 轉禮金 NT$ {Math.round(noShowTarget.paidAmount * noShowCreditPct / 100).toLocaleString()}
                            </p>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </>
              ) : (
                <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  此訂單未收款（paidAmount = 0），標記後不會有金錢處理。
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button variant="outline" onClick={() => setNoShowTarget(null)} disabled={noShowBusy}>取消</Button>
                <Button onClick={doNoShow} disabled={noShowBusy}
                  style={{ background: "var(--color-coral)", color: "white" }}>
                  {noShowBusy ? "處理中..." : "確認未到場"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
