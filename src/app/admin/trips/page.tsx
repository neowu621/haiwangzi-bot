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
import { Plus, Edit3, Trash2, Moon, Sun, Anchor } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pricing {
  baseTrip: number;
  extraTank: number;
  nightDive: number;
  scooterRental: number;
  otherFee?: number;
  otherFeeNote?: string;
}

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
  pricing: Pricing;
  notes: string | null;
  meetingPoint: string | null;
  images: string[];
  status: string;
}

interface Site {
  id: string;
  name: string;
}

interface Coach {
  id: string;
  realName: string;
  active: boolean;
}

const TRIP_STATUS_LABEL: Record<string, string> = {
  open: "開放",
  full: "額滿",
  cancelled: "已取消",
  completed: "已完成",
};

function statusVariant(s: string): "ocean" | "coral" | "gold" | "muted" {
  if (s === "open") return "ocean";
  if (s === "full") return "gold";
  if (s === "cancelled") return "coral";
  return "muted";
}

const BLANK_PRICING_DEFAULT: Pricing = {
  baseTrip: 1200,
  extraTank: 500,
  nightDive: 300,
  scooterRental: 500,
  otherFee: 0,
  otherFeeNote: "",
};

const TODAY = new Date().toISOString().split("T")[0];
const BLANK_FORM = {
  date: TODAY,
  startTime: "08:00",
  isNightDive: false,
  isScooter: false,
  diveSiteIds: [] as string[],
  tankCount: 3,
  capacity: 8,
  coachIds: [] as string[],
  pricing: BLANK_PRICING_DEFAULT,
  notes: "",
  meetingPoint: "",
  status: "open" as string,
};

type TripForm = typeof BLANK_FORM;

function estimatedRevenue(trip: Trip): number {
  const p = trip.pricing;
  const tanksPerPerson = trip.tankCount;
  const baseWithTanks = p.baseTrip + (tanksPerPerson - 1) * p.extraTank;
  const extras =
    (trip.isNightDive ? p.nightDive : 0) +
    (trip.isScooter ? p.scooterRental : 0) +
    (p.otherFee ?? 0);
  return trip.booked * (baseWithTanks + extras);
}

