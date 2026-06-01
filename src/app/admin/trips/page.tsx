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
  referenceVideoUrl?: string | null;
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

// DIFF_LABELS / REGION_LABELS 已移除（v153 起無潛點詳情面板）

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
  referenceVideoUrl: "",
  status: "open" as string,
};

type TripForm = typeof BLANK_FORM;

function estimatedRevenue(trip: Trip): number {
  const p = trip.pricing ?? { baseTrip: 0, extraTank: 0, nightDive: 0, scooterRental: 0 };
  const tanksPerPerson = trip.tankCount ?? 1;
  const baseTrip = p.baseTrip ?? 0;
  const extraTank = p.extraTank ?? 0;
  const booked = trip.booked ?? 0;
  const baseWithTanks = baseTrip + (tanksPerPerson - 1) * extraTank;
  // v155：夜潛 / 水上摩托車加成已移除，僅算氣瓶費 + 其他費用
  const extras = (p.otherFee ?? 0);
  return booked * (baseWithTanks + extras);
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

  // 排序 + 篩選 + 分頁
  type SortKey = "date" | "code" | "startTime" | "booked" | "revenue" | "status";
  const [sortKey, setSortKey] = useState<SortKey>("date");
  // v180：日期預設 asc（近的在最上面）
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterRange, setFilterRange] = useState<"week" | "month" | "all">("week");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "date" ? "asc" : "asc"); }
    setPage(1);
  }

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
      referenceVideoUrl: trip.referenceVideoUrl ?? "",
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
      referenceVideoUrl: trip.referenceVideoUrl ?? "",
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
        referenceVideoUrl: form.referenceVideoUrl || null,
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

    // 兩列範例（白天 + 夜潛，夜潛不再有加價）
    ws.addRow({
      date: "2026-06-15",
      startTime: "08:00",
      isNightDive: "",
      sites: sites[0]?.name ?? "鶯歌石",
      tankCount: 2,
      capacity: 8,
      coaches: coaches[0]?.realName ?? "王教練",
      extraTank: 500,
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
      ["潛點名稱", "自由輸入（多個用半形或全形逗號分隔），系統不再強制對照潛點清單"],
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

  /** 匯出目前所有日潛場次為 Excel（欄位與下載範本對齊，可直接編輯後再匯入） */
  async function exportTripsExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("日潛場次");
    ws.columns = [
      { header: "編號", key: "code", width: 16 },
      { header: "日期（YYYY-MM-DD）", key: "date", width: 16 },
      { header: "時間（HH:MM）", key: "startTime", width: 12 },
      { header: "夜潛（Y/N）", key: "isNightDive", width: 10 },
      { header: "潛點名稱（逗號分隔）", key: "sites", width: 30 },
      { header: "氣瓶數", key: "tankCount", width: 8 },
      { header: "人數上限（0=∞）", key: "capacity", width: 14 },
      { header: "教練姓名（逗號分隔）", key: "coaches", width: 20 },
      { header: "氣瓶費/瓶", key: "extraTank", width: 12 },
      { header: "其他費用", key: "otherFee", width: 12 },
      { header: "其他費用說明", key: "otherFeeNote", width: 18 },
      { header: "集合地點", key: "meetingPoint", width: 22 },
      { header: "Google Map URL", key: "meetingPointUrl", width: 32 },
      { header: "備註", key: "notes", width: 28 },
      { header: "狀態", key: "status", width: 10 },
      { header: "已報名", key: "booked", width: 10 },
      { header: "預估收費 (NT$)", key: "revenue", width: 16 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2342" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 28;

    const STATUS_LABEL: Record<string, string> = {
      open: "開放", full: "額滿", cancelled: "已取消", completed: "已完成",
    };

    for (const t of trips) {
      ws.addRow({
        code: t.code ?? "",
        date: t.date.slice(0, 10),
        startTime: t.startTime,
        isNightDive: t.isNightDive ? "Y" : "N",
        sites: t.diveSiteIds.map(siteName).join(", "),
        tankCount: t.tankCount,
        capacity: t.capacity ?? 0,
        coaches: t.coachIds.map(coachName).join(", "),
        extraTank: t.pricing.extraTank,
        otherFee: t.pricing.otherFee ?? 0,
        otherFeeNote: t.pricing.otherFeeNote ?? "",
        meetingPoint: t.meetingPoint ?? "",
        meetingPointUrl: t.meetingPointUrl ?? "",
        notes: t.notes ?? "",
        status: STATUS_LABEL[t.status] ?? t.status,
        booked: t.booked,
        revenue: estimatedRevenue(t),
      });
    }
    // 凍結首列方便檢視
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = TODAY.replace(/-/g, "");
    a.href = url;
    a.download = `diving_trips_export_${stamp}.xlsx`;
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

        // 潛點：直接存入名稱（v153 起不再對照潛點管理表）
        const diveSiteIds = cell(4).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

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
            nightDive: 0,           // v155：夜潛加價已移除
            scooterRental: 0,
            otherFee: parseInt0(cell(9)),
            otherFeeNote: cell(10),
          },
          meetingPoint: cell(11),
          meetingPointUrl: cell(12),
          notes: cell(13),
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

  // selectSiteId 已移除（v153 起改文字輸入）

  function toggleCoachId(id: string) {
    setForm((f) => ({
      ...f,
      coachIds: f.coachIds.includes(id)
        ? f.coachIds.filter((x) => x !== id)
        : [...f.coachIds, id],
    }));
  }

  // ── 衍生列表：filter → sort → paginate ────────────────────────────
  const filteredTrips = (() => {
    if (filterRange === "all") return trips;
    const today = taipeiToday();
    const todayDate = new Date(`${today}T00:00:00+08:00`);
    const cutoff = new Date(todayDate);
    if (filterRange === "week") cutoff.setDate(cutoff.getDate() - 7);
    else if (filterRange === "month") cutoff.setMonth(cutoff.getMonth() - 1);
    return trips.filter((t) => {
      const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
      return td >= cutoff;
    });
  })();

  // v180 排序策略：
  // - 「日期」排序時，未來場次永遠在前、已過去的放最後
  //   未來場次內：依 sortDir 排（預設 asc → 近的在前）
  //   過去場次內：永遠 desc（最近過去的在前）
  // - 其他欄位排序：照原本邏輯（不分過去/未來）
  const today = taipeiToday();
  const sortedTrips = [...filteredTrips].sort((a, b) => {
    if (sortKey === "date") {
      const aDate = a.date.slice(0, 10);
      const bDate = b.date.slice(0, 10);
      const aPast = aDate < today;
      const bPast = bDate < today;
      if (aPast !== bPast) return aPast ? 1 : -1; // 過去的丟後面
      if (aPast && bPast) {
        // 兩個都過去 → 永遠最近的在前（desc）
        if (aDate < bDate) return 1;
        if (aDate > bDate) return -1;
        return 0;
      }
      // 兩個都未來 → 依 sortDir
      if (aDate < bDate) return sortDir === "asc" ? -1 : 1;
      if (aDate > bDate) return sortDir === "asc" ? 1 : -1;
      return 0;
    }
    let va: string | number = 0, vb: string | number = 0;
    switch (sortKey) {
      case "startTime": va = a.startTime;         vb = b.startTime; break;
      case "code":      va = a.code ?? "";        vb = b.code ?? ""; break;
      case "booked":    va = a.booked ?? 0;       vb = b.booked ?? 0; break;
      case "revenue":   va = estimatedRevenue(a); vb = estimatedRevenue(b); break;
      case "status":    va = effectiveTripStatus(a)[0]; vb = effectiveTripStatus(b)[0]; break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedTrips.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedTrips = sortedTrips.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 表頭排序按鈕（小箭頭）
  function SortHeader({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" | "center" }) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={cn("inline-flex items-center gap-0.5 font-medium hover:text-[var(--foreground)] transition-colors",
          active && "text-[var(--foreground)]",
          align === "right" && "justify-end w-full",
        )}
      >
        {children}
        <span className="text-[10px] opacity-60">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    );
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
          <Button size="sm" variant="outline" onClick={downloadTripTemplate} title="下載 Excel 範本（空白格式）">
            <Download className="mr-1.5 h-4 w-4" />下載範本
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportTripsExcel}
            disabled={loading || trips.length === 0}
            title="把目前所有日潛場次匯出 Excel"
          >
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel 匯出
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

        {/* Filter chips */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--muted-foreground)]">範圍：</span>
          {([
            { k: "week" as const, label: "一週內" },
            { k: "month" as const, label: "一個月內" },
            { k: "all" as const, label: "全部" },
          ]).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => { setFilterRange(k); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                filterRange === k
                  ? "bg-[var(--color-ocean-deep)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
              )}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[var(--muted-foreground)]">
            共 {sortedTrips.length} 筆 · 每頁 {PAGE_SIZE} 筆 · 第 {currentPage}/{totalPages} 頁
          </span>
        </div>

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
                    <th className="px-3 py-2 font-medium"><SortHeader k="status">狀態</SortHeader></th>
                    <th className="px-3 py-2 font-medium"><SortHeader k="code">編號</SortHeader></th>
                    <th className="px-3 py-2 font-medium"><SortHeader k="date">日期</SortHeader></th>
                    <th className="px-3 py-2 font-medium"><SortHeader k="startTime">時段</SortHeader></th>
                    <th className="px-3 py-2 font-medium">地點</th>
                    <th className="px-3 py-2 font-medium">教練</th>
                    <th className="px-3 py-2 font-medium text-right"><SortHeader k="booked" align="right">已報名/可接受</SortHeader></th>
                    <th className="px-3 py-2 font-medium text-right"><SortHeader k="revenue" align="right">預估收費</SortHeader></th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTrips.map((trip, i) => {
                    const [effStatus, isAuto] = effectiveTripStatus(trip);
                    return (
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
                        {/* 狀態 — 移到最左邊 */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Badge variant={statusVariant(effStatus)} className="text-[10px]">
                              {TRIP_STATUS_LABEL[effStatus] ?? effStatus}
                            </Badge>
                            {isAuto && (
                              <span className="text-[9px] text-[var(--muted-foreground)]" title="日期已過，自動視為結束">
                                自動
                              </span>
                            )}
                          </div>
                        </td>
                        {/* 編號 */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {trip.code ? (
                            <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-teal-800">
                              {trip.code}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)]">—</span>
                          )}
                        </td>
                        {/* 日期 */}
                        <td className="px-3 py-1.5 tabular-nums font-medium whitespace-nowrap">
                          <span>{trip.date.slice(0, 10)}</span>
                          <span className="ml-1 text-[10px] font-normal text-[var(--muted-foreground)]">
                            ({weekdayLabel(trip.date)})
                          </span>
                        </td>
                        {/* 時段 */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1 tabular-nums">
                            {trip.isNightDive ? (
                              <Moon className="h-3 w-3 shrink-0" style={{ color: "#6b9fd4" }} />
                            ) : (
                              <Sun className="h-3 w-3 shrink-0" style={{ color: "#e8a020" }} />
                            )}
                            {trip.startTime}
                            {trip.isScooter && (
                              <Anchor className="h-3 w-3 text-[var(--color-phosphor)]" />
                            )}
                          </div>
                        </td>
                        {/* 地點 */}
                        <td className="px-3 py-1.5 text-xs">
                          {trip.diveSiteIds.length > 0
                            ? trip.diveSiteIds.map(siteName).join("・")
                            : "—"}
                          <span className="ml-1 text-[var(--muted-foreground)]">
                            / {trip.tankCount}支
                          </span>
                        </td>
                        {/* 教練 */}
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                          {trip.coachIds.length > 0
                            ? trip.coachIds.map(coachName).join("、")
                            : "—"}
                        </td>
                        {/* 已報名 — 防呆 undefined → 0 */}
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs whitespace-nowrap">
                          {(trip.booked ?? 0)} / {trip.capacity == null ? "∞" : trip.capacity}
                        </td>
                        {/* 預估收費 */}
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {(trip.booked ?? 0) === 0
                            ? "NT$0"
                            : `NT$${(estimatedRevenue(trip) || 0).toLocaleString()}`}
                        </td>
                        {/* 操作 — 縮小成 28px icon-only 按鈕 */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex gap-0.5">
                            <button onClick={() => openEdit(trip)} title="編輯"
                              className="rounded p-1.5 text-slate-600 hover:bg-slate-100 transition-colors">
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openDuplicate(trip)}
                              title="複製此場次 → 新增（日期自動 +1 天）"
                              className="rounded p-1.5 text-sky-600 hover:bg-sky-50 transition-colors">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {trip.status !== "cancelled" && (
                              <button onClick={() => deleteTrip(trip)}
                                title="取消場次（保留資料）"
                                className="rounded p-1.5 text-amber-600 hover:bg-amber-50 transition-colors">
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button onClick={() => hardDeleteTrip(trip)}
                              title="永久刪除（不可復原）"
                              className="rounded p-1.5 text-[var(--color-coral)] hover:bg-rose-50 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pagedTrips.length === 0 && (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]"
                      >
                        沒有符合條件的場次
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 分頁器 */}
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

            {/* Row 2: 潛點名稱 + 參考影片連結（並排） */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">潛點名稱</Label>
                <Input
                  value={form.diveSiteIds.join(", ")}
                  onChange={(e) => {
                    const names = e.target.value
                      .split(/[,，、]/)
                      .map((s) => s.trim())
                      .filter(Boolean);
                    setForm({ ...form, diveSiteIds: names });
                  }}
                  placeholder="例：鶯歌石 或 鶯歌石, 深奧"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">參考影片連結（選填）</Label>
                <Input
                  type="url"
                  value={form.referenceVideoUrl}
                  onChange={(e) => setForm({ ...form, referenceVideoUrl: e.target.value })}
                  placeholder="YouTube / Vimeo 等網址"
                />
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
              {/* v155：夜潛加價欄位移除（夜潛與白天統一收費） */}
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
