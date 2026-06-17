"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch, useAdminAuth } from "@/lib/admin-web-auth";
import { getCached, setCached, cachedFetch } from "@/lib/admin-cache";
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
import { ChevronDown, ChevronUp, Edit3, X, AlertTriangle, Trash2, ImageOff } from "lucide-react";
import { cn, weekdayTW, toTaipeiDateString, toTaipeiISODate } from "@/lib/utils";
import { deriveBookingDisplay, BOOKING_STATUS_FILTER_KEYS, BOOKING_STATUS_FILTER_GROUPS, BOOKING_STATUS_EDITABLE_KEYS, reverseDerivedStatus, type BookingStatusKey } from "@/lib/booking-status"; // v319 / v324 / v327
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog"; // v320

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
  // v262：簽名
  signatureImageUrl?: string | null;
  signedAt?: string | null;
  signedFromUserAgent?: string | null;
  // v274 / v280：退款申請狀態
  refundRequest?: {
    id: string;
    status: string;
    method: string;
    amount: number;
    creditBonusPct?: number;
    reason?: string | null;
    customerNote?: string | null;
    initiatedBy?: string;  // v280: customer / admin
    createdAt: string;
    respondedAt?: string | null;
  } | null;
  // v278：訂單狀態歷史
  statusLogs?: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string | null;
    actorRole: string;
    note: string | null;
    createdAt: string;
  }>;
  user: { displayName: string; realName: string | null; phone: string | null; email?: string | null; lineUserId: string };
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

// v366：付款明細
interface PaymentEntryRow {
  id: string;
  amount: number;
  kind: string;
  isCash: boolean;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}
const PAYMENT_KIND_META: Record<string, { label: string; cat: "cash" | "credit" | "discount" }> = {
  transfer: { label: "轉帳", cat: "cash" },
  cash: { label: "現金", cat: "cash" },
  linepay: { label: "LINE Pay", cat: "cash" },
  credit: { label: "抵用金", cat: "credit" },
  boss_discount: { label: "老闆折抵", cat: "discount" },
  assistant: { label: "助教減免", cat: "discount" },
  other: { label: "其他", cat: "discount" },
  reversal: { label: "沖銷", cat: "discount" },
};
const PAYMENT_BADGE_STYLE: Record<string, { background: string; color: string }> = {
  cash: { background: "#dcfce7", color: "#15803d" },
  credit: { background: "#e0f2fe", color: "#0369a1" },
  discount: { background: "#fef3c7", color: "#b45309" },
};
function fmtEntryDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  } catch { return iso.slice(5, 16); }
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
  awaiting_verify: "待確認匯款",  // v276
  confirmed: "已確認",
  cancelled_by_user: "客戶取消",
  cancelled_by_weather: "天氣取消",
  cancelled_unpaid: "訂單不成立",   // v276
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

function bookStatusVariant(s: string): "ocean" | "coral" | "gold" | "muted" {
  if (s === "confirmed" || s === "completed") return "ocean";
  if (s === "awaiting_verify") return "gold"; // v276：金色強調待處理
  if (s.startsWith("cancelled") || s === "no_show") return "coral";
  return "muted";
}

