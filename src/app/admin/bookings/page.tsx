"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch, useAdminAuth } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
  refundAmount?: number | null;
  refundedAt?: string | null;
  refundMethod?: string | null;
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
  type SortKey = "date" | "code" | "type" | "customer" | "amount" | "paid" | "status" | "payment" | "method";
  const [filterRange, setFilterRange] = useState<"today" | "3days" | "week" | "month" | "all">("week");
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
  const [refundCreditPct, setRefundCreditPct] = useState<number>(100); // 轉抵用金 % (例：110 = 退款金額的 110% 轉抵用金)
  // v199：新增一筆付款
  const [addPaymentAmount, setAddPaymentAmount] = useState<string>("");
  const [addPaymentNote, setAddPaymentNote] = useState<string>("");
  const [addingPayment, setAddingPayment] = useState(false);

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
          reason: `未到場退款（${noShowOption === "cash100" ? "退現 100%" : `轉抵用金 ${noShowCreditPct}%`}）`,
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

  // v215：日期區間 filter — 嚴格 N 天（未來 N 天，含今天）
  //   今天     → 只今天
  //   3 天內   → 今天 + 後 2 天   = 3 個日曆天
  //   一週內   → 今天 + 後 6 天   = 7 個日曆天
  //   一個月內 → 今天 + 後 29 天 = 30 個日曆天
  function isInRange(dateStr?: string): boolean {
    if (filterRange === "all") return true;
    if (!dateStr) return true;
    const d = dateStr.slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const t = new Date(today + "T00:00:00+08:00");
    if (filterRange === "today") return d === today;
    const days = filterRange === "3days" ? 3 : filterRange === "week" ? 7 : 30;
    const cutoff = new Date(t);
    cutoff.setDate(t.getDate() + (days - 1)); // N-1 → 共 N 天
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
      case "type":    va = a.type; vb = b.type; break;
      case "customer": va = a.user.realName ?? a.user.displayName; vb = b.user.realName ?? b.user.displayName; break;
      case "amount":  va = a.totalAmount; vb = b.totalAmount; break;
      case "paid":    va = a.paidAmount;  vb = b.paidAmount; break;
      case "status":  va = a.status; vb = b.status; break;
      case "payment": va = a.paymentStatus; vb = b.paymentStatus; break;
      case "method":  va = a.paymentMethod ?? ""; vb = b.paymentMethod ?? ""; break;
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
      // v191：已退款訂單僅准許更新 adminNotes，其他欄位不送
      const isRefunded = editing.paymentStatus === "refunded";
      const body = isRefunded
        ? { adminNotes: editing.adminNotes ?? null }
        : {
            participants: editing.participants,
            totalAmount: editing.totalAmount,
            paidAmount: editing.paidAmount,
            paymentStatus: editing.paymentStatus,
            paymentMethod: editing.paymentMethod,
            status: editing.status,
            notes: editing.notes ?? null,
            siteNotes: editing.siteNotes ?? null,
            adminNotes: editing.adminNotes ?? null,
          };
      const r = await adminFetch<{ ok: boolean; booking: AdminBooking }>(
        `/api/admin/bookings/${editing.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
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

  // v199：新增一筆付款（增量加到 paidAmount，避免直接 overwrite 造成多筆訂金混亂）
  async function confirmAddPayment() {
    if (!editing) return;
    const n = parseInt(addPaymentAmount, 10);
    if (!n || n <= 0) { alert("請輸入正確金額"); return; }
    const owed = editing.totalAmount - editing.paidAmount;
    if (n > owed) {
      if (!confirm(`輸入金額 NT$${n} 大於剩餘應付 NT$${owed}。\n確定要新增此筆付款？（超收的會記入 paidAmount）`)) return;
    }
    const newPaid = editing.paidAmount + n;
    // 自動推算付款狀態
    let nextPayStatus = editing.paymentStatus;
    if (newPaid >= editing.totalAmount) nextPayStatus = "fully_paid";
    else if (newPaid > 0) nextPayStatus = "deposit_paid";
    setAddingPayment(true);
    try {
      const noteSuffix = addPaymentNote ? `（${addPaymentNote}）` : "";
      const stamp = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }).slice(5, 16);
      const updatedAdminNote =
        (editing.adminNotes ? editing.adminNotes + "\n" : "") +
        `[${stamp}] 收款 +NT$${n.toLocaleString()}${noteSuffix}`;
      const body = {
        paidAmount: newPaid,
        paymentStatus: nextPayStatus,
        adminNotes: updatedAdminNote,
      };
      const r = await adminFetch<{ ok: boolean; booking: AdminBooking }>(
        `/api/admin/bookings/${editing.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      setBookings((arr) => arr.map((x) => (x.id === editing.id ? { ...x, ...r.booking } : x)));
      setEditing({ ...editing, paidAmount: newPaid, paymentStatus: nextPayStatus, adminNotes: updatedAdminNote });
      setAddPaymentAmount("");
      setAddPaymentNote("");
    } catch (e) {
      alert("新增付款失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAddingPayment(false);
    }
  }

  async function doRefund() {
    if (!editing) return;
    const n = Number(refundAmount);
    if (!n || n <= 0) { alert("請輸入退款金額"); return; }
    const creditAmount = refundMethod === "credit" ? Math.round(n * refundCreditPct / 100) : undefined;
    const desc = refundMethod === "credit"
      ? `轉抵用金 NT$${creditAmount?.toLocaleString()}${refundCreditPct !== 100 ? `（${refundCreditPct}%）` : ""}`
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
        <span className="text-sm text-[var(--muted-foreground)]">活動時間範圍：</span>
        {(["today", "3days", "week", "month", "all"] as const).map((r) => (
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
            {r === "today" ? "今天" : r === "3days" ? "3 天內" : r === "week" ? "一週內" : r === "month" ? "一個月內" : "全部"}
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
                    <th className="px-4 py-3 font-medium"><SortBtn k="code" curK={sortKey} dir={sortDir} onClick={toggleSort}>訂單編號</SortBtn></th>
                    <th className="px-3 py-3 font-medium"><SortBtn k="type" curK={sortKey} dir={sortDir} onClick={toggleSort}>類型</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="customer" curK={sortKey} dir={sortDir} onClick={toggleSort}>客戶</SortBtn></th>
                    <th className="px-3 py-3 font-medium text-center">消費</th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="date" curK={sortKey} dir={sortDir} onClick={toggleSort}>場次時間</SortBtn></th>
                    <th className="px-4 py-3 font-medium">地點 / 行程</th>
                    <th className="px-4 py-3 font-medium text-right"><SortBtn k="amount" curK={sortKey} dir={sortDir} onClick={toggleSort} align="right">金額</SortBtn></th>
                    <th className="px-4 py-3 font-medium text-right"><SortBtn k="paid" curK={sortKey} dir={sortDir} onClick={toggleSort} align="right">已付</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="status" curK={sortKey} dir={sortDir} onClick={toggleSort}>訂單</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="payment" curK={sortKey} dir={sortDir} onClick={toggleSort}>付款</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="method" curK={sortKey} dir={sortDir} onClick={toggleSort}>方式</SortBtn></th>
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
                          setAddPaymentAmount("");
                          setAddPaymentNote("");
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
                        {/* 類型：日潛 / 潛水團 */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {b.type === "daily" ? (
                            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "rgba(14,158,145,0.12)", color: "#0E9E91" }}>
                              🌊 日潛
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "rgba(242,96,60,0.12)", color: "#F2603C" }}>
                              🚢 潛水團
                            </span>
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
                        {/* 場次時間 — daily 一行 / tour 兩行（開始 ~ 結束） */}
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          {b.type === "daily" ? (
                            <div className={cn("tabular-nums font-medium", past && "text-[var(--muted-foreground)]")}>
                              {b.ref.date ?? "—"} {weekdayTW(b.ref.date ?? "")} {b.ref.startTime ?? ""}
                            </div>
                          ) : (
                            <>
                              <div className={cn("tabular-nums font-medium leading-tight", past && "text-[var(--muted-foreground)]")}>
                                {b.ref.dateStart ?? "—"} {weekdayTW(b.ref.dateStart ?? "")}
                              </div>
                              <div className="tabular-nums text-[10px] text-[var(--muted-foreground)] leading-tight">
                                ~ {b.ref.dateEnd ?? "—"} {weekdayTW(b.ref.dateEnd ?? "")}
                              </div>
                            </>
                          )}
                        </td>
                        {/* 地點 / 行程 */}
                        <td className="px-4 py-2.5 text-xs">
                          {b.type === "daily" ? (
                            b.ref.sites && b.ref.sites.length > 0 ? (
                              <span>{b.ref.sites.join("・")}</span>
                            ) : (
                              <span className="text-[var(--muted-foreground)]">—</span>
                            )
                          ) : (
                            <span className="font-medium">{b.ref.title ?? "潛水團"}</span>
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
                      <td colSpan={12} className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
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

              {/* v191：退款後鎖住所有 input（除 adminNotes） */}
              {(() => {
                const locked = editing.paymentStatus === "refunded";
                const owed = Math.max(0, editing.totalAmount - editing.paidAmount);
                return (
                  <>
                    {locked && (
                      <div className="rounded-md border-2 px-3 py-2 text-xs font-semibold"
                        style={{ borderColor: "rgba(255,123,90,0.5)", background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
                        🔒 此訂單已退款 {editing.refundAmount?.toLocaleString() ?? "?"} — 僅可編輯「管理備註」
                      </div>
                    )}
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">參加人數</Label>
                      <NumberInput min={1} max={20} value={editing.participants}
                        disabled={locked}
                        onChange={(n) => setEditing({ ...editing, participants: Math.max(1, n) })} />
                    </div>
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">總金額</Label>
                      <NumberInput min={0} value={editing.totalAmount}
                        disabled={locked}
                        onChange={(n) => setEditing({ ...editing, totalAmount: n })} />
                    </div>
                    <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                      <Label className="text-xs pt-1.5">已付金額</Label>
                      <div>
                        {/* v199：read-only 顯示，避免直接修改累計金額 */}
                        <div className="flex h-9 items-center rounded-md border border-[var(--border)] bg-slate-50 px-3 text-sm tabular-nums font-bold"
                          style={{ color: editing.paidAmount === editing.totalAmount && editing.totalAmount > 0 ? "#16a34a" : editing.paidAmount > 0 ? "#0a2342" : "#64748b" }}>
                          {editing.paidAmount.toLocaleString()}
                        </div>
                        {!locked && owed > 0 && editing.paidAmount > 0 && (
                          <div className="mt-1 text-[11px] font-medium text-amber-700">
                            ⚠ 已付 {editing.paidAmount.toLocaleString()} ／ 總額 {editing.totalAmount.toLocaleString()}
                            <span className="ml-1">→ 還差 <b>{owed.toLocaleString()}</b></span>
                          </div>
                        )}
                        {!locked && editing.paidAmount === editing.totalAmount && editing.totalAmount > 0 && (
                          <div className="mt-1 text-[11px] font-medium text-emerald-700">
                            ✓ 已付清
                          </div>
                        )}
                      </div>
                    </div>

                    {/* v199：新增付款 inline 區塊（僅在還有剩餘應付 + 未鎖時顯示） */}
                    {!locked && owed > 0 && (
                      <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                        <Label className="text-xs pt-1.5" style={{ color: "#0891b2" }}>
                          ＋新增付款
                          <span className="block font-normal text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                            可分次累加
                          </span>
                        </Label>
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={addPaymentAmount}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1");
                                setAddPaymentAmount(clean);
                              }}
                              placeholder={`金額（剩 ${owed.toLocaleString()}）`}
                              className="flex-1"
                              disabled={addingPayment}
                            />
                            <Input
                              value={addPaymentNote}
                              onChange={(e) => setAddPaymentNote(e.target.value)}
                              placeholder="備註（如：訂金/尾款/現金）"
                              className="flex-1"
                              disabled={addingPayment}
                            />
                            <Button
                              size="sm"
                              onClick={confirmAddPayment}
                              disabled={addingPayment || !addPaymentAmount || parseInt(addPaymentAmount, 10) <= 0}
                              style={{ background: "#0891b2", color: "#fff" }}
                            >
                              {addingPayment ? "..." : "✓ 確認"}
                            </Button>
                          </div>
                          {/* 快選：訂金一半 / 全額 / 補齊剩餘 */}
                          <div className="flex gap-1.5 flex-wrap">
                            <button type="button"
                              onClick={() => setAddPaymentAmount(String(Math.round(editing.totalAmount * 0.3)))}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600">
                              訂金 30% ({Math.round(editing.totalAmount * 0.3).toLocaleString()})
                            </button>
                            <button type="button"
                              onClick={() => setAddPaymentAmount(String(Math.round(editing.totalAmount * 0.5)))}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600">
                              訂金 50% ({Math.round(editing.totalAmount * 0.5).toLocaleString()})
                            </button>
                            <button type="button"
                              onClick={() => setAddPaymentAmount(String(owed))}
                              className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-100">
                              補齊剩餘 {owed.toLocaleString()}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">付款方式</Label>
                      <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
                        value={editing.paymentMethod ?? "cash"}
                        disabled={locked}
                        onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value })}>
                        <option value="cash">現場支付</option>
                        <option value="bank">銀行轉帳</option>
                        <option value="linepay">LINE Pay</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">付款狀態</Label>
                      {/* v191：dropdown 鎖死，只剩 3 個正常狀態；refunding/refunded 由「退款」按鈕自動寫入 */}
                      {editing.paymentStatus === "refunded" || editing.paymentStatus === "refunding" ? (
                        <div className="rounded-md border px-2 py-1.5 text-sm font-semibold"
                          style={{ borderColor: "var(--color-coral)", background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
                          🔒 {PAYMENT_STATUS_LABEL[editing.paymentStatus]}（系統自動）
                        </div>
                      ) : (
                        <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                          value={editing.paymentStatus}
                          onChange={(e) => setEditing({ ...editing, paymentStatus: e.target.value })}>
                          <option value="pending">未付款</option>
                          <option value="deposit_paid">已付訂金</option>
                          <option value="fully_paid">已付清</option>
                        </select>
                      )}
                    </div>
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">訂單狀態</Label>
                      <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
                        value={editing.status}
                        disabled={locked}
                        onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                        {["pending", "confirmed", "cancelled_by_user", "cancelled_by_weather", "completed", "no_show"].map((s) => (
                          <option key={s} value={s}>{BOOKING_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  </>
                );
              })()}

              {/* ── 💰 退款處理（已付>0 且未退款才顯示）── 移到付款狀態下方，視覺最顯眼 */}
              {editing.paidAmount > 0 && editing.paymentStatus !== "refunded" && (
                <div className="rounded-md p-3 space-y-2"
                  style={{ border: "2px solid rgba(255,123,90,0.4)", background: "rgba(255,123,90,0.05)" }}>
                  <button type="button" onClick={() => setRefundOpen(!refundOpen)}
                    className="flex w-full items-center justify-between text-sm font-semibold"
                    style={{ color: "var(--color-coral)" }}>
                    <span className="flex items-center gap-1.5">
                      💰 退款處理
                      <span className="text-[11px] font-normal opacity-80">
                        （已付 {editing.paidAmount.toLocaleString()}{editing.paidAmount < editing.totalAmount ? `／總額 ${editing.totalAmount.toLocaleString()}` : ""}）
                      </span>
                    </span>
                    {refundOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {!refundOpen && (
                    <p className="text-[11px] text-[var(--color-coral)] opacity-80 pt-0.5">
                      ↑ 點此展開：可選 <b>轉抵用金</b>（永不過期 · 可加成）或 <b>退現金</b>
                    </p>
                  )}
                  {refundOpen && (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setRefundMethod("credit")}
                          className={cn("rounded-md border px-2 py-2 text-xs",
                            refundMethod === "credit" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold" : "border-[var(--border)]")}>
                          🎁 轉抵用金
                        </button>
                        <button type="button" onClick={() => setRefundMethod("cash")}
                          className={cn("rounded-md border px-2 py-2 text-xs",
                            refundMethod === "cash" ? "border-[var(--color-coral)] bg-[var(--color-coral)]/15 font-semibold" : "border-[var(--border)]")}>
                          💵 退現金
                        </button>
                      </div>
                      {/* 轉抵用金 % 快選 (天氣 110% / 一般 100% / 違約 80%) */}
                      {refundMethod === "credit" && (
                        <div>
                          <Label className="text-[10px] text-[var(--muted-foreground)] mb-1 block">轉抵用金 %（天氣 110 / 一般 100 / 違約 80）</Label>
                          <div className="grid grid-cols-4 gap-1 mb-1">
                            {[80, 100, 110, 120].map((p) => (
                              <button key={p} type="button" onClick={() => setRefundCreditPct(p)}
                                className={cn("rounded-md border px-2 py-1 text-xs",
                                  refundCreditPct === p ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold" : "border-[var(--border)]")}>
                                {p}%
                              </button>
                            ))}
                          </div>
                          <NumberInput min={1} max={500} value={refundCreditPct}
                            onChange={(n) => setRefundCreditPct(Math.max(1, Math.min(500, n || 100)))}
                            placeholder="自訂百分比" />
                          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                            退款金額 × {refundCreditPct}% = 實際轉入抵用金 {Math.round(Number(refundAmount || 0) * refundCreditPct / 100).toLocaleString()}（<b>永不過期</b>）
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="text" inputMode="numeric" value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1"))}
                          placeholder="退款金額" />
                        <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="原因（選填）" />
                      </div>
                      <Button size="sm" className="w-full" style={{ background: "var(--color-coral)", color: "white" }}
                        disabled={refundBusy} onClick={doRefund}>
                        {refundBusy ? "處理中..." : `確認退款 ${Number(refundAmount || 0).toLocaleString()}`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* paid=0 提示：沒收到錢就不會有退款流程 */}
              {editing.paidAmount === 0 && editing.status !== "cancelled_by_user" && editing.status !== "cancelled_by_weather" && (
                <div className="rounded-md p-2.5 text-[11px] text-slate-600"
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                  💡 客戶尚未付款 — 若要不參加，請把「訂單狀態」改成「客戶取消」即可，不需要走退款流程。
                </div>
              )}

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
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
                    rows={2}
                    placeholder="顯示給客戶的公開備註（如：注意帶泳衣）"
                    value={editing.siteNotes ?? ""}
                    disabled={editing.paymentStatus === "refunded"}
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
                          <span className="font-mono font-semibold">{p.amount.toLocaleString()}</span>
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
                  訂單 {noShowTarget.code ?? noShowTarget.id.slice(0, 8)}　|　總額 {noShowTarget.totalAmount.toLocaleString()}　|　已付 {noShowTarget.paidAmount.toLocaleString()}
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
                        <div className="text-xs text-[var(--muted-foreground)]">已付 {noShowTarget.paidAmount.toLocaleString()} 沒收，作為違約金</div>
                      </div>
                    </label>
                    <label className={cn("flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      noShowOption === "cash100" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5" : "border-[var(--border)]")}>
                      <input type="radio" checked={noShowOption === "cash100"} onChange={() => setNoShowOption("cash100")} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🅑 退現金 100%</div>
                        <div className="text-xs text-[var(--muted-foreground)]">通融客戶（特殊原因如急事），退現 {noShowTarget.paidAmount.toLocaleString()}</div>
                      </div>
                    </label>
                    <label className={cn("flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors",
                      noShowOption === "credit_custom" ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/5" : "border-[var(--border)]")}>
                      <input type="radio" checked={noShowOption === "credit_custom"} onChange={() => setNoShowOption("credit_custom")} className="mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">🅒 轉抵用金 (自訂%)</div>
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
                            <NumberInput min={1} max={500} value={noShowCreditPct}
                              onChange={(n) => setNoShowCreditPct(Math.max(1, Math.min(500, n || 80)))}
                              placeholder="自訂百分比" className="h-8 text-xs" />
                            <p className="text-[10px] text-[var(--muted-foreground)]">
                              已付 {noShowTarget.paidAmount.toLocaleString()} × {noShowCreditPct}% = 轉抵用金 {Math.round(noShowTarget.paidAmount * noShowCreditPct / 100).toLocaleString()}
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

// v193：可排序欄位 header
type _SortKey = "date" | "code" | "type" | "customer" | "amount" | "paid" | "status" | "payment" | "method";
function SortBtn({
  k, curK, dir, onClick, align, children,
}: {
  k: _SortKey;
  curK: _SortKey;
  dir: "asc" | "desc";
  onClick: (k: _SortKey) => void;
  align?: "right";
  children: React.ReactNode;
}) {
  const active = k === curK;
  return (
    <button type="button" onClick={() => onClick(k)}
      className={cn(
        "inline-flex items-center gap-0.5 font-medium hover:text-[var(--foreground)] transition-colors",
        active && "text-[var(--foreground)]",
        align === "right" && "justify-end w-full",
      )}>
      {children}
      <span className="text-[10px] opacity-60">{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
    </button>
  );
}
