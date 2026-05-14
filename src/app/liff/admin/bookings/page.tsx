"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { X, AlertTriangle, Edit3 } from "lucide-react";

interface AdminBooking {
  id: string;
  type: "daily" | "tour";
  status: string;
  paymentStatus: string;
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

export default function AdminBookingsPage() {
  // Next.js 預渲染 client component 用 useSearchParams 時要 Suspense 包
  return (
    <Suspense fallback={null}>
      <AdminBookingsContent />
    </Suspense>
  );
}

function AdminBookingsContent() {
  const liff = useLiff();
  const searchParams = useSearchParams();
  // ?filter=active 從主控台「總訂單」卡進來時，預設選「進行中」tab
  const initialTab = searchParams.get("filter") === "active" ? "up" : "all";
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminBooking | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    liff
      .fetchWithAuth<{ bookings: AdminBooking[] }>("/api/admin/bookings")
      .then((d) => setBookings(d.bookings))
      .catch((e) => setErr(e.message));
  }, [liff]);

  const all = bookings;
  const upcoming = bookings.filter(
    (b) => b.status === "pending" || b.status === "confirmed",
  );
  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) => b.status.startsWith("cancelled"));

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await liff.fetchWithAuth<{
        ok: boolean;
        booking: AdminBooking;
      }>(`/api/admin/bookings/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          participants: editing.participants,
          totalAmount: editing.totalAmount,
          paidAmount: editing.paidAmount,
          paymentStatus: editing.paymentStatus,
          status: editing.status,
        }),
      });
      setBookings((arr) =>
        arr.map((x) => (x.id === editing.id ? { ...x, ...r.booking } : x)),
      );
      setEditing(null);
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function cancelBooking(b: AdminBooking) {
    if (!confirm(`取消訂單「${b.user.realName ?? b.user.displayName}」？`))
      return;
    try {
      await liff.fetchWithAuth(`/api/admin/bookings/${b.id}`, {
        method: "DELETE",
      });
      setBookings((arr) =>
        arr.map((x) =>
          x.id === b.id ? { ...x, status: "cancelled_by_user" } : x,
        ),
      );
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function deleteBooking(b: AdminBooking) {
    const ok1 = confirm(
      `⚠ 永久刪除訂單？\n\n` +
        `會員：${b.user.realName ?? b.user.displayName}\n` +
        `類型：${b.type === "daily" ? "日潛" : "潛水團"}\n\n` +
        `會一併刪除轉帳截圖 + 提醒記錄。無法復原。`,
    );
    if (!ok1) return;
    const ok2 = prompt(`輸入「DELETE」確認永久刪除：`);
    if (ok2 !== "DELETE") {
      alert("取消");
      return;
    }
    try {
      await liff.fetchWithAuth(
        `/api/admin/bookings/${b.id}?permanent=true`,
        { method: "DELETE" },
      );
      setBookings((arr) => arr.filter((x) => x.id !== b.id));
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function cancelAllBookings() {
    const activeCount = upcoming.length;
    if (activeCount === 0) {
      alert("沒有進行中的訂單");
      return;
    }
    if (
      !confirm(
        `⚠ 取消全部 ${activeCount} 筆進行中訂單？\n\n` +
          `所有 pending / confirmed 訂單會被設成 cancelled_by_user。\n` +
          `不會刪 row，可在「取消」tab 看到歷史紀錄。`,
      )
    )
      return;
    const ok2 = prompt(`輸入「CANCEL-ALL」確認：`);
    if (ok2 !== "CANCEL-ALL") {
      alert("取消");
      return;
    }
    try {
      const r = await liff.fetchWithAuth<{
        ok: boolean;
        cancelled: number;
      }>("/api/admin/bookings/cancel-all", {
        method: "POST",
        body: JSON.stringify({ confirm: "CANCEL-ALL-BOOKINGS" }),
      });
      alert(`✓ 已取消 ${r.cancelled} 筆訂單`);
      // 重新拉資料
      liff
        .fetchWithAuth<{ bookings: AdminBooking[] }>("/api/admin/bookings")
        .then((d) => setBookings(d.bookings));
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function exportCsv() {
    const res = await fetch("/api/admin/bookings/csv?lineUserId=" + (liff.profile?.userId ?? ""));
    if (!res.ok) {
      alert("匯出失敗：" + (await res.text()));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <LiffShell
      title="訂單管理"
      backHref="/liff/admin/dashboard"
      rightSlot={
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={exportCsv}>
            匯出 CSV
          </Button>
          {upcoming.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={cancelAllBookings}
              className="border-[var(--color-coral)] text-[var(--color-coral)]"
            >
              全部取消 ({upcoming.length})
            </Button>
          )}
        </div>
      }
    >
      <div className="px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}
        <Tabs defaultValue={initialTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">全部 ({all.length})</TabsTrigger>
            <TabsTrigger value="up">進行中 ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="done">完成 ({completed.length})</TabsTrigger>
            <TabsTrigger value="cancel">取消 ({cancelled.length})</TabsTrigger>
          </TabsList>
          {(
            [
              ["all", all],
              ["up", upcoming],
              ["done", completed],
              ["cancel", cancelled],
            ] as const
          ).map(([v, list]) => (
            <TabsContent key={v} value={v} className="space-y-2">
              {list.map((b) => (
                <Card key={b.id}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-bold">
                          {b.user.realName ?? b.user.displayName}
                          {b.overCapacity && (
                            <Badge variant="coral" className="text-[9px]">
                              超賣
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] tabular">
                          {b.user.phone ?? "—"}
                        </div>
                        <div className="mt-0.5 text-xs tabular text-[var(--foreground)]">
                          {b.type === "daily"
                            ? `${b.ref.date ?? "—"} ${b.ref.startTime ?? ""} · ${(b.ref.sites ?? []).join("・")}`
                            : `${b.ref.title ?? "潛水團"} · ${b.ref.dateStart ?? "—"}→${b.ref.dateEnd ?? "—"}`}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <Badge variant={b.type === "tour" ? "coral" : "muted"}>
                          {b.type === "tour" ? "潛水團" : "日潛"}
                        </Badge>
                        <div className="mt-1 text-xs tabular">
                          {b.paidAmount.toLocaleString()}/{b.totalAmount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge variant="ocean">{b.status}</Badge>
                      <Badge variant="muted">{b.paymentStatus}</Badge>
                      <span className="text-[10px] text-[var(--muted-foreground)] tabular">×{b.participants}人</span>
                      <div className="ml-auto flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing({ ...b })}
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
                            取消
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
                    </div>
                  </CardContent>
                </Card>
              ))}
              {list.length === 0 && (
                <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  無資料
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* 編輯訂單 Dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯訂單</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-2.5">
              <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] text-[var(--muted-foreground)]">
                <div className="font-bold text-[var(--foreground)]">
                  {editing.user.realName ?? editing.user.displayName}
                </div>
                <div>
                  {editing.type === "daily"
                    ? `日潛 ${editing.ref.date} ${editing.ref.startTime ?? ""}`
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
                <Label className="text-xs">付款狀態</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.paymentStatus}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      paymentStatus: e.target.value,
                    })
                  }
                >
                  {[
                    "pending",
                    "deposit_paid",
                    "fully_paid",
                    "refunding",
                    "refunded",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
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
                      {s}
                    </option>
                  ))}
                </select>
              </div>

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
    </LiffShell>
  );
}
