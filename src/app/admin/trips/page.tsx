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
import { Plus, Edit3, Trash2, Moon, Sun, Anchor, Ban } from "lucide-react";
import { cn, taipeiToday } from "@/lib/utils";

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
  code?: string | null;
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
  cert?: string | null;
  specialty?: string[];
  feePerDive?: number;
  note?: string | null;
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

/** 場次的「有效狀態」：date 過了 + status 仍是 open/full → 視為 completed
 *  cancelled / completed 不變
 *  回傳 [effectiveStatus, isAutoCompleted] */
function effectiveTripStatus(trip: Trip): [string, boolean] {
  const dateStr = trip.date.slice(0, 10);
  const today = taipeiToday();
  const isPast = dateStr < today;
  if (isPast && (trip.status === "open" || trip.status === "full")) {
    return ["completed", true]; // 自動視為結束
  }
  return [trip.status, false];
}

function isPastTrip(trip: Trip): boolean {
  return trip.date.slice(0, 10) < taipeiToday();
}

const BLANK_PRICING_DEFAULT: Pricing = {
  baseTrip: 0,
  extraTank: 500,
  nightDive: 300,
  scooterRental: 500,
  otherFee: 0,
  otherFeeNote: "",
};

const TODAY = taipeiToday();
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
    // 用 allSettled：任一 API 失敗不影響其他資料載入
    Promise.allSettled([
      adminFetch<{ trips: Trip[] }>("/api/admin/trips"),
      adminFetch<Site[]>("/api/admin/sites"),
      adminFetch<{ coaches: Coach[] }>("/api/admin/coaches"),
      adminFetch<{ config: { defaultTripPricing?: Partial<Pricing> } }>("/api/admin/site-config"),
    ]).then(([t, s, c, cfg]) => {
      if (t.status === "fulfilled") setTrips(t.value.trips ?? []);
      else setErr("場次載入失敗：" + (t.reason?.message ?? String(t.reason)));

      if (s.status === "fulfilled") setSites(Array.isArray(s.value) ? s.value : []);
      if (c.status === "fulfilled") setCoaches(c.value.coaches ?? []);
      if (cfg.status === "fulfilled") {
        const dp = cfg.value.config.defaultTripPricing;
        if (dp && Object.keys(dp).length > 0) {
          setDefaultPricing({ ...BLANK_PRICING_DEFAULT, ...dp });
        }
      }
    }).finally(() => setLoading(false));
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
                    <th className="px-4 py-3 font-medium">編號</th>
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
                      <td className="px-4 py-3">
                        {trip.code ? (
                          <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-teal-800">
                            {trip.code}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">—</span>
                        )}
                      </td>
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
                        {(() => {
                          const [effStatus, isAuto] = effectiveTripStatus(trip);
                          return (
                            <div className="flex items-center gap-1">
                              <Badge
                                variant={statusVariant(effStatus)}
                                className="text-[10px]"
                              >
                                {TRIP_STATUS_LABEL[effStatus] ?? effStatus}
                              </Badge>
                              {isAuto && (
                                <span className="text-[9px] text-[var(--muted-foreground)]" title="日期已過，自動視為結束">
                                  自動
                                </span>
                              )}
                            </div>
                          );
                        })()}
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
                          {/* 取消（軟取消，status → cancelled）— 只有未取消的場次顯示 */}
                          {trip.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => deleteTrip(trip)}
                              title="取消場次（保留資料）"
                              className="border-amber-400 text-amber-600 hover:bg-amber-50"
                            >
                              <Ban className="h-3 w-3" />
                            </Button>
                          )}
                          {/* 永久刪除 — 一律顯示，硬刪除整筆資料 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => hardDeleteTrip(trip)}
                            title="永久刪除（不可復原）"
                            className="border-[var(--color-coral)]"
                          >
                            <Trash2 className="h-3 w-3 text-[var(--color-coral)]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {trips.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
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
            <DialogTitle className="flex items-center gap-2">
              <span>{form.isNightDive ? "🌙" : "☀️"}{" "}
              {dialogMode === "create" ? "新增日潛水場次" : "編輯日潛水場次"}</span>
              {dialogMode === "edit" && editingId && (() => {
                const t = trips.find(x => x.id === editingId);
                return t?.code ? (
                  <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-normal text-teal-800">
                    {t.code}
                  </span>
                ) : null;
              })()}
              {dialogMode === "create" && (
                <span className="text-[10px] font-normal text-[var(--muted-foreground)]">
                  建立後自動產生 D{new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }).replace(/-/g, "")}-XX 編號
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Row 1: 日期 + 集合時間 + 場次狀態 (三欄並排) */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <Label className="mb-1 block text-xs">日期</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="col-span-4">
                <Label className="mb-1 block text-xs">集合時間</Label>
                <div className="flex items-center gap-1">
                  <select
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1.5 text-sm"
                    value={form.startTime.split(":")[0] ?? "08"}
                    onChange={(e) => {
                      const h = e.target.value;
                      const m = form.startTime.split(":")[1] ?? "00";
                      const time = `${h}:${m}`;
                      setForm({ ...form, startTime: time, isNightDive: time >= "16:00" });
                    }}
                  >
                    {Array.from({ length: 18 }, (_, i) => i + 5).map((h) => (
                      <option key={h} value={String(h).padStart(2, "0")}>
                        {String(h).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-[var(--muted-foreground)]">:</span>
                  <select
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-1.5 text-sm"
                    value={form.startTime.split(":")[1] ?? "00"}
                    onChange={(e) => {
                      const h = form.startTime.split(":")[0] ?? "08";
                      const time = `${h}:${e.target.value}`;
                      setForm({ ...form, startTime: time, isNightDive: time >= "16:00" });
                    }}
                  >
                    {["00", "15", "30", "45"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="col-span-4">
                <Label className="mb-1 block text-xs">場次狀態</Label>
                <div className="flex gap-1">
                  {[
                    { value: "open", label: "開放" },
                    { value: "cancelled", label: "取消" },
                    { value: "completed", label: "結束" },
                  ].map(({ value, label }) => {
                    // 已過期的場次不能改回 open（必須是 cancelled 或 completed）
                    const isFormDatePast = form.date < taipeiToday();
                    const disabled = value === "open" && isFormDatePast;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && setForm({ ...form, status: value })}
                        title={disabled ? "日期已過，無法設為開放" : ""}
                        className={cn(
                          "flex-1 rounded-full border px-1 py-1 text-xs transition-colors",
                          disabled
                            ? "border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)] cursor-not-allowed line-through"
                            : form.status === value
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
                    );
                  })}
                </div>
                {form.date < taipeiToday() && (
                  <p className="mt-0.5 text-[9px] text-[var(--muted-foreground)]">
                    日期已過：「開放」已停用，需設為取消或結束
                  </p>
                )}
              </div>
            </div>

            {/* Row 2: 潛點（單獨一行，chips 自由換行） */}
            <div>
              <Label className="mb-1 block text-xs">潛點</Label>
              <div className="flex flex-wrap gap-1.5">
                {loading ? (
                  <span className="text-xs text-[var(--muted-foreground)]">載入中...</span>
                ) : sites.length === 0 ? (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    無潛點資料（請先至「潛點管理」新增）
                  </span>
                ) : (
                  sites.map((s) => (
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
                  ))
                )}
              </div>
            </div>

            {/* Row 3: 教練 + 氣瓶數 + 可參加人數 (三欄並排，教練佔較寬) */}
            <div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-6">
                  <Label className="mb-1 block text-xs">教練</Label>
                  <select
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                    value={form.coachIds[0] ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, coachIds: e.target.value ? [e.target.value] : [] })
                    }
                  >
                    <option value="">（未選擇）</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>{c.realName}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <Label className="mb-1 block text-xs">氣瓶數</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.tankCount}
                    onChange={(e) =>
                      setForm({ ...form, tankCount: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
                    }
                  />
                </div>
                <div className="col-span-3">
                  <Label className="mb-1 block text-xs">
                    人數
                    <span className="ml-0.5 text-[9px] font-normal text-[var(--muted-foreground)]">(0=∞)</span>
                  </Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.capacity}
                    onChange={(e) =>
                      setForm({ ...form, capacity: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
              </div>
              {/* 教練選定後顯示資訊（橫跨整列） */}
              {(() => {
                const c = coaches.find((c) => c.id === form.coachIds[0]);
                if (!c) return null;
                const parts = [
                  c.cert && `🎓 ${c.cert}`,
                  c.specialty?.length && `✦ ${c.specialty.join("、")}`,
                  c.feePerDive && `💰 NT$${c.feePerDive.toLocaleString()}/潛`,
                  c.note,
                ].filter(Boolean);
                return parts.length > 0 ? (
                  <div className="mt-1 rounded-md bg-[var(--muted)]/50 px-2 py-1 text-[10px] text-[var(--muted-foreground)]">
                    {parts.join("　")}
                  </div>
                ) : null;
              })()}
            </div>

            {/* 費用設定 — 氣瓶費 + 其他費用 同一行 */}
            <div>
              <Label className="mb-1.5 block text-xs">費用設定 (NT$)</Label>
              <div className="flex items-end gap-2">
                {/* 氣瓶費 */}
                <div className="w-28 shrink-0">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                    氣瓶費（每瓶）
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.pricing.extraTank}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, extraTank: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
                {/* 其他費用 金額 */}
                <div className="w-24 shrink-0">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                    其他費用
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={form.pricing.otherFee ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, otherFee: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
                {/* 其他費用 說明 */}
                <div className="flex-1">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">說明（選填）</div>
                  <Input
                    placeholder="說明"
                    value={form.pricing.otherFeeNote ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, otherFeeNote: e.target.value } })
                    }
                  />
                </div>
              </div>
              {/* 夜潛費（僅夜潛時顯示） */}
              {form.isNightDive && (
                <div className="mt-2 w-28">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">夜潛費</div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={form.pricing.nightDive}
                    onChange={(e) =>
                      setForm({ ...form, pricing: { ...form.pricing, nightDive: Number(e.target.value) || 0 } })
                    }
                  />
                </div>
              )}
            </div>

            {/* 集合地點 */}
            <div>
              <Label className="mb-1 block text-xs">集合地點</Label>
              <Input
                value={form.meetingPoint}
                onChange={(e) => setForm({ ...form, meetingPoint: e.target.value })}
                placeholder="Google Map URL（如：https://maps.app.goo.gl/...）"
              />
            </div>

            {/* 日潛水備註 */}
            <div>
              <Label className="mb-1 block text-xs">日潛水備註</Label>
              <textarea
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="天氣/裝備/注意事項..."
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogMode(null)}>
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
