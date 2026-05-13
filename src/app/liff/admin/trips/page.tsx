"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Anchor,
  Moon,
  Calendar,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  diveSiteIds: string[];
  tankCount: number;
  capacity: number | null;
  booked: number;
  coachIds: string[];
  pricing: {
    baseTrip: number;
    extraTank: number;
    nightDive: number;
    scooterRental: number;
  };
  notes: string | null;
  status: string;
}

interface Tour {
  id: string;
  title: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  basePrice: number;
  deposit: number;
  capacity: number | null;
  depositDeadline: string | null;
  finalDeadline: string | null;
  depositReminderDays: number;
  finalReminderDays: number;
  guideReminderDays: number;
  status: string;
}

interface Site {
  id: string;
  name: string;
}

interface Coach {
  id: string;
  realName: string;
  feePerDive?: number;
}

const CERTS = ["OW", "AOW", "Rescue", "DM", "Instructor"] as const;

export default function AdminTripsPage() {
  const liff = useLiff();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [editingTrip, setEditingTrip] = useState<Partial<Trip> | null>(null);
  const [editingTour, setEditingTour] = useState<Partial<Tour> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"active" | "cancelled" | "all">("active");

  const filteredTrips = useMemo(() => {
    if (filter === "active") return trips.filter((t) => t.status !== "cancelled");
    if (filter === "cancelled") return trips.filter((t) => t.status === "cancelled");
    return trips;
  }, [trips, filter]);

  const filteredTours = useMemo(() => {
    if (filter === "active") return tours.filter((t) => t.status !== "cancelled");
    if (filter === "cancelled") return tours.filter((t) => t.status === "cancelled");
    return tours;
  }, [tours, filter]);

  async function reload() {
    try {
      const [t, tr, s, c] = await Promise.all([
        liff.fetchWithAuth<{ trips: Trip[] }>("/api/admin/trips"),
        liff.fetchWithAuth<{ tours: Tour[] }>("/api/admin/tours"),
        liff.fetchWithAuth<Site[]>("/api/admin/sites").catch(() => []),
        liff.fetchWithAuth<{ coaches: Coach[] }>("/api/admin/coaches").catch(() => ({ coaches: [] })),
      ]);
      setTrips(t.trips);
      setTours(tr.tours);
      setSites(Array.isArray(s) ? s : []);
      setCoaches(Array.isArray(c) ? [] : c.coaches);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  function newTripDraft(): Partial<Trip> {
    return {
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      startTime: "08:00",
      isNightDive: false,
      isScooter: false,
      diveSiteIds: [],
      tankCount: 3,
      capacity: 8,
      coachIds: [],
      pricing: { baseTrip: 1500, extraTank: 500, nightDive: 500, scooterRental: 1500 },
      notes: null,
      status: "open",
    };
  }

  function newTourDraft(): Partial<Tour> {
    const start = new Date(Date.now() + 30 * 86400000);
    const end = new Date(start.getTime() + 3 * 86400000);
    return {
      title: "",
      destination: "lanyu",
      dateStart: start.toISOString().slice(0, 10),
      dateEnd: end.toISOString().slice(0, 10),
      basePrice: 15000,
      deposit: 5000,
      capacity: 10,
      depositReminderDays: 7,   // 確認訂單後 1 週內付訂金保留名額
      finalReminderDays: 30,    // 尾款出發前 1 個月繳清
      guideReminderDays: 2,     // 出發前 2 天再次通知
      status: "open",
    };
  }

  async function saveTrip() {
    if (!editingTrip) return;
    setSaving(true);
    try {
      const url = editingTrip.id
        ? `/api/admin/trips/${editingTrip.id}`
        : "/api/admin/trips";
      const method = editingTrip.id ? "PATCH" : "POST";
      await liff.fetchWithAuth(url, {
        method,
        body: JSON.stringify(editingTrip),
      });
      setEditingTrip(null);
      await reload();
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function saveTour() {
    if (!editingTour) return;
    setSaving(true);
    try {
      const url = editingTour.id
        ? `/api/admin/tours/${editingTour.id}`
        : "/api/admin/tours";
      const method = editingTour.id ? "PATCH" : "POST";
      await liff.fetchWithAuth(url, {
        method,
        body: JSON.stringify(editingTour),
      });
      setEditingTour(null);
      await reload();
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function cancelTrip(id: string) {
    if (!confirm("確定取消這個場次？已預約的客戶會收到通知")) return;
    await liff.fetchWithAuth(`/api/admin/trips/${id}`, { method: "DELETE" });
    await reload();
  }

  async function cancelTour(id: string) {
    if (!confirm("確定停用這個旅行團？")) return;
    await liff.fetchWithAuth(`/api/admin/tours/${id}`, { method: "DELETE" });
    await reload();
  }

  async function restoreTrip(id: string) {
    if (!confirm("確定還原這個場次為「啟用中」？")) return;
    await liff.fetchWithAuth(`/api/admin/trips/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "open" }),
    });
    await reload();
  }

  async function restoreTour(id: string) {
    if (!confirm("確定還原這個旅行團為「啟用中」？")) return;
    await liff.fetchWithAuth(`/api/admin/tours/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "open" }),
    });
    await reload();
  }

  // 雙重確認的「永久刪除」
  async function permaDeleteTrip(t: Trip) {
    const phase1 = confirm(
      `⚠ 永久刪除場次「${t.date} ${t.startTime}」？\n\n這個動作無法復原，DB row 會直接消失。`,
    );
    if (!phase1) return;
    const phase2 = prompt(
      `為了安全，請輸入「DELETE」確認永久刪除：`,
    );
    if (phase2 !== "DELETE") {
      alert("取消刪除（沒輸入 DELETE）");
      return;
    }
    try {
      await liff.fetchWithAuth(
        `/api/admin/trips/${t.id}?permanent=true`,
        { method: "DELETE" },
      );
      await reload();
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function permaDeleteTour(t: Tour) {
    const phase1 = confirm(
      `⚠ 永久刪除旅行團「${t.title}」？\n\n這個動作無法復原，DB row 會直接消失。`,
    );
    if (!phase1) return;
    const phase2 = prompt(`為了安全，請輸入「DELETE」確認永久刪除：`);
    if (phase2 !== "DELETE") {
      alert("取消刪除（沒輸入 DELETE）");
      return;
    }
    try {
      await liff.fetchWithAuth(
        `/api/admin/tours/${t.id}?permanent=true`,
        { method: "DELETE" },
      );
      await reload();
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function bulkRestoreAllCancelled() {
    const cancelled = trips.filter((t) => t.status === "cancelled");
    if (cancelled.length === 0) {
      alert("沒有已取消的場次");
      return;
    }
    if (
      !confirm(
        `把所有 ${cancelled.length} 個已取消場次還原為「啟用中」？\n（同時把因為這些場次取消的客戶 booking 還原成 confirmed）`,
      )
    )
      return;
    try {
      const r = await liff.fetchWithAuth<{
        ok: boolean;
        tripsRestored: number;
        bookingsRestored: number;
      }>("/api/admin/trips/bulk-restore", {
        method: "POST",
        body: JSON.stringify({ tripIds: cancelled.map((t) => t.id) }),
      });
      alert(`✓ 還原 ${r.tripsRestored} 個場次, ${r.bookingsRestored} 筆 booking`);
      await reload();
    } catch (e) {
      alert("還原失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  const siteName = (id: string) => sites.find((s) => s.id === id)?.name || id;
  const coachName = (id: string) => coaches.find((c) => c.id === id)?.realName || id;

  return (
    <LiffShell title="開團管理" backHref="/liff/admin/dashboard">
      <div className="px-4 pt-4">
        {error && (
          <Card className="mb-3 bg-[var(--color-coral)]/15 p-3 text-sm">
            {error}
          </Card>
        )}
        {/* 篩選 tabs */}
        <div className="flex gap-1.5 rounded-full bg-[var(--muted)] p-0.5 text-xs">
          {(
            [
              ["active", `啟用中 (${trips.filter((t) => t.status !== "cancelled").length + tours.filter((t) => t.status !== "cancelled").length})`],
              ["cancelled", `已取消 (${trips.filter((t) => t.status === "cancelled").length + tours.filter((t) => t.status === "cancelled").length})`],
              ["all", `全部 (${trips.length + tours.length})`],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFilter(v)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 font-medium transition-colors",
                filter === v
                  ? "bg-[var(--background)] text-[var(--foreground)] shadow"
                  : "text-[var(--muted-foreground)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 在 cancelled tab 顯示「一鍵還原全部」按鈕 */}
        {filter === "cancelled" &&
          trips.filter((t) => t.status === "cancelled").length > 0 && (
            <Button
              variant="outline"
              className="w-full"
              onClick={bulkRestoreAllCancelled}
            >
              <RotateCcw className="h-4 w-4" />
              一鍵還原全部 {trips.filter((t) => t.status === "cancelled").length} 個取消場次
            </Button>
          )}

        <Tabs defaultValue="trips">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="trips">
              日潛場次 ({filteredTrips.length})
            </TabsTrigger>
            <TabsTrigger value="tours">
              旅行團 ({filteredTours.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trips" className="space-y-2 pt-3">
            <Button
              className="w-full"
              onClick={() => setEditingTrip(newTripDraft())}
            >
              <Plus className="h-4 w-4" /> 新增場次
            </Button>
            {filteredTrips.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
                {filter === "cancelled" ? "沒有取消的場次" : filter === "all" ? "還沒有場次" : "沒有啟用中的場次"}
              </div>
            )}
            {filteredTrips.map((t) => (
              <Card
                key={t.id}
                className={cn(
                  t.isNightDive && "bg-[var(--color-midnight)] text-white",
                  t.status === "cancelled" && "opacity-50",
                )}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold tabular">
                          {t.date} {t.startTime}
                        </span>
                        <Badge variant="muted" className="text-[10px]">
                          {t.tankCount} 潛
                        </Badge>
                        {t.isNightDive && (
                          <Badge variant="ocean" className="gap-0.5 text-[10px]">
                            <Moon className="h-2.5 w-2.5" /> 夜
                          </Badge>
                        )}
                        {t.isScooter && (
                          <Badge variant="gold" className="text-[10px]">水推</Badge>
                        )}
                        {t.status === "cancelled" && (
                          <Badge variant="coral" className="text-[10px]">已取消</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs">
                        <Anchor className="h-3 w-3 opacity-70" />
                        {t.diveSiteIds.map(siteName).join(" · ") || "—"}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 text-[11px] tabular",
                          t.isNightDive ? "opacity-70" : "text-[var(--muted-foreground)]",
                        )}
                      >
                        {t.booked}/{t.capacity ?? "∞"} ·{" "}
                        {t.coachIds.map(coachName).join("、") || "未指派教練"} · base NT$ {t.pricing.baseTrip}
                      </div>
                      {t.notes && (
                        <div className="mt-1 rounded-md bg-[var(--muted)]/50 px-2 py-1 text-[11px] leading-relaxed">
                          📝 {t.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTrip({ ...t })}
                        title="編輯"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      {t.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelTrip(t.id)}
                          title="取消（可還原）"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                        </Button>
                      ) : t.status === "cancelled" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreTrip(t.id)}
                            title="還原為啟用中"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-[var(--color-phosphor)]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => permaDeleteTrip(t)}
                            title="永久刪除（雙重確認）"
                            className="border-[var(--color-coral)]"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="tours" className="space-y-2 pt-3">
            <Button
              className="w-full"
              onClick={() => setEditingTour(newTourDraft())}
            >
              <Plus className="h-4 w-4" /> 新增旅行團
            </Button>
            {filteredTours.length === 0 && (
              <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
                {filter === "cancelled" ? "沒有停用的旅行團" : filter === "all" ? "還沒有旅行團" : "沒有啟用中的旅行團"}
              </div>
            )}
            {filteredTours.map((t) => (
              <Card
                key={t.id}
                className={t.status === "cancelled" ? "opacity-50" : ""}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                        <span className="truncate text-sm font-bold">
                          {t.title}
                        </span>
                        {t.status === "cancelled" && (
                          <Badge variant="coral" className="text-[10px]">已停用</Badge>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] tabular text-[var(--muted-foreground)]">
                        {t.dateStart} → {t.dateEnd} ·
                        NT$ {t.basePrice.toLocaleString()} / 訂金 {t.deposit.toLocaleString()}
                      </div>
                      <div className="text-[10px] tabular text-[var(--muted-foreground)]">
                        提醒：訂金 D-{t.depositReminderDays} · 尾款 D-{t.finalReminderDays} · 行前 D-{t.guideReminderDays}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTour({ ...t })}
                        title="編輯"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      {t.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelTour(t.id)}
                          title="停用（可還原）"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                        </Button>
                      ) : t.status === "cancelled" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreTour(t.id)}
                            title="還原為啟用中"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-[var(--color-phosphor)]" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => permaDeleteTour(t)}
                            title="永久刪除（雙重確認）"
                            className="border-[var(--color-coral)]"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      {/* 編輯日潛場次 Dialog */}
      <Dialog
        open={editingTrip !== null}
        onOpenChange={(o) => !o && setEditingTrip(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTrip?.id ? "編輯場次" : "新增場次"}
            </DialogTitle>
          </DialogHeader>
          {editingTrip && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">日期</Label>
                  <Input
                    type="date"
                    value={editingTrip.date ?? ""}
                    onChange={(e) =>
                      setEditingTrip({ ...editingTrip, date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">時間 (HH:MM)</Label>
                  <Input
                    value={editingTrip.startTime ?? ""}
                    onChange={(e) => {
                      const startTime = e.target.value;
                      // 自動判斷夜潛：16:00 之後算夜潛
                      const isNightDive = startTime >= "16:00";
                      setEditingTrip({
                        ...editingTrip,
                        startTime,
                        isNightDive,
                      });
                    }}
                    placeholder="08:00"
                  />
                </div>
              </div>

              <div className="rounded-md bg-[var(--muted)]/40 px-2 py-1.5 text-[11px] text-[var(--muted-foreground)]">
                ⏰ 16:00 之後自動標記為「夜潛」
                {editingTrip.isNightDive && (
                  <span className="ml-1 font-bold text-[var(--color-phosphor)]">
                    · 目前為夜潛場次 🌙
                  </span>
                )}
              </div>

              <div>
                <Label className="text-xs">潛點 (可多選)</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {sites.map((s) => {
                    const on = (editingTrip.diveSiteIds ?? []).includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          const cur = editingTrip.diveSiteIds ?? [];
                          const next = on ? cur.filter((x) => x !== s.id) : [...cur, s.id];
                          setEditingTrip({ ...editingTrip, diveSiteIds: next });
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          on
                            ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                            : "border-[var(--border)]",
                        )}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label className="text-xs">
                  教練 (可多選) — 旁邊括號是每支潛水費用
                </Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {coaches.map((c) => {
                    const on = (editingTrip.coachIds ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const cur = editingTrip.coachIds ?? [];
                          const next = on ? cur.filter((x) => x !== c.id) : [...cur, c.id];
                          setEditingTrip({ ...editingTrip, coachIds: next });
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs",
                          on
                            ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                            : "border-[var(--border)]",
                        )}
                      >
                        {c.realName}
                        {typeof c.feePerDive === "number" && c.feePerDive > 0 && (
                          <span className="ml-1 opacity-70 tabular">
                            (${c.feePerDive})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {(editingTrip.coachIds ?? []).length > 0 &&
                  (editingTrip.tankCount ?? 0) > 0 && (
                    <div className="mt-1 text-[11px] text-[var(--muted-foreground)] tabular">
                      預估教練成本：NT${" "}
                      {(editingTrip.coachIds ?? [])
                        .map(
                          (id) =>
                            coaches.find((c) => c.id === id)?.feePerDive ?? 0,
                        )
                        .reduce((a, b) => a + b, 0) *
                        (editingTrip.tankCount ?? 0)}
                      {" "}
                      (Σ feePerDive × {editingTrip.tankCount} 潛)
                    </div>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">潛水支數</Label>
                  <Input
                    type="number"
                    value={editingTrip.tankCount ?? 3}
                    onChange={(e) =>
                      setEditingTrip({ ...editingTrip, tankCount: Number(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">參加人數上限 (0 = 無上限)</Label>
                  <Input
                    type="number"
                    value={editingTrip.capacity ?? 0}
                    onChange={(e) =>
                      setEditingTrip({
                        ...editingTrip,
                        capacity: Number(e.target.value) || null,
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">基本價</Label>
                  <Input
                    type="number"
                    value={editingTrip.pricing?.baseTrip ?? 1500}
                    onChange={(e) =>
                      setEditingTrip({
                        ...editingTrip,
                        pricing: {
                          ...editingTrip.pricing!,
                          baseTrip: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">加潛/支</Label>
                  <Input
                    type="number"
                    value={editingTrip.pricing?.extraTank ?? 500}
                    onChange={(e) =>
                      setEditingTrip({
                        ...editingTrip,
                        pricing: {
                          ...editingTrip.pricing!,
                          extraTank: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">備註說明 (顯示給客戶 / 教練)</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={3}
                  value={editingTrip.notes ?? ""}
                  onChange={(e) =>
                    setEditingTrip({
                      ...editingTrip,
                      notes: e.target.value || null,
                    })
                  }
                  placeholder="例：本團安排潮境公園生態解說、自備防寒衣建議 5mm、集合地點海王子潛店..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setEditingTrip(null)}>
                  取消
                </Button>
                <Button onClick={saveTrip} disabled={saving}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 編輯旅行團 Dialog */}
      <Dialog
        open={editingTour !== null}
        onOpenChange={(o) => !o && setEditingTour(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTour?.id ? "編輯旅行團" : "新增旅行團"}
            </DialogTitle>
          </DialogHeader>
          {editingTour && (
            <div className="space-y-2.5">
              {/* 團名 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">團名</Label>
                <Input
                  value={editingTour.title ?? ""}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, title: e.target.value })
                  }
                  placeholder="例：蘭嶼四天三夜潛旅 (中秋)"
                />
              </div>

              {/* 出發日 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">出發日</Label>
                <Input
                  type="date"
                  value={editingTour.dateStart ?? ""}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, dateStart: e.target.value })
                  }
                />
              </div>

              {/* 回程日 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">回程日</Label>
                <Input
                  type="date"
                  value={editingTour.dateEnd ?? ""}
                  onChange={(e) =>
                    setEditingTour({ ...editingTour, dateEnd: e.target.value })
                  }
                />
              </div>

              {/* 團費 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">團費</Label>
                <Input
                  type="number"
                  value={editingTour.basePrice ?? 0}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      basePrice: Number(e.target.value),
                    })
                  }
                />
              </div>

              {/* 訂金 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">訂金</Label>
                <Input
                  type="number"
                  value={editingTour.deposit ?? 0}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      deposit: Number(e.target.value),
                    })
                  }
                />
              </div>

              {/* 預計團員人數 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">預計團員人數</Label>
                <Input
                  type="number"
                  value={editingTour.capacity ?? 0}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      capacity: Number(e.target.value) || null,
                    })
                  }
                  placeholder="0 = 無上限"
                />
              </div>

              {/* 訂金截止日 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">訂金截止日</Label>
                <Input
                  type="date"
                  value={(editingTour.depositDeadline ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      depositDeadline: e.target.value || null,
                    })
                  }
                />
              </div>

              {/* 尾款截止日 */}
              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">尾款截止日</Label>
                <Input
                  type="date"
                  value={(editingTour.finalDeadline ?? "").slice(0, 10)}
                  onChange={(e) =>
                    setEditingTour({
                      ...editingTour,
                      finalDeadline: e.target.value || null,
                    })
                  }
                />
              </div>

              {/* 自動推播提醒 */}
              <div className="rounded-md bg-[var(--muted)] p-2 space-y-1.5">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)]">
                  自動推播提醒
                </div>

                <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                  <Label className="text-[11px]">訂金 D-</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editingTour.depositReminderDays ?? 7}
                      onChange={(e) =>
                        setEditingTour({
                          ...editingTour,
                          depositReminderDays: Number(e.target.value),
                        })
                      }
                      className="w-16 text-center"
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      天前推（確認訂單後 7 天內未付即釋出名額）
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                  <Label className="text-[11px]">尾款 D-</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editingTour.finalReminderDays ?? 30}
                      onChange={(e) =>
                        setEditingTour({
                          ...editingTour,
                          finalReminderDays: Number(e.target.value),
                        })
                      }
                      className="w-16 text-center"
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      天前推（出發前 30 天繳清）
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                  <Label className="text-[11px]">行前 D-</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      value={editingTour.guideReminderDays ?? 2}
                      onChange={(e) =>
                        setEditingTour({
                          ...editingTour,
                          guideReminderDays: Number(e.target.value),
                        })
                      }
                      className="w-16 text-center"
                    />
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      天前推（出發前 2 天再次通知）
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditingTour(null)}>
                  取消
                </Button>
                <Button onClick={saveTour} disabled={saving}>
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
