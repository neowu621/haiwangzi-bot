"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
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
import { ChevronDown, ChevronUp, Edit3, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────
interface AdminBooking {
  id: string;
  type: "daily" | "tour";
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  totalAmount: number;
  paidAmount: number;
  participants: number;
  overCapacity?: boolean;
  createdAt: string;
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

interface ByTripBooking {
  id: string;
  userName: string;
  phone: string | null;
  participants: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  status: string;
}

interface ByTripGroup {
  kind: "daily" | "tour";
  id: string;
  title: string;
  sites?: string[];
  tankCount?: number;
  dateStart?: string;
  dateEnd?: string;
  capacity: number | null;
  status: string;
  bookingCount: number;
  participantSum: number;
  tankSum?: number;
  paidSum: number;
  totalSum: number;
  bookings: ByTripBooking[];
}

// ── Helpers ──────────────────────────────────────────────────
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
  const [tab, setTab] = useState<"by-trip" | "all">("by-trip");
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [byTrip, setByTrip] = useState<{
    daily: ByTripGroup[];
    tour: ByTripGroup[];
  }>({ daily: [], tour: [] });
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterPayStatus, setFilterPayStatus] = useState<string>("all");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "credit">("credit");
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      adminFetch<{ bookings: AdminBooking[] }>("/api/admin/bookings"),
      adminFetch<{ daily: ByTripGroup[]; tour: ByTripGroup[] }>(
        "/api/admin/bookings/by-trip",
      ).catch(() => ({ daily: [], tour: [] })),
    ])
      .then(([b, g]) => {
        setBookings(b.bookings);
        setByTrip(g);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredBookings =
    filterPayStatus === "all"
      ? bookings
      : bookings.filter((b) => b.paymentStatus === filterPayStatus);

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

  async function doRefund() {
    if (!editing) return;
    const n = Number(refundAmount);
    if (!n || n <= 0) {
      alert("請輸入退款金額");
      return;
    }
    if (!confirm(`確定退款 NT$${n.toLocaleString()} (${refundMethod === "credit" ? "轉禮金" : "退現金"})?`))
      return;
    setRefundBusy(true);
    try {
      await adminFetch(`/api/admin/bookings/${editing.id}/refund`, {
        method: "POST",
        body: JSON.stringify({
          amount: n,
          method: refundMethod,
          reason: refundReason || undefined,
        }),
      });
      setBookings((arr) =>
        arr.map((x) =>
          x.id === editing.id ? { ...x, paymentStatus: "refunded" } : x,
        ),
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

  const allGroups = [...byTrip.daily, ...byTrip.tour];

  return (
    <AdminShell title="訂單管理">
      {/* Tab switcher */}
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("by-trip")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "by-trip"
              ? "bg-[var(--color-ocean-deep)] text-white"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
          )}
        >
          依場次
        </button>
        <button
          type="button"
          onClick={() => setTab("all")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
            tab === "all"
              ? "bg-[var(--color-ocean-deep)] text-white"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
          )}
        >
          全部訂單 ({bookings.length})
        </button>
      </div>

      {err && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{
            background: "rgba(255,123,90,0.1)",
            color: "var(--color-coral)",
            border: "1px solid rgba(255,123,90,0.3)",
          }}
        >
          {err}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          載入中...
        </div>
      )}

      {/* ── By-trip view ─────────────────────────────── */}
      {!loading && tab === "by-trip" && (
        <div className="space-y-3">
          {allGroups.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              沒有開團或還沒有訂單
            </div>
          )}
          {allGroups.map((g) => {
            const key = `${g.kind}-${g.id}`;
            const expanded = expandedGroup === key;
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border"
                style={{
                  borderColor: "var(--border)",
                  background: "white",
                }}
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-[var(--muted)]/30"
                  onClick={() => setExpandedGroup(expanded ? null : key)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--foreground)]">
                        {g.title}
                      </span>
                      <Badge
                        variant={g.kind === "tour" ? "coral" : "muted"}
                        className="text-[10px]"
                      >
                        {g.kind === "tour" ? "潛水團" : "日潛"}
                      </Badge>
                      <Badge
                        variant={
                          g.status === "open"
                            ? "ocean"
                            : g.status === "cancelled"
                              ? "coral"
                              : "muted"
                        }
                        className="text-[10px]"
                      >
                        {g.status}
                      </Badge>
                    </div>
                    {g.kind === "daily" && g.sites && g.sites.length > 0 && (
                      <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                        {g.sites.join(" · ")}
                      </div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
                      <span>
                        {g.bookingCount} 筆訂單 · {g.participantSum} 人
                      </span>
                      {g.tankSum !== undefined && (
                        <span style={{ color: "var(--color-phosphor)" }}>
                          共 {g.tankSum} 支
                        </span>
                      )}
                      <span>
                        已付 NT${g.paidSum.toLocaleString()} / 總額 NT$
                        {g.totalSum.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--muted-foreground)]" />
                  )}
                </button>

                {expanded && (
                  <div
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {g.bookings.length === 0 ? (
                      <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                        沒有訂單
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr
                              className="text-left text-xs text-[var(--muted-foreground)]"
                              style={{
                                background: "var(--muted)",
                              }}
                            >
                              <th className="px-4 py-2 font-medium">姓名</th>
                              <th className="px-4 py-2 font-medium">電話</th>
                              <th className="px-4 py-2 font-medium text-right">人數</th>
                              <th className="px-4 py-2 font-medium text-right">已付/總額</th>
                              <th className="px-4 py-2 font-medium">付款狀態</th>
                              <th className="px-4 py-2 font-medium">方式</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.bookings.map((b, i) => (
                              <tr
                                key={b.id}
                                className={i % 2 === 0 ? "" : "bg-[var(--muted)]/30"}
                              >
                                <td className="px-4 py-2.5 font-medium">
                                  {b.userName}
                                </td>
                                <td className="px-4 py-2.5 tabular-nums text-xs text-[var(--muted-foreground)]">
                                  {b.phone ?? "—"}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                  ×{b.participants}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                                  {b.paidAmount.toLocaleString()}/
                                  {b.totalAmount.toLocaleString()}
                                </td>
                                <td className="px-4 py-2.5">
                                  <Badge
                                    variant={payStatusVariant(b.paymentStatus)}
                                    className="text-[10px]"
                                  >
                                    {PAYMENT_STATUS_LABEL[b.paymentStatus] ??
                                      b.paymentStatus}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-[var(--muted-foreground)]">
                                  {PAYMENT_METHOD_LABEL[b.paymentMethod] ??
                                    b.paymentMethod ??
                                    "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── All bookings flat table ──────────────────────── */}
      {!loading && tab === "all" && (
        <div className="space-y-3">
          {/* Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-[var(--muted-foreground)]">篩選付款：</span>
            {["all", "pending", "deposit_paid", "fully_paid", "refunding", "refunded"].map(
              (s) => (
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
              ),
            )}
          </div>

          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs text-[var(--muted-foreground)]"
                    style={{ background: "var(--muted)" }}
                  >
                    <th className="px-4 py-3 font-medium">日期</th>
                    <th className="px-4 py-3 font-medium">客戶</th>
                    <th className="px-4 py-3 font-medium">場次</th>
                    <th className="px-4 py-3 font-medium text-right">金額</th>
                    <th className="px-4 py-3 font-medium text-right">已付</th>
                    <th className="px-4 py-3 font-medium">狀態</th>
                    <th className="px-4 py-3 font-medium">付款</th>
                    <th className="px-4 py-3 font-medium">方式</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookings.map((b, i) => (
                    <tr
                      key={b.id}
                      className={cn(
                        "border-t",
                        i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20",
                      )}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-4 py-3 text-xs tabular-nums text-[var(--muted-foreground)]">
                        {new Date(b.createdAt).toLocaleDateString("zh-TW")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {b.user.realName ?? b.user.displayName}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                          {b.user.phone ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {b.type === "daily"
                          ? `${b.ref.date ?? "—"} ${b.ref.startTime ?? ""}`
                          : b.ref.title ?? "潛水團"}
                        {b.ref.sites && b.ref.sites.length > 0 && (
                          <div className="text-[10px] text-[var(--muted-foreground)]">
                            {b.ref.sites.join("・")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {b.totalAmount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {b.paidAmount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={bookStatusVariant(b.status)}
                          className="text-[10px]"
                        >
                          {BOOKING_STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={payStatusVariant(b.paymentStatus)}
                          className="text-[10px]"
                        >
                          {PAYMENT_STATUS_LABEL[b.paymentStatus] ??
                            b.paymentStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                        {PAYMENT_METHOD_LABEL[b.paymentMethod ?? ""] ??
                          b.paymentMethod ??
                          "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing({ ...b });
                              setRefundOpen(false);
                              setRefundAmount(String(b.paidAmount));
                            }}
                            title="編輯"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          {(b.status === "pending" ||
                            b.status === "confirmed") && (
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
                  ))}
                  {filteredBookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]"
                      >
                        無資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Dialog ───────────────────────────────── */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯訂單</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] text-[var(--muted-foreground)]">
                <div className="font-bold text-[var(--foreground)]">
                  {editing.user.realName ?? editing.user.displayName}
                </div>
                <div>
                  {editing.type === "daily"
                    ? `日潛 ${editing.ref.date ?? ""} ${editing.ref.startTime ?? ""}`
                    : `潛水團 ${editing.ref.title ?? ""}`}
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">參加人數</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editing.participants}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      participants: Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">總金額</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.totalAmount}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      totalAmount: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">已付金額</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.paidAmount}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      paidAmount: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">付款方式</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.paymentMethod ?? "cash"}
                  onChange={(e) =>
                    setEditing({ ...editing, paymentMethod: e.target.value })
                  }
                >
                  <option value="cash">現場支付</option>
                  <option value="bank">銀行轉帳</option>
                  <option value="linepay">LINE Pay</option>
                  <option value="other">其他</option>
                </select>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">付款狀態</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.paymentStatus}
                  onChange={(e) =>
                    setEditing({ ...editing, paymentStatus: e.target.value })
                  }
                >
                  {["pending", "deposit_paid", "fully_paid", "refunding", "refunded"].map(
                    (s) => (
                      <option key={s} value={s}>
                        {PAYMENT_STATUS_LABEL[s]}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">訂單狀態</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                >
                  {[
                    "pending",
                    "confirmed",
                    "cancelled_by_user",
                    "cancelled_by_weather",
                    "completed",
                    "no_show",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {BOOKING_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Refund section */}
              {editing.paidAmount > 0 &&
                editing.paymentStatus !== "refunded" && (
                  <div
                    className="rounded-md p-3 space-y-2"
                    style={{
                      border: "2px solid rgba(255,123,90,0.4)",
                      background: "rgba(255,123,90,0.05)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setRefundOpen(!refundOpen)}
                      className="flex w-full items-center justify-between text-sm font-semibold"
                      style={{ color: "var(--color-coral)" }}
                    >
                      退款處理（已付 NT$ {editing.paidAmount.toLocaleString()}）
                      {refundOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    {refundOpen && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRefundMethod("credit")}
                            className={cn(
                              "rounded-md border px-2 py-2 text-xs",
                              refundMethod === "credit"
                                ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 font-semibold"
                                : "border-[var(--border)]",
                            )}
                          >
                            轉禮金
                          </button>
                          <button
                            type="button"
                            onClick={() => setRefundMethod("cash")}
                            className={cn(
                              "rounded-md border px-2 py-2 text-xs",
                              refundMethod === "cash"
                                ? "border-[var(--color-coral)] bg-[var(--color-coral)]/15 font-semibold"
                                : "border-[var(--border)]",
                            )}
                          >
                            退現金
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={editing.paidAmount}
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            placeholder="退款金額"
                          />
                          <Input
                            value={refundReason}
                            onChange={(e) => setRefundReason(e.target.value)}
                            placeholder="原因（選填）"
                          />
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          style={{
                            background: "var(--color-coral)",
                            color: "white",
                          }}
                          disabled={refundBusy}
                          onClick={doRefund}
                        >
                          {refundBusy
                            ? "處理中..."
                            : `確認退款 NT$${Number(refundAmount || 0).toLocaleString()}`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  取消
                </Button>
                <Button onClick={saveEdit} disabled={saving}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