// ── Main Page ────────────────────────────────────────────────
export default function AdminBookingsPage() {
  const { adminUser } = useAdminAuth();
  const isAdminOrBoss = adminUser?.effectiveRoles.some((r) => r === "admin" || r === "boss") ?? false;

  const BOOKINGS_URL = "/api/admin/bookings";
  const [bookings, setBookings] = useState<AdminBooking[]>(
    () => getCached<{ bookings: AdminBooking[] }>(BOOKINGS_URL)?.bookings ?? [],
  );
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null); // v320
  const [loading, setLoading] = useState(() => getCached(BOOKINGS_URL) === undefined);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  // v314：開啟編輯時 snapshot 原始值，儲存前比對差異
  const [editingOriginal, setEditingOriginal] = useState<AdminBooking | null>(null);
  const [pendingDiff, setPendingDiff] = useState<Array<{ key: string; label: string; from: string; to: string }> | null>(null);
  const [saving, setSaving] = useState(false);
  // v310/v317：客戶聯絡 dialog — 一個訊息框、勾選 LINE/Email、一個送出鈕
  const [customerActionFor, setCustomerActionFor] = useState<AdminBooking | null>(null);
  const [contactMessage, setContactMessage] = useState("");
  const [contactEmailSubject, setContactEmailSubject] = useState("");
  const [contactChannelLine, setContactChannelLine] = useState(true);
  const [contactChannelEmail, setContactChannelEmail] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactResult, setContactResult] = useState<string | null>(null);
  const [filterPayStatus, setFilterPayStatus] = useState<string>("all");
  // v294/v329：依 URL ?status= 讀預設值，支援多選（逗號分隔）
  //   filterStatusSet 為 empty Set = "全部"；有東西在 set 內 = 只顯示這些
  const [filterStatusSet, setFilterStatusSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = new URLSearchParams(window.location.search).get("status");
    if (s) setFilterStatusSet(new Set(s.split(",").filter(Boolean)));
  }, []);
  function toggleStatusFilter(key: string) {
    setFilterStatusSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPage(1);
  }
  function clearStatusFilter() {
    setFilterStatusSet(new Set());
    setPage(1);
  }
  const [filterTripKey, setFilterTripKey] = useState<string>("all");
  // v304：場次快捷篩選 — all / today_tomorrow / future / past
  const [filterTripPeriod, setFilterTripPeriod] = useState<"all" | "today_tomorrow" | "future" | "past">("all");
  // v183：訂單管理重構 — 移除『依場次』分頁，加日期區間 filter + 排序 + 分頁
  type SortKey = "date" | "code" | "type" | "customer" | "amount" | "paid" | "status" | "payment" | "method";
  // v338：filterRange 已移除（活動時間範圍 filter 拿掉）
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
  // v275：退款備註（老闆寫實際退款管道，例：LINE Pay 訂單號、匯款帳號）
  const [refundNote, setRefundNote] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundCreditPct, setRefundCreditPct] = useState<number>(100); // 轉抵用金 % (例：110 = 退款金額的 110% 轉抵用金)
  // v366：金額調整（付款／折抵明細）— 取代舊「新增付款」+「助教減免」
  const [entries, setEntries] = useState<PaymentEntryRow[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [adjKind, setAdjKind] = useState<string>("transfer");
  const [adjAmount, setAdjAmount] = useState<string>("");
  const [adjNote, setAdjNote] = useState<string>("");
  const [addingEntry, setAddingEntry] = useState(false);
  const [editTotal, setEditTotal] = useState(false); // 是否展開「修改總金額」

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
    thumb?: string | null; // v379：縮圖（DB）
    imageKey?: string | null; // v393：區分「沒上傳圖」與「已清理」
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
  // v314：開啟編輯時 snapshot 原始值
  useEffect(() => {
    if (editing) {
      if (!editingOriginal || editingOriginal.id !== editing.id) {
        setEditingOriginal({ ...editing });
      }
    } else {
      setEditingOriginal(null);
      setPendingDiff(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  useEffect(() => {
    if (!editing) {
      setProofs([]);
      setProofsLoading(false);
      setEntries([]);
      setEntriesLoading(false);
      setEditTotal(false);
      setAdjAmount("");
      setAdjNote("");
      setAdjKind("transfer");
      return;
    }
    const ctrl = new AbortController();
    loadProofs(editing.id, ctrl.signal);
    loadEntries(editing.id, ctrl.signal);
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
    // v399：先秀快取（秒開）、背景重新驗證；切頁時忽略未回結果
    let alive = true;
    cachedFetch<{ bookings: AdminBooking[] }>(BOOKINGS_URL)
      .then((b) => { if (alive) { setBookings(b.bookings); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  // v399：本地狀態變動（核可/退款等）即時同步回快取，避免下次切回閃舊資料
  useEffect(() => { setCached(BOOKINGS_URL, { bookings }); }, [bookings]);

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

  // v338：isInRange 已移除（活動時間範圍 filter 拿掉）

  // v304：場次快捷篩選邏輯（v306：用台北時區算今天/明天，避免 UTC 跨日 bug）
  function periodOk(dateStr?: string): boolean {
    if (filterTripPeriod === "all") return true;
    if (!dateStr) return true;
    const d = dateStr.slice(0, 10);
    const todayStr = toTaipeiISODate(new Date());
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toTaipeiISODate(tomorrow);
    if (filterTripPeriod === "today_tomorrow") return d === todayStr || d === tomorrowStr;
    if (filterTripPeriod === "future") return d >= todayStr;
    if (filterTripPeriod === "past") return d < todayStr;
    return true;
  }

  const filteredBookings = bookings.filter((b) => {
    const payOk = filterPayStatus === "all" || b.paymentStatus === filterPayStatus;
    if (!payOk) return false;
    // v294：booking.status filter — 給「待確認付款」快捷連結 (?status=awaiting_verify)
    // v319: filter 用衍生 status key（合併線性 label）
    const derivedKey = deriveBookingDisplay({
      status: b.status,
      paymentStatus: b.paymentStatus,
      createdAt: b.createdAt,
      activityDate: b.ref?.date ?? b.ref?.dateStart ?? null,
    }).key;
    const statusOk = filterStatusSet.size === 0 || filterStatusSet.has(derivedKey);
    if (!statusOk) return false;
    // v304：場次快捷篩選（today_tomorrow / future / past）
    if (!periodOk(b.ref.date ?? b.ref.dateStart)) return false;
    // v338：活動時間範圍 filter 已移除
    if (filterTripKey === "all") return true;
    const key =
      b.type === "daily"
        ? `${b.ref.date ?? ""}_${b.ref.startTime ?? ""}`
        : `tour_${b.ref.title ?? ""}`;
    return key === filterTripKey;
  });

  // v183：排序（日期排序時未來在前、過去在後）— v306 改台北時區
  const todayStr = toTaipeiISODate(new Date());
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

  // v314：先計算差異 → 顯示 confirm dialog → 使用者確認後才真正打 API
  function saveEdit() {
    if (!editing || !editingOriginal) return;
    // 比對哪些欄位有變動
    const cmp: Array<{ key: keyof AdminBooking; label: string; format?: (v: unknown) => string }> = [
      { key: "participants", label: "人數" },
      { key: "totalAmount", label: "總金額", format: (v) => `NT$ ${Number(v ?? 0).toLocaleString()}` },
      { key: "paidAmount", label: "已付", format: (v) => `NT$ ${Number(v ?? 0).toLocaleString()}` },
      { key: "paymentStatus", label: "付款狀態", format: (v) => PAYMENT_STATUS_LABEL[String(v)] ?? String(v) },
      { key: "paymentMethod", label: "付款方式", format: (v) => PAYMENT_METHOD_LABEL[String(v ?? "")] ?? String(v ?? "—") },
      { key: "status", label: "訂單狀態", format: (v) => BOOKING_STATUS_LABEL[String(v)] ?? String(v) },
      { key: "notes", label: "客戶備註", format: (v) => String(v ?? "（空）") },
      { key: "siteNotes", label: "網站備註", format: (v) => String(v ?? "（空）") },
      { key: "adminNotes", label: "管理備註", format: (v) => String(v ?? "（空）") },
    ];
    const diffs: Array<{ key: string; label: string; from: string; to: string }> = [];
    for (const c of cmp) {
      const fromV = editingOriginal[c.key];
      const toV = editing[c.key];
      if (fromV !== toV && !(fromV == null && toV == null)) {
        diffs.push({
          key: String(c.key),
          label: c.label,
          from: c.format ? c.format(fromV) : String(fromV ?? "（空）"),
          to: c.format ? c.format(toV) : String(toV ?? "（空）"),
        });
      }
    }
    if (diffs.length === 0) {
      // v382：沒有變更時，按「儲存」直接關閉視窗（本來就沒東西要存）。
      //   先前彈 alert「沒有變更」後視窗不關、只能按 X，與直覺不符。
      setEditing(null);
      return;
    }
    setPendingDiff(diffs);
  }

  async function doSaveEdit() {
    if (!editing) return;
    setSaving(true);
    setPendingDiff(null);
    try {
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

  // v366：載入訂單付款明細
  async function loadEntries(bookingId: string, signal?: AbortSignal) {
    setEntriesLoading(true);
    setEntries([]);
    try {
      const r = await adminFetch<{ entries: PaymentEntryRow[] }>(
        `/api/admin/bookings/${bookingId}/payment-entry`,
        signal ? { signal } : undefined,
      );
      if (signal?.aborted) return;
      setEntries(r.entries ?? []);
    } catch (e) {
      if (signal?.aborted) return;
      console.error("[load entries]", e);
    } finally {
      if (!signal?.aborted) setEntriesLoading(false);
    }
  }

  // v366：新增一筆金額調整（付款／折抵）→ 後端寫 PaymentEntry + 更新 paidAmount/paymentStatus
  async function confirmAddEntry() {
    if (!editing) return;
    // 防呆：總金額有未存的變更時，先請存
    if (editingOriginal && editing.totalAmount !== editingOriginal.totalAmount) {
      alert("你改了「總金額」但尚未儲存。\n請先按下方「儲存」套用總金額，再新增付款紀錄。");
      return;
    }
    const n = parseInt(adjAmount, 10);
    if (!n || n <= 0) { alert("請輸入正確金額"); return; }
    const owed = editing.totalAmount - editing.paidAmount;
    if (n > owed) { alert(`金額不可超過剩餘款 NT$${owed.toLocaleString()}`); return; }
    if (adjKind === "other" && !adjNote.trim()) { alert("「其他」項目必須填寫說明"); return; }
    setAddingEntry(true);
    try {
      const r = await adminFetch<{ ok: boolean; entry: PaymentEntryRow; booking: { paidAmount: number; paymentStatus: string } }>(
        `/api/admin/bookings/${editing.id}/payment-entry`,
        { method: "POST", body: JSON.stringify({ kind: adjKind, amount: n, note: adjNote.trim() || undefined }) },
      );
      setEntries((arr) => [r.entry, ...arr]);
      setEditing({ ...editing, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus });
      setEditingOriginal((o) => (o ? { ...o, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus } : o));
      setBookings((arr) => arr.map((x) => (x.id === editing.id
        ? { ...x, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus as AdminBooking["paymentStatus"] }
        : x)));
      setAdjAmount("");
      setAdjNote("");
    } catch (e) {
      alert("新增付款失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAddingEntry(false);
    }
  }

  // v366：移除一筆付款明細（倒扣 paidAmount，audit 保留軌跡）
  async function deleteEntry(entry: PaymentEntryRow) {
    if (!editing) return;
    const m = PAYMENT_KIND_META[entry.kind];
    if (!confirm(`移除此筆「${m?.label ?? entry.kind}」NT$${entry.amount.toLocaleString()}？\n已付款會倒扣，動作會寫入審計紀錄。`)) return;
    try {
      const r = await adminFetch<{ ok: boolean; booking: { paidAmount: number; paymentStatus: string } }>(
        `/api/admin/bookings/${editing.id}/payment-entry?entryId=${entry.id}`,
        { method: "DELETE" },
      );
      setEntries((arr) => arr.filter((x) => x.id !== entry.id));
      setEditing({ ...editing, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus });
      setEditingOriginal((o) => (o ? { ...o, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus } : o));
      setBookings((arr) => arr.map((x) => (x.id === editing.id
        ? { ...x, paidAmount: r.booking.paidAmount, paymentStatus: r.booking.paymentStatus as AdminBooking["paymentStatus"] }
        : x)));
    } catch (e) {
      alert("移除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function doRefund() {
    if (!editing) return;
    const n = Number(refundAmount);
    if (!n || n <= 0) { alert("請輸入退款金額"); return; }
    const creditBonusPct = refundMethod === "credit" ? Math.max(0, refundCreditPct - 100) : 0;
    const desc = refundMethod === "credit"
      ? `🎁 抵用金 NT$${n}${creditBonusPct > 0 ? ` + ${creditBonusPct}% 加成` : ""}`
      : `💵 現金退費 NT$${n}`;
    // v274：兩段式 — 先發起申請推給客戶，客戶接受才執行
    if (!confirm(`發起退款申請？\n推 LINE Flex 給客戶請他確認：\n${desc}\n\n客戶接受後系統會自動執行抵用金/通知 admin 處理現金。`)) return;
    setRefundBusy(true);
    try {
      await adminFetch(`/api/admin/bookings/${editing.id}/refund-request`, {
        method: "POST",
        body: JSON.stringify({
          method: refundMethod,
          amount: n,
          creditBonusPct,
          reason: refundReason || undefined,
          refundNote: refundNote || undefined,
        }),
      });
      // 重抓資料拿到 refundRequest 狀態
      // 重抓資料拿到 refundRequest 狀態
      const d = await adminFetch<{ bookings: AdminBooking[] }>("/api/admin/bookings");
      setBookings(d.bookings);
      const updated = d.bookings.find((b) => b.id === editing.id);
      if (updated) setEditing(updated);
      setRefundOpen(false);
      setRefundAmount("");
      alert("✓ 已發起退款申請，已推送 LINE Flex 給客戶");
    } catch (e) {
      alert("發起退款申請失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefundBusy(false);
    }
  }

  return (
    <AdminShell title="訂單管理">
      {/* v183/v338: 「活動時間範圍」filter 已移除（場次搜尋 + 狀態 filter + 老闆結帳已覆蓋） */}
      <div className="mb-4 flex items-center justify-end">
        <span className="text-xs text-[var(--muted-foreground)]">
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
          <div className="space-y-2">
            {/* v314：場次搜尋（文字輸入 + datalist autocomplete） */}
            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
              <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap w-16">場次：</span>
              <Input
                list="trip-key-options"
                value={filterTripKey === "all" ? "" : tripKeyOptions.find((o) => o.key === filterTripKey)?.label ?? filterTripKey}
                placeholder="輸入場次名稱搜尋…（空白＝全部）"
                onChange={(e) => {
                  const text = e.target.value.trim();
                  if (!text) { setFilterTripKey("all"); return; }
                  // 嘗試對應 label → key；對不到就保留原樣（filter 不到時自動空列）
                  const match = tripKeyOptions.find((o) => o.label === text);
                  setFilterTripKey(match ? match.key : text);
                  setPage(1);
                }}
                className="min-w-0 max-w-[280px] h-7 text-xs"
              />
              <datalist id="trip-key-options">
                {tripKeyOptions.filter((o) => o.key !== "all").map((o) => (
                  <option key={o.key} value={o.label} />
                ))}
              </datalist>
              {filterTripKey !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilterTripKey("all")}
                  className="text-[10px] text-[var(--muted-foreground)] underline"
                >✕ 清除</button>
              )}
              {/* v304：場次時段快捷 chip */}
              {([
                ["all", "全部"],
                ["today_tomorrow", "今明場次"],
                ["future", "未來場次"],
                ["past", "過期場次"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setFilterTripPeriod(k); setPage(1); }}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    filterTripPeriod === k
                      ? "bg-[var(--color-ocean-deep)] text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* v324: 衍生狀態 filter — 依三層分組（正常 / 結局 / 退款） */}
            <div className="space-y-1.5">
              {/* v329：複選 — 全部 = 清空所有勾選；其他 chip = toggle in/out */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-[var(--muted-foreground)] w-16">狀態：</span>
                <button
                  type="button"
                  onClick={clearStatusFilter}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                    filterStatusSet.size === 0
                      ? "bg-[var(--color-ocean-deep)] text-white"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                  )}
                >
                  全部
                </button>
                {filterStatusSet.size > 0 && (
                  <div className="flex items-center gap-2 rounded-full border border-[var(--color-gold)]/40 bg-[var(--color-gold)]/10 px-3 py-1 text-xs">
                    <span>🔍 只顯示 {filterStatusSet.size} 項</span>
                    <button
                      type="button"
                      onClick={clearStatusFilter}
                      className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] hover:bg-white"
                    >
                      ✕ 清除
                    </button>
                  </div>
                )}
              </div>
              {BOOKING_STATUS_FILTER_GROUPS.map((grp) => (
                <div key={grp.group} className="flex items-start gap-1.5 flex-wrap">
                  <span className="text-[10px] text-[var(--muted-foreground)] w-16 pt-1.5 text-right">
                    {grp.group}
                  </span>
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {grp.items.map(({ key, label }) => {
                      const active = filterStatusSet.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleStatusFilter(key)}
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1",
                            active
                              ? "bg-[var(--color-ocean-deep)] text-white"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                          )}
                        >
                          {active && <span className="text-[10px]">✓</span>}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {/* v321：付款 filter chip 列移除（已合併進狀態 filter） */}
          </div>

          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted-foreground)]"
                    style={{ background: "var(--muted)" }}>
                    {/* v321：付款欄移除（狀態欄已涵蓋付款進度，重複資訊） */}
                    <th className="px-2 py-3 font-medium" style={{ width: "1%" }}><SortBtn k="code" curK={sortKey} dir={sortDir} onClick={toggleSort}>編號</SortBtn></th>
                    <th className="px-3 py-3 font-medium"><SortBtn k="type" curK={sortKey} dir={sortDir} onClick={toggleSort}>類型</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="customer" curK={sortKey} dir={sortDir} onClick={toggleSort}>客戶</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="date" curK={sortKey} dir={sortDir} onClick={toggleSort}>場次時間</SortBtn></th>
                    <th className="px-4 py-3 font-medium">地點 / 行程</th>
                    <th className="px-4 py-3 font-medium text-right"><SortBtn k="amount" curK={sortKey} dir={sortDir} onClick={toggleSort} align="right">金額</SortBtn></th>
                    <th className="px-4 py-3 font-medium text-right"><SortBtn k="paid" curK={sortKey} dir={sortDir} onClick={toggleSort} align="right">已付</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="method" curK={sortKey} dir={sortDir} onClick={toggleSort}>方式</SortBtn></th>
                    <th className="px-4 py-3 font-medium"><SortBtn k="status" curK={sortKey} dir={sortDir} onClick={toggleSort}>狀態</SortBtn></th>
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
                          setAdjAmount("");
                          setAdjNote("");
                          setAdjKind("transfer");
                          setEditTotal(false);
                        }}
                      >
                        {/* v320：訂單編號縮到最小 */}
                        <td className="px-2 py-2.5 whitespace-nowrap" style={{ width: "1%" }}>
                          {b.code ? (
                            <span className="inline-block rounded bg-teal-50 px-1 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-teal-800">
                              {b.code}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[var(--muted-foreground)]">—</span>
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
                        {/* v320：客戶名可點 → 開全站統一客戶詳情 modal */}
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setOpenCustomerId(b.user.lineUserId); }}
                            className="text-left text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                          >
                            {b.user.realName ?? b.user.displayName}
                          </button>
                        </td>
                        {/* v321：付款欄移除（狀態欄已涵蓋） */}
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
                        {/* v320：方式先（原本中段） */}
                        <td className="px-4 py-2.5 text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                          {PAYMENT_METHOD_LABEL[b.paymentMethod ?? ""] ?? b.paymentMethod ?? "—"}
                        </td>
                        {/* v320：狀態移到方式之後（更靠近操作欄，老闆順手點動作） */}
                        <td className="px-4 py-2.5">
                          <div className="flex flex-col gap-1 items-start">
                            {(() => {
                              const d = deriveBookingDisplay({
                                status: b.status,
                                paymentStatus: b.paymentStatus,
                                createdAt: b.createdAt,
                                activityDate: b.ref?.date ?? b.ref?.dateStart ?? null,
                              });
                              return (
                                <Badge variant={d.variant} className="text-[10px] whitespace-nowrap">
                                  {d.label}
                                </Badge>
                              );
                            })()}
                            {b.totalAmount > 0 && b.paidAmount > 0 && b.paidAmount < b.totalAmount && (
                              <span className="inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-700 whitespace-nowrap tabular-nums">
                                已付 {b.paidAmount.toLocaleString()} / {b.totalAmount.toLocaleString()}
                              </span>
                            )}
                            {b.refundRequest?.status === "pending_customer" && (
                              <span className="inline-flex rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-700 whitespace-nowrap">
                                💸 退款待客戶確認
                              </span>
                            )}
                            {b.refundRequest?.status === "pending_admin" && (
                              <span className="inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] text-red-700 whitespace-nowrap font-bold animate-pulse">
                                🔔 客戶申請退款待審核
                              </span>
                            )}
                            {b.refundRequest?.status === "questioning" && (
                              <span className="inline-flex rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] text-orange-700 whitespace-nowrap font-bold">
                                ⚠️ 客戶有疑問
                              </span>
                            )}
                            {b.refundRequest?.status === "accepted" && (
                              <span className="inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] text-green-700 whitespace-nowrap">
                                ✓ 客戶已同意（待處理）
                              </span>
                            )}
                            {b.refundRequest?.status === "rejected_by_admin" && (
                              <span className="inline-flex rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-600 whitespace-nowrap">
                                ✗ 退款已拒絕
                              </span>
                            )}
                          </div>
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
                                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
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
        <DialogContent className="max-h-[90vh] max-w-[min(95vw,1200px)] overflow-y-auto sm:max-w-[min(95vw,1200px)]">
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
                    {/* v366：💰 金額（總/已付/剩餘 三欄）+ 可展開修改總金額 */}
                    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                      <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold" style={{ color: "#0A2342" }}>💰 金額</div>
                      <div className="p-3">
                        <div className="grid grid-cols-3 text-center">
                          <div className="px-1 border-r border-[var(--border)]">
                            <div className="text-[11px] text-[var(--muted-foreground)]">總金額</div>
                            <div className="text-lg font-extrabold tabular-nums" style={{ color: "#0A2342" }}>{editing.totalAmount.toLocaleString()}</div>
                          </div>
                          <div className="px-1 border-r border-[var(--border)]">
                            <div className="text-[11px] text-[var(--muted-foreground)]">已付款</div>
                            <div className="text-lg font-extrabold tabular-nums"
                              style={{ color: editing.paidAmount >= editing.totalAmount && editing.totalAmount > 0 ? "#16a34a" : editing.paidAmount > 0 ? "#0A2342" : "#94a3b8" }}>
                              {editing.paidAmount.toLocaleString()}
                            </div>
                          </div>
                          <div className="px-1">
                            <div className="text-[11px] text-[var(--muted-foreground)]">剩餘款</div>
                            <div className="text-lg font-extrabold tabular-nums" style={{ color: owed > 0 ? "var(--color-coral)" : "#16a34a" }}>{owed.toLocaleString()}</div>
                          </div>
                        </div>
                        {!locked && (editTotal ? (
                          <div className="mt-2 flex items-center gap-2">
                            <NumberInput min={0} value={editing.totalAmount} className="flex-1"
                              onChange={(n) => setEditing({ ...editing, totalAmount: n })} />
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditTotal(false)}>完成</Button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setEditTotal(true)}
                            className="mt-2 block ml-auto text-[11px] font-semibold" style={{ color: "#0e9f93" }}>✎ 修改總金額</button>
                        ))}
                      </div>
                    </div>

                    {/* v366：🧾 付款紀錄 */}
                    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                      <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold" style={{ color: "#0A2342" }}>🧾 付款紀錄</div>
                      <div className="px-3 py-1">
                        {(() => {
                          const entriesSum = entries.reduce((s, e) => s + e.amount, 0);
                          const priorPaid = editing.paidAmount - entriesSum;
                          const hasRows = entries.length > 0 || priorPaid > 0;
                          return (
                            <>
                              {entriesLoading && entries.length === 0 && (
                                <div className="py-3 text-center text-[11px] text-[var(--muted-foreground)]">載入中…</div>
                              )}
                              {!entriesLoading && !hasRows && (
                                <div className="py-3 text-center text-[11px] text-[var(--muted-foreground)]">尚無付款紀錄</div>
                              )}
                              {priorPaid > 0 && (
                                <div className="flex items-center gap-2 py-2 border-b border-dashed border-[var(--border)] text-[13px]">
                                  <span className="text-[11px] text-[var(--muted-foreground)] w-[92px]">先前已付</span>
                                  <span className="font-bold tabular-nums text-right w-[72px]" style={{ color: "#0A2342" }}>{priorPaid.toLocaleString()}</span>
                                  <span className="text-[10px] text-[var(--muted-foreground)]">（未明細化）</span>
                                </div>
                              )}
                              {entries.map((e) => {
                                const m = PAYMENT_KIND_META[e.kind] ?? { label: e.kind, cat: "discount" as const };
                                const bs = PAYMENT_BADGE_STYLE[m.cat];
                                return (
                                  <div key={e.id} className="flex items-center gap-2 py-2 border-b border-dashed border-[var(--border)] last:border-0 text-[13px]">
                                    <span className="text-[11px] text-[var(--muted-foreground)] w-[92px] tabular-nums">{fmtEntryDate(e.createdAt)}</span>
                                    <span className="font-bold tabular-nums text-right w-[72px]" style={{ color: e.amount >= 0 ? "#047857" : "var(--color-coral)" }}>
                                      {e.amount >= 0 ? "+" : ""}{e.amount.toLocaleString()}
                                    </span>
                                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={bs}>
                                      {m.label}{e.note ? `・${e.note}` : ""}
                                    </span>
                                    {!locked && (
                                      <button type="button" onClick={() => deleteEntry(e)}
                                        className="ml-auto text-slate-300 hover:text-[var(--color-coral)] text-xs">✕</button>
                                    )}
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>

                    {/* v366：➕ 金額調整（新增一筆付款/折抵，取代舊「新增付款」+「助教減免」）*/}
                    {!locked && owed > 0 && (
                      <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                        <div className="bg-slate-50 px-3 py-1.5 text-xs font-bold" style={{ color: "#0A2342" }}>➕ 金額調整（新增一筆付款紀錄）</div>
                        <div className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <select value={adjKind} onChange={(e) => setAdjKind(e.target.value)}
                              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm">
                              <option value="transfer">🏦 轉帳（實收）</option>
                              <option value="cash">💵 現金（實收）</option>
                              <option value="linepay">💚 LINE Pay（實收）</option>
                              <option value="credit">⭐ 抵用金折抵</option>
                              <option value="boss_discount">🎁 老闆折抵</option>
                              <option value="assistant">🔱 助教減免</option>
                              <option value="other">✏️ 其他（需說明）</option>
                            </select>
                            <Input type="text" inputMode="numeric" value={adjAmount}
                              onChange={(e) => setAdjAmount(e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1"))}
                              placeholder={`≤ 剩餘 ${owed.toLocaleString()}`} disabled={addingEntry} />
                          </div>
                          {adjKind === "other" && (
                            <Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)}
                              placeholder="說明（其他項目必填）例：員工眷屬優惠" disabled={addingEntry} />
                          )}
                          <div className="flex gap-1.5 flex-wrap">
                            <button type="button" onClick={() => setAdjAmount(String(Math.round(editing.totalAmount * 0.3)))}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600">
                              訂金 30% ({Math.round(editing.totalAmount * 0.3).toLocaleString()})
                            </button>
                            <button type="button" onClick={() => setAdjAmount(String(Math.round(editing.totalAmount * 0.5)))}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-cyan-400 hover:text-cyan-600">
                              訂金 50% ({Math.round(editing.totalAmount * 0.5).toLocaleString()})
                            </button>
                            <button type="button" onClick={() => setAdjAmount(String(owed))}
                              className="rounded-md border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-100">
                              補齊剩餘 {owed.toLocaleString()}
                            </button>
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            ⚠️ 金額不可超過剩餘款 <b style={{ color: "var(--color-coral)" }}>{owed.toLocaleString()}</b>，確認後立即寫入付款紀錄並更新已付款。
                          </div>
                          <Button className="w-full" disabled={addingEntry || !adjAmount || parseInt(adjAmount, 10) <= 0}
                            onClick={confirmAddEntry} style={{ background: "#0e9f93", color: "#fff" }}>
                            {addingEntry ? "處理中…" : "✓ 確認，新增此筆"}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">付款方式</Label>
                      <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
                        value={editing.paymentMethod ?? ""}
                        disabled={locked}
                        onChange={(e) => setEditing({ ...editing, paymentMethod: e.target.value || undefined })}>
                        <option value="">— 未選 —</option>
                        <option value="bank">銀行轉帳</option>
                        <option value="linepay">LINE Pay</option>
                        <option value="other">其他</option>
                        {/* v309：cash 為 legacy 舊訂單顯示用，新訂單不允許 */}
                        {editing.paymentMethod === "cash" && <option value="cash">現場（舊）</option>}
                      </select>
                    </div>
                    {/* v327：合併為單一「訂單狀態」下拉（含付款進度）— 反推回 DB 兩維度 */}
                    <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                      <Label className="text-xs">訂單狀態</Label>
                      {(() => {
                        // 退款狀態鎖死、由「退款」按鈕自動寫入
                        if (editing.paymentStatus === "refunded" || editing.paymentStatus === "refunding") {
                          const derived = deriveBookingDisplay({
                            status: editing.status,
                            paymentStatus: editing.paymentStatus,
                            createdAt: editing.createdAt,
                          });
                          return (
                            <div className="rounded-md border px-2 py-1.5 text-sm font-semibold"
                              style={{ borderColor: "var(--color-coral)", background: "rgba(255,123,90,0.08)", color: "var(--color-coral)" }}>
                              🔒 {derived.label}（系統自動）
                            </div>
                          );
                        }
                        const currentKey = deriveBookingDisplay({
                          status: editing.status,
                          paymentStatus: editing.paymentStatus,
                          createdAt: editing.createdAt,
                        }).key;
                        return (
                          <select className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm disabled:opacity-50"
                            value={currentKey}
                            disabled={locked}
                            onChange={(e) => {
                              const key = e.target.value as BookingStatusKey;
                              const mapped = reverseDerivedStatus(key);
                              setEditing({
                                ...editing,
                                ...(mapped.bookingStatus !== undefined ? { status: mapped.bookingStatus } : {}),
                                ...(mapped.paymentStatus !== undefined ? { paymentStatus: mapped.paymentStatus } : {}),
                              });
                            }}>
                            {BOOKING_STATUS_EDITABLE_KEYS.map(({ key, label }) => (
                              <option key={key} value={key}>{label}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)] pl-[7rem]">
                      💡 已合併付款狀態 — 選對應的狀態，系統會自動寫入訂單 + 付款兩維度
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
                        <Input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="退款原因（選填，給客戶看）" />
                      </div>
                      {/* v275：退款備註（內部用，記實際退款管道） */}
                      <Input
                        value={refundNote}
                        onChange={(e) => setRefundNote(e.target.value)}
                        placeholder="退款備註（內部）例：LINE Pay 訂單 #12345 / 匯款 X 銀行 482324"
                        className="text-xs"
                      />
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

                {/* v280：客戶發起的退款申請（pending_admin）— 審核按鈕 */}
                {editing.refundRequest?.status === "pending_admin" && editing.refundRequest.initiatedBy === "customer" && (
                  <CustomerRefundReviewPanel
                    booking={editing}
                    onResolved={async () => {
                      // 重抓資料
                      const d = await adminFetch<{ bookings: AdminBooking[] }>("/api/admin/bookings");
                      setBookings(d.bookings);
                      const updated = d.bookings.find((b) => b.id === editing.id);
                      if (updated) setEditing(updated);
                    }}
                  />
                )}

                {/* v262：客戶簽名 + 簽署 metadata（法律證據） */}
                {(editing.signatureImageUrl || editing.signedAt) && (
                  <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                    <Label className="text-xs pt-1.5">
                      ✍️ 客戶簽名
                      <span className="block font-normal text-[10px] text-[var(--muted-foreground)]">法律證據</span>
                    </Label>
                    <div className="space-y-1.5">
                      {editing.signatureImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={editing.signatureImageUrl}
                          alt="customer signature"
                          className="max-h-32 rounded-md border bg-white"
                          style={{ borderColor: "var(--border)" }}
                        />
                      ) : (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          （簽名圖未上傳，可能是 R2 未設定或網路問題）
                        </div>
                      )}
                      {editing.signedAt && (
                        <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                          🕒 {new Date(editing.signedAt).toLocaleString("zh-TW")}
                        </div>
                      )}
                      {editing.signedFromUserAgent && (
                        <div className="text-[10px] text-[var(--muted-foreground)] truncate" title={editing.signedFromUserAgent}>
                          📱 {editing.signedFromUserAgent}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* v278：訂單狀態歷史 (event log) */}
              {editing.statusLogs && editing.statusLogs.length > 0 && (
                <div className="rounded-md p-3" style={{ border: "1px solid var(--border)" }}>
                  <div className="mb-2 text-sm font-semibold flex items-center gap-2">
                    📋 訂單狀態歷史
                    <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                      ({editing.statusLogs.length} 筆)
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {editing.statusLogs.map((log) => (
                      <div key={log.id} className="flex gap-3 items-start text-[11px] border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
                        <div className="flex-shrink-0 font-mono text-[10px] text-[var(--muted-foreground)] w-24">
                          {new Date(log.createdAt).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">
                            {log.fromStatus
                              ? `${BOOKING_STATUS_LABEL[log.fromStatus] ?? log.fromStatus} → ${BOOKING_STATUS_LABEL[log.toStatus] ?? log.toStatus}`
                              : `初始：${BOOKING_STATUS_LABEL[log.toStatus] ?? log.toStatus}`}
                          </span>
                          {log.note && (
                            <span className="ml-1 text-[var(--muted-foreground)]">— {log.note}</span>
                          )}
                          <span className="ml-1 inline-flex rounded-full bg-[var(--muted)] px-1.5 py-0 text-[9px] text-[var(--muted-foreground)]">
                            {log.actorRole}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                        {(p.previewUrl ?? p.thumb) ? (
                          // v379：大圖優先 R2 presigned，沒有就退 DB 縮圖（至少看得到）
                          <a href={p.previewUrl ?? p.thumb ?? "#"} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={p.previewUrl ?? p.thumb ?? ""} alt="付款憑證"
                              className="w-full h-32 object-cover rounded border" style={{ borderColor: "var(--border)" }} />
                          </a>
                        ) : !p.imageKey ? (
                          // v393：客戶只填後 5 碼、沒上傳截圖
                          <div className="h-32 flex flex-col items-center justify-center gap-1 text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded border border-dashed" style={{ borderColor: "var(--border)" }}>
                            <ImageOff className="h-6 w-6 opacity-50" />
                            無圖片（僅填後 5 碼）
                          </div>
                        ) : (
                          <div className="h-32 flex items-center justify-center text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded">
                            （已清理 / 載入失敗）
                          </div>
                        )}
                        {/* v308：日期顏色由淡灰改深灰，已核可由螢光綠改深綠，提升白底可讀性 */}
                        <div className="text-[10px] text-slate-700">
                          上傳：{new Date(p.uploadedAt).toLocaleDateString("zh-TW")}
                        </div>
                        {p.verifiedAt ? (
                          <div className="text-[10px] font-semibold text-emerald-700">
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

              {/* v335：🚨 危險區 — 永久刪除（boss only） */}
              {adminUser?.effectiveRoles.includes("boss") && (
                <div className="mt-4 rounded-lg border-2 border-rose-400 bg-rose-50 p-3">
                  <div className="text-xs font-bold text-rose-900 mb-2">🚨 危險區 — 永久刪除</div>
                  <p className="text-[11px] text-rose-800 mb-2 leading-relaxed">
                    完全從資料庫移除這筆訂單，**包含**付款證明、退款紀錄、狀態歷史。
                    僅用於測試訂單 / 爛資料 / 垃圾單。<b>正常取消請走「取消訂單」</b>。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    style={{ borderColor: "rgb(220, 38, 38)", color: "rgb(220, 38, 38)" }}
                    onClick={async () => {
                      if (!editing) return;
                      const code = editing.code ?? editing.id.slice(0, 8);
                      const confirm1 = window.prompt(
                        `🚨 永久刪除訂單 ${code}\n\n此動作無法復原。請打字 DELETE 確認：`,
                      );
                      if (confirm1 !== "DELETE") {
                        if (confirm1 !== null) alert("取消刪除（未正確輸入 DELETE）");
                        return;
                      }
                      const reason = window.prompt("請填寫刪除原因（會寫入審計紀錄）：", "測試訂單");
                      if (reason === null) return;
                      try {
                        const r = await adminFetch<{ ok: boolean; deleted?: { paymentProofs: number; reminderLogs: number; refundRequests: number } }>(
                          `/api/admin/bookings/${editing.id}/hard-delete`,
                          {
                            method: "DELETE",
                            body: JSON.stringify({ confirm: "DELETE", reason }),
                          },
                        );
                        alert(
                          `✓ 已永久刪除 ${code}\n\n連動刪除：\n• 付款證明 ${r.deleted?.paymentProofs ?? 0} 筆\n• 提醒紀錄 ${r.deleted?.reminderLogs ?? 0} 筆\n• 退款申請 ${r.deleted?.refundRequests ?? 0} 筆\n\n已寫入審計紀錄。`,
                        );
                        setEditing(null);
                        setBookings((prev) => prev.filter((b) => b.id !== editing.id));
                      } catch (e) {
                        alert("永久刪除失敗：" + (e instanceof Error ? e.message : String(e)));
                      }
                    }}
                  >
                    🗑 永久刪除此訂單（不可復原）
                  </Button>
                </div>
              )}
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

      {/* v314：儲存前差異確認 dialog */}
      <Dialog open={pendingDiff !== null} onOpenChange={(o) => !o && setPendingDiff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>確認變更內容</DialogTitle>
          </DialogHeader>
          {pendingDiff && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-[var(--muted-foreground)]">
                以下欄位將被修改，確認無誤後送出。
              </p>
              <div className="rounded-md border border-[var(--border)] divide-y divide-[var(--border)]">
                {pendingDiff.map((d) => (
                  <div key={d.key} className="p-2.5 text-xs">
                    <div className="font-semibold text-[var(--foreground)] mb-1">{d.label}</div>
                    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <span className="line-through opacity-60">{d.from}</span>
                      <span className="text-[var(--color-coral)]">→</span>
                      <span className="text-emerald-700 font-semibold">{d.to}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setPendingDiff(null)}>
                  取消
                </Button>
                <Button size="sm" disabled={saving} onClick={doSaveEdit}>
                  {saving ? "儲存中..." : "✓ 確認儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* v317：客戶聯絡 dialog — 一個訊息框、勾選通道、一次送出 */}
      <Dialog open={customerActionFor !== null} onOpenChange={(o) => {
        if (!o) {
          setCustomerActionFor(null);
          setContactMessage("");
          setContactEmailSubject("");
          setContactResult(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              聯絡客戶：{customerActionFor?.user.realName ?? customerActionFor?.user.displayName}
            </DialogTitle>
          </DialogHeader>
          {customerActionFor && (
            <div className="space-y-3 text-sm">
              {/* 客戶基本資訊 */}
              <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3 text-xs space-y-1">
                <div><span className="text-[var(--muted-foreground)]">電話：</span><span className="tabular-nums font-mono">{customerActionFor.user.phone ?? "—"}</span></div>
                <div><span className="text-[var(--muted-foreground)]">Email：</span><span className="font-mono break-all">{customerActionFor.user.email ?? "—"}</span></div>
                <div><span className="text-[var(--muted-foreground)]">訂單：</span><span className="font-mono">{customerActionFor.code ?? customerActionFor.id.slice(0, 8)}</span></div>
              </div>

              {/* 通道勾選 */}
              <div>
                <Label className="text-xs">透過哪個通道發送？</Label>
                <div className="mt-1 flex gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={contactChannelLine}
                      onChange={(e) => setContactChannelLine(e.target.checked)}
                    />
                    <span>📱 LINE 私訊</span>
                  </label>
                  <label className={cn(
                    "flex items-center gap-1.5",
                    !customerActionFor.user.email && "opacity-50 cursor-not-allowed"
                  )}>
                    <input
                      type="checkbox"
                      checked={contactChannelEmail && !!customerActionFor.user.email}
                      disabled={!customerActionFor.user.email}
                      onChange={(e) => setContactChannelEmail(e.target.checked)}
                    />
                    <span>📧 Email{!customerActionFor.user.email && "（客戶未填）"}</span>
                  </label>
                </div>
              </div>

              {/* Email 主旨（只在勾 Email 時顯示） */}
              {contactChannelEmail && customerActionFor.user.email && (
                <div>
                  <Label className="text-xs">Email 主旨（選填）</Label>
                  <Input
                    value={contactEmailSubject}
                    onChange={(e) => setContactEmailSubject(e.target.value.slice(0, 200))}
                    placeholder={`預設：東北角海王子潛水 — 訊息通知`}
                  />
                </div>
              )}

              {/* 訊息內容 */}
              <div>
                <Label className="text-xs">訊息內容</Label>
                <textarea
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value.slice(0, 2000))}
                  placeholder="輸入想發送給客戶的訊息（最多 2000 字）"
                  rows={5}
                  className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
                <div className="mt-1 text-[10px] text-right text-[var(--muted-foreground)]">
                  {contactMessage.length} / 2000
                </div>
              </div>

              {/* 送出按鈕 */}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={
                    !contactMessage.trim() ||
                    contactBusy ||
                    (!contactChannelLine && !contactChannelEmail)
                  }
                  onClick={async () => {
                    if (!customerActionFor) return;
                    const channels: string[] = [];
                    if (contactChannelLine) channels.push("line");
                    if (contactChannelEmail && customerActionFor.user.email) channels.push("email");
                    if (channels.length === 0) return;
                    setContactBusy(true);
                    setContactResult(null);
                    try {
                      const r = await adminFetch<{ ok: boolean; results: Record<string, { ok: boolean; error?: string }> }>(
                        `/api/admin/contact-customer`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            userId: customerActionFor.user.lineUserId,
                            message: contactMessage,
                            channels,
                            emailSubject: contactEmailSubject || undefined,
                          }),
                        },
                      );
                      const parts: string[] = [];
                      if (r.results.line) parts.push(`LINE：${r.results.line.ok ? "✓" : "❌ " + r.results.line.error}`);
                      if (r.results.email) parts.push(`Email：${r.results.email.ok ? "✓" : "❌ " + r.results.email.error}`);
                      setContactResult((r.ok ? "✓ 全部送出成功 — " : "⚠ 部分失敗 — ") + parts.join(" / "));
                      if (r.ok) {
                        setContactMessage("");
                        setContactEmailSubject("");
                      }
                    } catch (e) {
                      setContactResult("❌ 送出失敗：" + (e instanceof Error ? e.message : String(e)));
                    } finally {
                      setContactBusy(false);
                    }
                  }}
                >
                  {contactBusy ? "送出中..." : "📤 送出訊息"}
                </Button>
              </div>

              {contactResult && (
                <div className={`rounded-md p-2 text-xs ${contactResult.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : contactResult.startsWith("⚠") ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
                  {contactResult}
                </div>
              )}

              {/* 編輯訂單 */}
              <div className="pt-2 border-t border-[var(--border)]">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setEditing(customerActionFor);
                    setCustomerActionFor(null);
                  }}
                >
                  ✏ 編輯此訂單
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* v320：全站統一客戶詳情 modal */}
      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />
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

// v280：客戶發起的退款審核 panel
function CustomerRefundReviewPanel({
  booking,
  onResolved,
}: {
  booking: AdminBooking;
  onResolved: () => void | Promise<void>;
}) {
  const rr = booking.refundRequest!;
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);
  const [showApprove, setShowApprove] = React.useState(false);
  const [showReject, setShowReject] = React.useState(false);
  const [editMethod, setEditMethod] = React.useState<"cash" | "credit">(rr.method as "cash" | "credit");
  const [editAmount, setEditAmount] = React.useState(String(rr.amount));
  const [editBonusPct, setEditBonusPct] = React.useState(String(rr.creditBonusPct ?? 0));
  const [editRefundNote, setEditRefundNote] = React.useState("");
  const [rejectReason, setRejectReason] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  async function approve() {
    setBusy("approve");
    setErr(null);
    try {
      await adminFetch(`/api/admin/refund-request/${rr.id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          decision: "approve",
          method: editMethod,
          amount: Number(editAmount),
          creditBonusPct: Number(editBonusPct),
          refundNote: editRefundNote || undefined,
        }),
      });
      await onResolved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function reject() {
    if (rejectReason.trim().length < 3) { setErr("拒絕理由至少 3 字"); return; }
    setBusy("reject");
    setErr(null);
    try {
      await adminFetch(`/api/admin/refund-request/${rr.id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision: "reject", rejectReason }),
      });
      await onResolved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-md p-3" style={{ border: "2px solid var(--color-coral)", background: "rgba(255,80,65,0.04)" }}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-coral)" }}>
        🔔 客戶發起退款申請（待您審核）
      </div>
      <div className="space-y-1.5 text-xs">
        <div>
          <span className="text-[var(--muted-foreground)]">退款方式：</span>
          <b>{rr.method === "credit" ? "🎁 抵用金" : "💵 現金"}</b>
        </div>
        <div>
          <span className="text-[var(--muted-foreground)]">退款金額：</span>
          <b>NT$ {rr.amount.toLocaleString()}</b>
          <span className="text-[10px] text-[var(--muted-foreground)] ml-1">
            （已付 NT$ {booking.paidAmount.toLocaleString()}）
          </span>
        </div>
        {rr.reason && (
          <div>
            <span className="text-[var(--muted-foreground)]">客戶理由：</span>
            <span>{rr.reason}</span>
          </div>
        )}
      </div>

      {!showApprove && !showReject && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
            onClick={() => setShowApprove(true)}
          >
            ✓ 核准
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowReject(true)}>
            ✗ 拒絕
          </Button>
        </div>
      )}

      {showApprove && (
        <div className="mt-3 space-y-2 rounded p-3 bg-white" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs font-medium">確認退款參數（可調整）</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded border px-2 py-1.5 text-sm"
              style={{ borderColor: "var(--border)" }}
              value={editMethod}
              onChange={(e) => setEditMethod(e.target.value as "cash" | "credit")}
            >
              <option value="credit">🎁 抵用金</option>
              <option value="cash">💵 現金</option>
            </select>
            <Input type="text" inputMode="numeric" value={editAmount} onChange={(e) => setEditAmount(e.target.value.replace(/\D/g, ""))} placeholder="金額" />
          </div>
          {editMethod === "credit" && (
            <div>
              <Label className="block text-[10px] text-[var(--muted-foreground)] mb-0.5">抵用金加成 %（0=不加）</Label>
              <Input type="text" inputMode="numeric" value={editBonusPct} onChange={(e) => setEditBonusPct(e.target.value.replace(/\D/g, ""))} placeholder="0" />
            </div>
          )}
          <Input value={editRefundNote} onChange={(e) => setEditRefundNote(e.target.value)} placeholder="退款備註（內部）例：LINE Pay 訂單 #12345" className="text-xs" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowApprove(false)}>取消</Button>
            <Button size="sm" disabled={busy !== null || !Number(editAmount)} onClick={approve} style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
              {busy === "approve" ? "處理中..." : "確認執行"}
            </Button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="mt-3 space-y-2 rounded p-3 bg-white" style={{ border: "1px solid var(--border)" }}>
          <p className="text-xs font-medium">拒絕理由（會以 LINE 通知客戶）</p>
          <textarea
            className="w-full rounded border px-2 py-1.5 text-sm"
            style={{ borderColor: "var(--border)" }}
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="例：訂單已逾退款期限 / 此筆訂單已退過款 / ..."
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowReject(false)}>取消</Button>
            <Button size="sm" disabled={busy !== null} onClick={reject} style={{ background: "var(--color-coral)", color: "white" }}>
              {busy === "reject" ? "處理中..." : "拒絕並通知"}
            </Button>
          </div>
        </div>
      )}

      {err && <p className="mt-2 text-xs text-[var(--color-coral)]">{err}</p>}
    </div>
  );
}