export default function AdminTripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TripForm>({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [defaultPricing, setDefaultPricing] = useState<Pricing>(BLANK_PRICING_DEFAULT);

  useEffect(() => {
    Promise.all([
      adminFetch<{ trips: Trip[] }>("/api/admin/trips"),
      adminFetch<Site[]>("/api/admin/sites").catch(() => []),
      adminFetch<{ coaches: Coach[] }>("/api/admin/coaches").catch(() => ({
        coaches: [],
      })),
      adminFetch<{ config: { defaultTripPricing?: Partial<Pricing> } }>("/api/admin/site-config").catch(() => ({ config: {} as { defaultTripPricing?: Partial<Pricing> } })),
    ])
      .then(([t, s, c, cfg]) => {
        setTrips(t.trips);
        setSites(Array.isArray(s) ? s : []);
        setCoaches(c.coaches ?? []);
        const dp = cfg.config.defaultTripPricing;
        if (dp && Object.keys(dp).length > 0) {
          setDefaultPricing({ ...BLANK_PRICING_DEFAULT, ...dp });
        }
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  function siteName(id: string) {
    return sites.find((s) => s.id === id)?.name ?? id;
  }

  function coachName(id: string) {
    return coaches.find((c) => c.id === id)?.realName ?? id;
  }

  function openCreate() {
    setForm({ ...BLANK_FORM, pricing: { ...defaultPricing } });
    setEditingId(null);
    setDialogMode("create");
  }

  function openEdit(trip: Trip) {
    setForm({
      date: trip.date.slice(0, 10),
      startTime: trip.startTime,
      isNightDive: trip.isNightDive,
      isScooter: trip.isScooter,
      diveSiteIds: [...trip.diveSiteIds],
      tankCount: trip.tankCount,
      capacity: trip.capacity ?? 0,
      coachIds: [...trip.coachIds],
      pricing: {
        ...BLANK_PRICING_DEFAULT,
        ...trip.pricing,
      },
      notes: trip.notes ?? "",
      meetingPoint: trip.meetingPoint ?? "",
      status: trip.status,
    });
    setEditingId(trip.id);
    setDialogMode("edit");
  }

  async function saveForm() {
    if (!form.date || !form.startTime) {
      alert("請填寫日期和時間");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        capacity: form.capacity === 0 ? null : form.capacity,
        notes: form.notes || null,
        meetingPoint: form.meetingPoint || null,
        status: form.status,
      };
      if (dialogMode === "create") {
        const r = await adminFetch<{ ok: boolean; trip: Trip }>(
          "/api/admin/trips",
          { method: "POST", body: JSON.stringify(body) },
        );
        setTrips((arr) => [r.trip, ...arr]);
      } else if (editingId) {
        const r = await adminFetch<{ ok: boolean; trip: Trip }>(
          `/api/admin/trips/${editingId}`,
          { method: "PATCH", body: JSON.stringify(body) },
        );
        setTrips((arr) =>
          arr.map((x) => (x.id === editingId ? { ...x, ...r.trip } : x)),
        );
      }
      setDialogMode(null);
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrip(trip: Trip) {
    if (!confirm(`取消場次 ${trip.date.slice(0, 10)} ${trip.startTime}？`))
      return;
    try {
      await adminFetch(`/api/admin/trips/${trip.id}`, { method: "DELETE" });
      setTrips((arr) =>
        arr.map((x) =>
          x.id === trip.id ? { ...x, status: "cancelled" } : x,
        ),
      );
    } catch (e) {
      alert("取消失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function hardDeleteTrip(trip: Trip) {
    if (!confirm(`永久刪除場次？無法復原。`)) return;
    const ok2 = prompt("輸入「DELETE」確認：");
    if (ok2 !== "DELETE") return;
    try {
      await adminFetch(`/api/admin/trips/${trip.id}?permanent=true`, {
        method: "DELETE",
      });
      setTrips((arr) => arr.filter((x) => x.id !== trip.id));
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  function selectSiteId(id: string) {
    setForm((f) => ({ ...f, diveSiteIds: f.diveSiteIds[0] === id ? [] : [id] }));
  }

  function toggleCoachId(id: string) {
    setForm((f) => ({
      ...f,
      coachIds: f.coachIds.includes(id)
        ? f.coachIds.filter((x) => x !== id)
        : [...f.coachIds, id],
    }));
  }

  return (
    <AdminShell title="場次管理">
      <div className="space-y-4">
        <div className="flex justify-between">
          <div />
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增場次
          </Button>
        </div>

        {err && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              background: "rgba(255,123,90,0.1)",
              color: "var(--color-coral)",
              border: "1px solid rgba(255,123,90,0.3)",
            }}
          >
            {err}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        ) : (
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
                    <th className="px-4 py-3 font-medium">時段</th>
                    <th className="px-4 py-3 font-medium">地點</th>
                    <th className="px-4 py-3 font-medium">教練</th>
                    <th className="px-4 py-3 font-medium text-right">
                      已報名/可接受
                    </th>
                    <th className="px-4 py-3 font-medium text-right">
                      預估收費
                    </th>
                    <th className="px-4 py-3 font-medium">狀態</th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((trip, i) => (
                    <tr
                      key={trip.id}
                      className={cn(
                        "border-t",
                        trip.status === "cancelled" && "opacity-50",
                      )}
                      style={{
                        borderColor: "var(--border)",
                        background: trip.isNightDive
                          ? i % 2 === 0 ? "#d4e4f7" : "#c8daf2"
                          : i % 2 === 0 ? "#ffffff" : "rgba(var(--muted-rgb,240,242,245),0.5)",
                      }}
                    >
                      <td className="px-4 py-3 tabular-nums font-medium">
                        {trip.date.slice(0, 10)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 tabular-nums">
                          {trip.isNightDive ? (
                            <Moon className="h-3.5 w-3.5 shrink-0" style={{ color: "#6b9fd4" }} />
                          ) : (
                            <Sun className="h-3.5 w-3.5 shrink-0" style={{ color: "#e8a020" }} />
                          )}
                          {trip.startTime}
                          {trip.isScooter && (
                            <Anchor className="h-3 w-3 text-[var(--color-phosphor)]" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {trip.diveSiteIds.length > 0
                          ? trip.diveSiteIds.map(siteName).join("・")
                          : "—"}
                        <span className="ml-1 text-[var(--muted-foreground)]">
                          / {trip.tankCount}支
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {trip.coachIds.length > 0
                          ? trip.coachIds.map(coachName).join("、")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {trip.booked} / {trip.capacity == null ? "∞" : trip.capacity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {trip.booked === 0
                          ? "NT$0"
                          : `NT$${estimatedRevenue(trip).toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={statusVariant(trip.status)}
                          className="text-[10px]"
                        >
                          {TRIP_STATUS_LABEL[trip.status] ?? trip.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(trip)}
                            title="編輯"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          {trip.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteTrip(trip)}
                              title="取消場次"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                          {trip.status === "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => hardDeleteTrip(trip)}
                              title="永久刪除"
                              className="border-[var(--color-coral)]"
                            >
                              <Trash2 className="h-3 w-3 text-[var(--color-coral)]" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {trips.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]"
                      >
                        沒有場次資料
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog
        open={dialogMode !== null}
        onOpenChange={(o) => !o && setDialogMode(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "create" ? "新增場次" : "編輯場次"}{" "}
              {form.isNightDive ? "🌙" : "☀️"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* 日期 + 集合時間: 2-column grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">日期</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">集合時間</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => {
                    const time = e.target.value;
                    const isNight = time >= "16:00";
                    setForm({ ...form, startTime: time, isNightDive: isNight });
                  }}
                />
              </div>
            </div>

            {/* 水下推進器 checkbox only (isNightDive is auto-set by time) */}
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={form.isScooter}
                  onChange={(e) =>
                    setForm({ ...form, isScooter: e.target.checked })
                  }
                />
                水下推進器
              </label>
            </div>

            {/* 潛點: single-select */}
            <div>
              <Label className="text-xs">潛點</Label>
              {sites.length === 0 ? (
                <div className="text-xs text-[var(--muted-foreground)]">
                  載入中...
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {sites.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSiteId(s.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        form.diveSiteIds[0] === s.id
                          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)] font-semibold"
                          : "border-[var(--border)] hover:bg-[var(--muted)]",
                      )}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 教練 */}
            <div>
              <Label className="text-xs">教練</Label>
              {coaches.length === 0 ? (
                <div className="text-xs text-[var(--muted-foreground)]">
                  載入中...
                </div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {coaches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCoachId(c.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        form.coachIds.includes(c.id)
                          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)] font-semibold"
                          : "border-[var(--border)] hover:bg-[var(--muted)]",
                      )}
                    >
                      {c.realName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 氣瓶數 + 容量 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">氣瓶數</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.tankCount}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tankCount: Math.max(
                        1,
                        Math.min(5, Number(e.target.value)),
                      ),
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">容量（0=無上限）</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            {/* 費用設定: conditional on isNightDive / isScooter */}
            <div>
              <Label className="text-xs mb-1 block">費用設定 (NT$)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">基本費</div>
                  <Input
                    type="number"
                    min={0}
                    value={form.pricing.baseTrip}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, baseTrip: Number(e.target.value) } })
                    }
                  />
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">加支費</div>
                  <Input
                    type="number"
                    min={0}
                    value={form.pricing.extraTank}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, extraTank: Number(e.target.value) } })
                    }
                  />
                </div>
                {form.isNightDive && (
                  <div>
                    <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">夜潛費</div>
                    <Input
                      type="number"
                      min={0}
                      value={form.pricing.nightDive}
                      onChange={(e) =>
                        setForm({ ...form, pricing: { ...form.pricing, nightDive: Number(e.target.value) } })
                      }
                    />
                  </div>
                )}
                {form.isScooter && (
                  <div>
                    <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">推進器費</div>
                    <Input
                      type="number"
                      min={0}
                      value={form.pricing.scooterRental}
                      onChange={(e) =>
                        setForm({ ...form, pricing: { ...form.pricing, scooterRental: Number(e.target.value) } })
                      }
                    />
                  </div>
                )}
                <div className="col-span-2">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">其他費用</div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder="金額"
                      className="w-28"
                      value={form.pricing.otherFee ?? 0}
                      onChange={(e) =>
                        setForm({ ...form, pricing: { ...form.pricing, otherFee: Number(e.target.value) } })
                      }
                    />
                    <Input
                      placeholder="說明（選填）"
                      className="flex-1"
                      value={form.pricing.otherFeeNote ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, pricing: { ...form.pricing, otherFeeNote: e.target.value } })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 集合地點 */}
            <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">集合地點</Label>
              <Input
                value={form.meetingPoint}
                onChange={(e) =>
                  setForm({ ...form, meetingPoint: e.target.value })
                }
                placeholder="例：龍洞停車場"
              />
            </div>

            {/* 備註 */}
            <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
              <Label className="text-xs pt-1.5">備註</Label>
              <textarea
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="天氣/裝備/注意事項..."
              />
            </div>

            {/* 場次狀態 */}
            <div>
              <Label className="text-xs">場次狀態</Label>
              <div className="mt-1 flex gap-2">
                {[
                  { value: "open", label: "開放" },
                  { value: "cancelled", label: "取消" },
                  { value: "completed", label: "結束" },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, status: value })}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors",
                      form.status === value
                        ? value === "open"
                          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)] font-semibold"
                          : value === "cancelled"
                          ? "border-[var(--color-coral)] bg-[var(--color-coral)]/20 text-[var(--color-coral)] font-semibold"
                          : "border-[var(--muted-foreground)] bg-[var(--muted)] font-semibold"
                        : "border-[var(--border)] hover:bg-[var(--muted)]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setDialogMode(null)}
              >
                取消
              </Button>
              <Button onClick={saveForm} disabled={saving}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
