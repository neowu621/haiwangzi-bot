"use client";
import { useEffect, useRef, useState } from "react";
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
import { Plus, Edit3, Trash2, Moon, Sun, Anchor, Ban, Copy, Upload, Download, FileSpreadsheet } from "lucide-react";
import { cn, taipeiToday } from "@/lib/utils";
import ExcelJS from "exceljs";

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
  meetingPointUrl: string | null;
  images: string[];
  status: string;
}

interface Site {
  id: string;
  name: string;
  region?: string;
  difficulty?: string;
  maxDepth?: number | null;
  features?: string[];
  description?: string | null;
  locationUrl?: string | null;
  cautions?: string | null;
}

const DIFF_LABELS: Record<string, string> = { easy: "初級", medium: "中級", hard: "進階" };
const REGION_LABELS: Record<string, string> = { northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "其他" };

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

/** 取得 YYYY-MM-DD 對應的星期顯示，例如 「(週一)」「(週日)」 */
function weekdayLabel(dateStr: string): string {
  // 用 T12:00:00+08:00 避免 UTC 偏移把日期推到前一天
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return "";
  const map = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
  return map[d.getDay()] ?? "";
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
  meetingPointUrl: "",
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

  // Excel 匯入相關
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    created: number;
    errors: { row: number; date: string; message: string }[];
  } | null>(null);

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

  /** 複製某場次的全部欄位作為新場次預填值，預設日期 = 原日期 + 1 天 */
  function openDuplicate(trip: Trip) {
    const origDate = new Date(`${trip.date.slice(0, 10)}T12:00:00+08:00`);
    origDate.setDate(origDate.getDate() + 1);
    const nextDateStr = origDate.toISOString().slice(0, 10);
    setForm({
      date: nextDateStr,
      startTime: trip.startTime,
      isNightDive: trip.isNightDive,
      isScooter: trip.isScooter,
      diveSiteIds: [...trip.diveSiteIds],
      tankCount: trip.tankCount,
      capacity: trip.capacity ?? 0,
      coachIds: [...trip.coachIds],
      pricing: { ...BLANK_PRICING_DEFAULT, ...trip.pricing },
      notes: trip.notes ?? "",
      meetingPoint: trip.meetingPoint ?? "",
      meetingPointUrl: trip.meetingPointUrl ?? "",
      status: "open", // 複製的新場次強制為「開放」
    });
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
      meetingPointUrl: trip.meetingPointUrl ?? "",
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
        meetingPointUrl: form.meetingPointUrl || null,
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

  // ── Excel 範本下載 + 上傳匯入 ──────────────────────────────────────
  async function downloadTripTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("日潛場次");
    ws.columns = [
      { header: "日期（YYYY-MM-DD，必填）", key: "date", width: 18 },
      { header: "時間（HH:MM，必填）", key: "startTime", width: 14 },
      { header: "夜潛（Y/N，留空自動依時間判斷）", key: "isNightDive", width: 20 },
      { header: "潛點名稱（逗號分隔，例如：鶯歌石 或 鶯歌石,深奧）", key: "sites", width: 36 },
      { header: "氣瓶數（1-5，預設 3）", key: "tankCount", width: 14 },
      { header: "人數上限（0=無上限）", key: "capacity", width: 14 },
      { header: "教練姓名（逗號分隔）", key: "coaches", width: 20 },
      { header: "氣瓶費/瓶", key: "extraTank", width: 12 },
      { header: "夜潛加價", key: "nightDive", width: 12 },
      { header: "其他費用", key: "otherFee", width: 12 },
      { header: "其他費用說明", key: "otherFeeNote", width: 18 },
      { header: "集合地點", key: "meetingPoint", width: 22 },
      { header: "Google Map URL", key: "meetingPointUrl", width: 32 },
      { header: "備註", key: "notes", width: 28 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2342" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 32;

    // 兩列範例（白天 + 夜潛）
    ws.addRow({
      date: "2026-06-15",
      startTime: "08:00",
      isNightDive: "",
      sites: sites[0]?.name ?? "鶯歌石",
      tankCount: 2,
      capacity: 8,
      coaches: coaches[0]?.realName ?? "王教練",
      extraTank: 500,
      nightDive: 0,
      otherFee: 0,
      otherFeeNote: "",
      meetingPoint: "龍洞 4 號港",
      meetingPointUrl: "https://maps.app.goo.gl/xxxx",
      notes: "請於 07:30 集合",
    });
    ws.addRow({
      date: "2026-06-15",
      startTime: "18:00",
      isNightDive: "Y",
      sites: sites[0]?.name ?? "鶯歌石",
      tankCount: 1,
      capacity: 6,
      coaches: coaches[0]?.realName ?? "王教練",
      extraTank: 500,
      nightDive: 300,
      otherFee: 0,
      otherFeeNote: "",
      meetingPoint: "龍洞 4 號港",
      meetingPointUrl: "",
      notes: "夜潛 — 請自備手電筒",
    });

    // 加說明工作表
    const help = wb.addWorksheet("欄位說明");
    help.columns = [
      { header: "欄位", key: "k", width: 20 },
      { header: "說明", key: "v", width: 70 },
    ];
    help.getRow(1).font = { bold: true };
    [
      ["日期", "YYYY-MM-DD，例：2026-06-15。必填"],
      ["時間", "HH:MM，例：08:00、18:30。必填"],
      ["夜潛", "Y 或 N。留空時系統會自動依時間判斷（時間 ≥ 16:00 視為夜潛）"],
      ["潛點名稱", "用後台「潛點管理」內的中文名稱，多個用半形或全形逗號分隔（找不到的會列為錯誤）"],
      ["氣瓶數", "整數 1-5，留空預設 3"],
      ["人數上限", "整數 ≥ 0；填 0 代表無上限"],
      ["教練姓名", "用後台「教練管理」內的真實姓名，多位用逗號分隔（找不到的會列為錯誤）"],
      ["金額類欄位", "純數字。留空視為 0"],
      ["匯入規則", "全部視為新增（會自動產生編號 DYYYYMMDD-NN）。不會 update 既有場次"],
      ["上限", "單次最多 200 筆"],
    ].forEach(([k, v]) => help.addRow({ k, v }));

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diving_trips_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleTripFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      // 找名為「日潛場次」或第一個 worksheet
      const ws = wb.getWorksheet("日潛場次") ?? wb.worksheets[0];
      if (!ws) throw new Error("Excel 檔內沒有工作表");

      // 名稱 → id 對照（前端先解析，後端只認 id）
      const siteByName = new Map(sites.map((s) => [s.name.trim(), s.id]));
      const coachByName = new Map(coaches.map((c) => [c.realName.trim(), c.id]));

      const cellText = (raw: unknown): string => {
        if (raw == null) return "";
        if (typeof raw === "string") return raw.trim();
        if (typeof raw === "number") return String(raw);
        if (raw instanceof Date) {
          // 日期：以台北時區轉 YYYY-MM-DD
          const d = new Date(raw.getTime() + 8 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 10);
        }
        if (typeof raw === "object" && "text" in raw) {
          return String((raw as { text: string }).text).trim();
        }
        return String(raw).trim();
      };

      const cellTime = (raw: unknown): string => {
        // 接受 "08:00", "8:30", 0.333 (Excel time fraction), Date
        if (raw == null) return "";
        if (typeof raw === "string") return raw.trim();
        if (typeof raw === "number") {
          // Excel time = 一天的小數分數
          const totalMin = Math.round(raw * 24 * 60);
          const h = String(Math.floor(totalMin / 60)).padStart(2, "0");
          const m = String(totalMin % 60).padStart(2, "0");
          return `${h}:${m}`;
        }
        if (raw instanceof Date) {
          // 注意：ExcelJS 把時間視為 1900-01-01 的 UTC datetime
          const utcH = raw.getUTCHours();
          const utcM = raw.getUTCMinutes();
          return `${String(utcH).padStart(2, "0")}:${String(utcM).padStart(2, "0")}`;
        }
        return String(raw).trim();
      };

      const parseBool = (s: string): boolean => /^[YT1是]/.test(s) || /^TRUE$/i.test(s);
      const parseInt0 = (s: string, dflt = 0): number => {
        const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
        return Number.isNaN(n) ? dflt : n;
      };

      const rows: Array<Record<string, unknown>> = [];
      const localErrors: { row: number; date: string; message: string }[] = [];
      let rowIdx = 0;
      ws.eachRow((row, idx) => {
        if (idx === 1) return; // skip header
        rowIdx = idx;
        const cell = (col: number) => cellText(row.getCell(col).value);
        const date = cell(1);
        const startTimeRaw = row.getCell(2).value;
        const startTime = cellTime(startTimeRaw);
        if (!date || !startTime) return; // 跳過空白列
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          localErrors.push({ row: idx, date, message: "日期格式錯誤，應為 YYYY-MM-DD" });
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(startTime)) {
          localErrors.push({ row: idx, date: `${date} ${startTime}`, message: "時間格式錯誤，應為 HH:MM" });
          return;
        }

        // 夜潛：留空自動由時間判斷
        const nightRaw = cell(3);
        const isNightDive = nightRaw ? parseBool(nightRaw) : startTime >= "16:00";

        // 潛點：中文名 → id  (col 4)
        const siteNames = cell(4).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        const diveSiteIds: string[] = [];
        for (const sn of siteNames) {
          const sid = siteByName.get(sn);
          if (sid) diveSiteIds.push(sid);
          else localErrors.push({ row: idx, date: `${date} ${startTime}`, message: `找不到潛點「${sn}」（請先在「潛點管理」新增）` });
        }

        // 教練：姓名 → id  (col 7)
        const coachNames = cell(7).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        const coachIds: string[] = [];
        for (const cn of coachNames) {
          const cid = coachByName.get(cn);
          if (cid) coachIds.push(cid);
          else localErrors.push({ row: idx, date: `${date} ${startTime}`, message: `找不到教練「${cn}」（請先在「教練管理」新增）` });
        }

        rows.push({
          date,
          startTime,
          isNightDive,
          isScooter: false, // 已移除水上摩托車欄位
          diveSiteIds,
          tankCount: parseInt0(cell(5), 3),
          capacity: parseInt0(cell(6), 0),
          coachIds,
          pricing: {
            baseTrip: 0,
            extraTank: parseInt0(cell(8)),
            nightDive: parseInt0(cell(9)),
            scooterRental: 0,
            otherFee: parseInt0(cell(10)),
            otherFeeNote: cell(11),
          },
          meetingPoint: cell(12),
          meetingPointUrl: cell(13),
          notes: cell(14),
          status: "open",
        });
      });

      if (rowIdx === 0) {
        throw new Error("檔案內沒有資料");
      }
      if (rows.length === 0 && localErrors.length > 0) {
        // 全部錯誤，無有效列
        setImportResult({ total: 0, created: 0, errors: localErrors });
        return;
      }
      if (rows.length === 0) {
        throw new Error("沒有可匯入的資料（請至少填寫日期、時間）");
      }

      const res = await adminFetch<{
        ok: boolean; total: number; created: number;
        errors: { row: number; date: string; message: string }[];
      }>("/api/admin/trips/bulk-import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });

      setImportResult({
        total: res.total + localErrors.length,
        created: res.created,
        errors: [...localErrors, ...res.errors],
      });

      // 重新載入
      const t = await adminFetch<{ trips: Trip[] }>("/api/admin/trips");
      setTrips(t.trips ?? []);
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Excel 匯入失敗");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleTripFileUpload}
            className="hidden"
          />
          <Button size="sm" variant="outline" onClick={downloadTripTemplate} title="下載 Excel 範本（含潛點/教練名稱對照）">
            <Download className="mr-1.5 h-4 w-4" />下載範本
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1.5 h-4 w-4" />
            {importing ? "匯入中..." : "Excel 匯入"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增場次
          </Button>
        </div>

        {/* 匯入結果回饋 */}
        {importResult && (
          <div className="rounded-lg border p-3 text-sm" style={{
            borderColor: importResult.errors.length === 0 ? "rgba(74, 222, 128, 0.4)" : "rgba(251, 191, 36, 0.4)",
            background: importResult.errors.length === 0 ? "rgba(74, 222, 128, 0.08)" : "rgba(251, 191, 36, 0.08)",
          }}>
            <div className="flex items-center gap-2 font-semibold mb-1.5">
              <FileSpreadsheet className="h-4 w-4" />
              <span>匯入完成：</span>
              <span className="text-green-700">新增 {importResult.created}</span>
              {importResult.errors.length > 0 && (
                <span className="text-amber-700">失敗 {importResult.errors.length}</span>
              )}
              <button
                onClick={() => setImportResult(null)}
                className="ml-auto text-xs text-[var(--muted-foreground)] hover:underline"
              >
                關閉
              </button>
            </div>
            {importResult.errors.length > 0 && (
              <div className="mt-2 space-y-0.5 max-h-32 overflow-y-auto text-xs">
                {importResult.errors.map((er, i) => (
                  <div key={i} className="text-amber-800">
                    第 {er.row} 列（{er.date}）：{er.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
                        <span>{trip.date.slice(0, 10)}</span>
                        <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">
                          ({weekdayLabel(trip.date)})
                        </span>
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
                          {/* 複製增次 — 一鍵複製所有欄位作為新場次（日期 +1 天），加速排場 */}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDuplicate(trip)}
                            title="複製此場次 → 新增（日期自動 +1 天）"
                            className="border-sky-400 text-sky-600 hover:bg-sky-50"
                          >
                            <Copy className="h-3 w-3" />
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
                {(() => {
                  const isFormDatePast = form.date < taipeiToday();
                  return (
                    <>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                      >
                        <option value="open" disabled={isFormDatePast}>
                          🟢 開放{isFormDatePast ? "（日期已過，禁用）" : ""}
                        </option>
                        <option value="cancelled">🚫 取消</option>
                        <option value="completed">✓ 結束</option>
                      </select>
                      {isFormDatePast && form.status === "open" && (
                        <p className="mt-0.5 text-[9px] text-amber-600">
                          日期已過：請改為取消或結束
                        </p>
                      )}
                    </>
                  );
                })()}
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
              {/* 選取潛點後顯示詳情（自潛點管理同步） */}
              {(() => {
                const selectedSite = sites.find((s) => s.id === form.diveSiteIds[0]);
                if (!selectedSite) return null;
                const parts: string[] = [];
                if (selectedSite.region) parts.push(`📍 ${REGION_LABELS[selectedSite.region] ?? selectedSite.region}`);
                if (selectedSite.difficulty) parts.push(`難度 ${DIFF_LABELS[selectedSite.difficulty] ?? selectedSite.difficulty}`);
                if (selectedSite.maxDepth) parts.push(`最大 ${selectedSite.maxDepth}m`);
                return (
                  <div className="mt-1.5 rounded-md bg-[var(--muted)]/40 p-2 text-[10px] space-y-1 border" style={{ borderColor: "var(--border)" }}>
                    {parts.length > 0 && (
                      <div className="font-medium text-[var(--foreground)]">{parts.join("　")}</div>
                    )}
                    {selectedSite.features && selectedSite.features.length > 0 && (
                      <div className="text-[var(--muted-foreground)]">✦ {selectedSite.features.join("、")}</div>
                    )}
                    {selectedSite.description && (
                      <div className="text-[var(--muted-foreground)]">{selectedSite.description}</div>
                    )}
                    {selectedSite.cautions && (
                      <div className="text-amber-600">⚠️ {selectedSite.cautions}</div>
                    )}
                    {selectedSite.locationUrl && !form.meetingPointUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({
                          ...form,
                          meetingPoint: form.meetingPoint || selectedSite.name,
                          meetingPointUrl: selectedSite.locationUrl ?? "",
                        })}
                        className="text-[10px] text-[var(--color-phosphor)] hover:underline font-medium"
                      >
                        ↓ 自動帶入潛點位置 URL 到集合地點
                      </button>
                    )}
                  </div>
                );
              })()}
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
                    value={form.tankCount === 0 ? "" : String(form.tankCount)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // 只允許空 / 純數字（避免奇怪字元）
                      if (raw === "") {
                        setForm({ ...form, tankCount: 0 });
                      } else if (/^\d+$/.test(raw)) {
                        setForm({ ...form, tankCount: parseInt(raw, 10) });
                      }
                      // 其他輸入忽略 → input 自動退回上一個有效值
                    }}
                    onBlur={() => {
                      // 失焦時做範圍校正（1-5）
                      if (form.tankCount < 1) setForm((f) => ({ ...f, tankCount: 1 }));
                      else if (form.tankCount > 5) setForm((f) => ({ ...f, tankCount: 5 }));
                    }}
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
                    value={String(form.capacity)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        setForm({ ...form, capacity: 0 });
                      } else if (/^\d+$/.test(raw)) {
                        setForm({ ...form, capacity: parseInt(raw, 10) });
                      }
                    }}
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
                    value={String(form.pricing.extraTank)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || /^\d+$/.test(raw)) {
                        setForm({ ...form, pricing: { ...form.pricing, extraTank: raw === "" ? 0 : parseInt(raw, 10) } });
                      }
                    }}
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
                    value={String(form.pricing.otherFee ?? 0)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || /^\d+$/.test(raw)) {
                        setForm({ ...form, pricing: { ...form.pricing, otherFee: raw === "" ? 0 : parseInt(raw, 10) } });
                      }
                    }}
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
                    value={String(form.pricing.nightDive)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || /^\d+$/.test(raw)) {
                        setForm({ ...form, pricing: { ...form.pricing, nightDive: raw === "" ? 0 : parseInt(raw, 10) } });
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* 集合地點 — 分兩欄：地點說明 + Google Map URL */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">地點說明</Label>
                <Input
                  value={form.meetingPoint}
                  onChange={(e) => setForm({ ...form, meetingPoint: e.target.value })}
                  placeholder="例：萊萊花椰菜 / 龍洞 4 號港"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">Google Map URL</Label>
                <Input
                  type="url"
                  value={form.meetingPointUrl}
                  onChange={(e) => setForm({ ...form, meetingPointUrl: e.target.value })}
                  placeholder="https://maps.app.goo.gl/..."
                />
              </div>
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
