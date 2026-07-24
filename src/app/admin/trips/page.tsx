"use client";
import React, { useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { getCached, setCached } from "@/lib/admin-cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// v192：Dialog 已改為固定右側面板；v336 重新引入給 Dump 一週用
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, Moon, Sun, Anchor, Ban, Copy, Upload, Download, FileSpreadsheet, ChevronDown, ChevronRight, FileText, Check, Search, X } from "lucide-react";
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

// v545：Dump 一週也納入潛旅（依起始日 dateStart 落在區間判斷）
interface DumpTour {
  id: string;
  title: string;
  dateStart: string;
  dateEnd: string;
  durationLabel?: string | null;
  capacity?: number | null;
  booked?: number;
  deposit?: number | null;
  basePrice?: number | null;
  status: string;
}

interface Trip {
  id: string;
  code?: string | null;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  isBoat: boolean; // v714
  diveSiteIds: string[];
  tankCount: number;
  capacity: number | null;
  booked: number;
  bookedTanks?: number; // v719：實際氣瓶數 = Σ(人數×該筆潛次)，與展開明細一致
  revenue?: number;  // v224：實際 booking totalAmount 加總（排除取消/退款）
  paid?: number;     // v224：實際已收
  coachIds: string[];
  pricing: Pricing;
  notes: string | null;
  activityNote?: string | null;
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

// v242：取消場次常用原因（點選自動填入，仍可自行編輯）
const CANCEL_REASON_PRESETS = [
  "天氣海況不佳（東北季風浪大、能見度差）",
  "報名人數不足，未達開團人數",
  "教練臨時有事無法帶團",
  "船班 / 船家臨時取消",
  "場地維護或設備調整",
  "颱風 / 豪雨等天災警報",
];

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

// v183：展開查看訂單用的型別
interface AdminBookingMini {
  id: string;
  code?: string | null;
  participants: number;
  tankCount?: number | null; // v708：訂單實際潛次（每人）
  totalAmount: number;
  paidAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  user: { displayName: string; realName: string | null; phone: string | null };
}
interface TripBookingRow {
  id: string;
  code?: string | null;
  userName: string;
  phone: string | null;
  participants: number;
  tankCount: number | null; // v708：客戶實際選的潛次（每人）；舊單 null → fallback 場次預設
  totalAmount: number;
  paidAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
}
const PAY_STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  deposit_paid: "已付訂金",
  fully_paid: "已付清",
  refunding: "退款中",
  refunded: "已退款",
};
const BOOK_STATUS_LABEL: Record<string, string> = {
  pending: "待確認",
  awaiting_verify: "待確認匯款",   // v708：原本缺這項 → 顯示成英文 awaiting_verify
  confirmed: "已確認",
  cancelled_by_user: "客戶取消",
  cancelled_by_weather: "天氣取消",
  cancelled_unpaid: "訂單不成立",  // v708
  completed: "已完成",
  no_show: "未到場",
};

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
  extraTank: 600, // v808：氣瓶費(每瓶)預設 600（東北角各潛點；萊萊/石城 750 建場次時自行改）
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
  isBoat: false, // v714：岸潛(false)/船潛(true)
  diveSiteIds: [] as string[],
  tankCount: 3,
  capacity: 8,
  coachIds: [] as string[],
  pricing: BLANK_PRICING_DEFAULT,
  notes: "",
  activityNote: "",
  meetingPoint: "",
  meetingPointUrl: "",
  referenceVideoUrl: "",
  status: "open" as string,
};

type TripForm = typeof BLANK_FORM;

function estimatedRevenue(trip: Trip): number {
  // v224：優先用 API 回傳的實際 booking 加總（更準確）
  //   排除取消、no_show、退款中、已退款
  if (typeof trip.revenue === "number") return trip.revenue;
  // fallback：沒拿到 revenue 時用 booked × 預估單價（舊邏輯）
  const p = trip.pricing ?? { baseTrip: 0, extraTank: 0, nightDive: 0, scooterRental: 0 };
  const tanksPerPerson = trip.tankCount ?? 1;
  const baseTrip = p.baseTrip ?? 0;
  const extraTank = p.extraTank ?? 0;
  const booked = trip.booked ?? 0;
  const extras = (p.otherFee ?? 0);
  // v813：船潛 extraTank 是每人整包價(不乘支數)；岸潛維持原估法(baseTrip+額外支數)。
  const perPerson = trip.isBoat ? extraTank : baseTrip + (tanksPerPerson - 1) * extraTank;
  return booked * (perPerson + extras);
}

export default function AdminTripsPage() {
  const [trips, setTrips] = useState<Trip[]>(
    () => getCached<{ trips: Trip[] }>("/api/admin/trips")?.trips ?? [],
  );
  const [sites, setSites] = useState<Site[]>(
    () => (getCached<Site[]>("/api/admin/sites") as Site[] | undefined) ?? [],
  );
  const [coaches, setCoaches] = useState<Coach[]>([]);
  // v545：潛旅（給 Dump 一週納入，依起始日判斷）
  const [tours, setTours] = useState<DumpTour[]>(
    () => getCached<{ tours: DumpTour[] }>("/api/admin/tours")?.tours ?? [],
  );
  const [loading, setLoading] = useState(() => getCached("/api/admin/trips") === undefined);
  const [err, setErr] = useState<string | null>(null);

  // Dialog state
  // v192：panel 永遠顯示；初始預設為 create 模式
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TripForm>({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [defaultPricing, setDefaultPricing] = useState<Pricing>(BLANK_PRICING_DEFAULT);
  // v242：取消場次原因 modal
  const [cancelTarget, setCancelTarget] = useState<Trip | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  // v617：天氣取消 — 勾選則走 weather-cancel（取消訂單 + 發天氣取消通知 + 退抵用金）
  const [cancelNotify, setCancelNotify] = useState(false);

  // v336：Dump 一週場次（給 LINE 筆記本用）
  const [dumpOpen, setDumpOpen] = useState(false);
  const [dumpStartDate, setDumpStartDate] = useState<string>(() => {
    // 預設下週一
    const d = new Date();
    const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
    const daysUntilNextMonday = day === 1 ? 7 : (8 - day) % 7;
    d.setDate(d.getDate() + daysUntilNextMonday);
    return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  });
  const [dumpDays, setDumpDays] = useState(7); // v558：一次抓幾天(手動,預設 7)
  const [dumpText, setDumpText] = useState(""); // v559：可手動編輯的預覽內容
  const [dumpCopied, setDumpCopied] = useState(false);
  // v592：可加入 Dump 的「生效中公開優惠代碼」
  const [activePromos, setActivePromos] = useState<Array<{ code: string; title: string; label: string; endAt: string }>>([]);
  // v391：場次 Dump 自動優惠開頭（由系統設定控制）
  const [dumpPromo, setDumpPromo] = useState<{ enabled: boolean; text: string }>({ enabled: false, text: "" });
  // v891：Dump 結尾聯繫／資訊（後台可編輯；enabled 預設 true，text 空 → 用程式預設）
  const [dumpFooter, setDumpFooter] = useState<{ enabled: boolean; text: string }>({ enabled: true, text: "" });

  // v183：展開查看訂單
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [tripBookings, setTripBookings] = useState<Record<string, TripBookingRow[] | "loading" | "error">>({});

  async function toggleExpand(tripId: string) {
    if (expandedTripId === tripId) {
      setExpandedTripId(null);
      return;
    }
    setExpandedTripId(tripId);
    if (tripBookings[tripId] && tripBookings[tripId] !== "error") return;
    setTripBookings((m) => ({ ...m, [tripId]: "loading" }));
    try {
      const r = await adminFetch<{ bookings: AdminBookingMini[] }>(
        `/api/admin/bookings?refId=${tripId}`,
      );
      const rows: TripBookingRow[] = r.bookings.map((b) => ({
        id: b.id,
        code: b.code,
        userName: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        participants: b.participants,
        tankCount: b.tankCount ?? null, // v708：帶出訂單實際潛次
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod ?? "",
      }));
      setTripBookings((m) => ({ ...m, [tripId]: rows }));
    } catch {
      setTripBookings((m) => ({ ...m, [tripId]: "error" }));
    }
  }

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
  // v556：預設「未到期(全部未來)」讓畫面乾淨(不顯示過期場次);仍可切「全部」
  const [filterRange, setFilterRange] = useState<"week" | "month" | "all" | "past" | "upcoming">("upcoming");
  const [search, setSearch] = useState(""); // v397：搜尋 filter
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
      adminFetch<{ config: { defaultTripPricing?: Partial<Pricing>; dumpPromoEnabled?: boolean; dumpPromoText?: string; dumpFooterEnabled?: boolean; dumpFooterText?: string } }>("/api/admin/site-config"),
      adminFetch<{ tours: DumpTour[] }>("/api/admin/tours"),
    ]).then(([t, s, c, cfg, to]) => {
      if (t.status === "fulfilled") { setTrips(t.value.trips ?? []); setCached("/api/admin/trips", { trips: t.value.trips ?? [] }); }
      else setErr("場次載入失敗：" + (t.reason?.message ?? String(t.reason)));

      if (s.status === "fulfilled") { setSites(Array.isArray(s.value) ? s.value : []); setCached("/api/admin/sites", Array.isArray(s.value) ? s.value : []); }
      if (c.status === "fulfilled") setCoaches(c.value.coaches ?? []);
      if (to.status === "fulfilled") { setTours(to.value.tours ?? []); setCached("/api/admin/tours", { tours: to.value.tours ?? [] }); }
      if (cfg.status === "fulfilled") {
        const dp = cfg.value.config.defaultTripPricing;
        if (dp && Object.keys(dp).length > 0) {
          setDefaultPricing({ ...BLANK_PRICING_DEFAULT, ...dp });
        }
        setDumpPromo({
          enabled: !!cfg.value.config.dumpPromoEnabled,
          text: cfg.value.config.dumpPromoText ?? "",
        });
        setDumpFooter({
          enabled: cfg.value.config.dumpFooterEnabled ?? true,
          text: cfg.value.config.dumpFooterText ?? "",
        });
      }
    }).finally(() => setLoading(false));
  }, []);
  // v399：場次本地變動同步回快取
  useEffect(() => { setCached("/api/admin/trips", { trips }); }, [trips]);
  // v559：開啟 Dump / 改起始日或天數 → 重生預覽(中間的手動編輯保留,直到這些改變才覆蓋)
  useEffect(() => {
    if (dumpOpen) setDumpText(computeDumpText());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dumpOpen, dumpStartDate, dumpDays]);

  // v592：開 Dump 時載入生效中的公開優惠代碼(供下拉加入)
  useEffect(() => {
    if (!dumpOpen) return;
    const now = Date.now();
    adminFetch<{ items: Array<{ code: string; title: string; discountType: string; discountValue: number; startAt: string; endAt: string; isPublic: boolean; enabled: boolean }> }>("/api/admin/promo")
      .then((d) => setActivePromos(
        (d.items ?? [])
          .filter((p) => p.enabled && p.isPublic && new Date(p.startAt).getTime() <= now && new Date(p.endAt).getTime() >= now)
          .map((p) => ({ code: p.code, title: p.title, endAt: p.endAt, label: p.discountType === "per_tank" ? `每支氣瓶 −$${p.discountValue}` : `訂單 −${p.discountValue}%` })),
      ))
      .catch(() => {});
  }, [dumpOpen]);

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
      isBoat: trip.isBoat, // v714
      diveSiteIds: [...trip.diveSiteIds],
      tankCount: trip.tankCount,
      capacity: trip.capacity ?? 0,
      coachIds: [...trip.coachIds],
      pricing: { ...BLANK_PRICING_DEFAULT, ...trip.pricing },
      notes: trip.notes ?? "",
      activityNote: trip.activityNote ?? "",
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
      isBoat: trip.isBoat, // v714
      diveSiteIds: [...trip.diveSiteIds],
      tankCount: trip.tankCount,
      capacity: trip.capacity ?? 0,
      coachIds: [...trip.coachIds],
      pricing: {
        ...BLANK_PRICING_DEFAULT,
        ...trip.pricing,
      },
      notes: trip.notes ?? "",
      activityNote: trip.activityNote ?? "",
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
        activityNote: form.activityNote || null,
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
      // v192：儲存成功後回到「新增場次」空白狀態，方便連續輸入
      openCreate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 把後端的英文錯誤碼換成中文友善訊息
      let friendly = msg;
      if (msg.includes("trip_date_passed")) {
        friendly = "場次日期已過，無法設為「開放」。請把『場次狀態』改為『結束』或『取消』後再儲存。";
      }
      alert("儲存失敗：" + friendly);
    } finally {
      setSaving(false);
    }
  }

  // v242：打開取消原因 modal（不再用 confirm）
  function deleteTrip(trip: Trip) {
    setCancelTarget(trip);
    setCancelReason("");
    // v617：有報名時預設「天氣取消（通知+退款）」，避免悄悄取消讓客戶不知道
    setCancelNotify((trip.booked ?? 0) > 0);
  }

  // v242：送出取消（帶原因）
  async function confirmCancelTrip() {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) {
      alert("請選擇或填寫取消原因");
      return;
    }
    setCancelBusy(true);
    try {
      if (cancelNotify) {
        // v617：天氣取消 → 取消該場次所有訂單 + 發天氣取消通知（LINE/Email/站內）+ 退抵用金
        const r = await adminFetch<{ ok: boolean; notified: number }>(
          `/api/coach/trips/weather-cancel`,
          { method: "POST", body: JSON.stringify({ tripId: cancelTarget.id, reason }) },
        );
        alert(`已天氣取消並通知 ${r?.notified ?? 0} 位客戶（已退還其折抵的抵用金）。`);
      } else {
        // 僅取消場次（不通知客戶、不退款）
        await adminFetch(`/api/admin/trips/${cancelTarget.id}`, {
          method: "DELETE",
          body: JSON.stringify({ reason }),
        });
      }
      setTrips((arr) =>
        arr.map((x) =>
          x.id === cancelTarget.id
            ? { ...x, status: "cancelled" }
            : x,
        ),
      );
      setCancelTarget(null);
      setCancelReason("");
    } catch (e) {
      alert("取消失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCancelBusy(false);
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
  // v277/v319：past=過期、upcoming=未到期（含今天起所有）、week=未來 7 天、month=未來 30 天
  const rangeFiltered = (() => {
    if (filterRange === "all") return trips;
    const today = taipeiToday();
    const todayDate = new Date(`${today}T00:00:00+08:00`);
    if (filterRange === "past") {
      return trips.filter((t) => {
        const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
        return td < todayDate;
      });
    }
    if (filterRange === "upcoming") {
      return trips.filter((t) => {
        const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
        return td >= todayDate;
      });
    }
    // v319：week/month 改為「未來 N 天內」（today ~ today + N）
    const future = new Date(todayDate);
    if (filterRange === "week") future.setDate(future.getDate() + 7);
    else if (filterRange === "month") future.setDate(future.getDate() + 30);
    return trips.filter((t) => {
      const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
      return td >= todayDate && td <= future;
    });
  })();
  // v397：搜尋 filter（編號 / 地點 / 教練 / 日期）
  const filteredTrips = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return rangeFiltered;
    return rangeFiltered.filter((t) => {
      const sites = t.diveSiteIds.map(siteName).join(" ");
      const coaches = t.coachIds.map(coachName).join(" ");
      return [t.code ?? "", t.date.slice(0, 10), sites, coaches]
        .join(" ")
        .toLowerCase()
        .includes(q);
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

  // v336：Dump 一週場次（給 LINE 筆記本貼）
  function computeDumpText(): string {
    const start = new Date(`${dumpStartDate}T00:00:00+08:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, dumpDays) - 1); // v558：天數手動(含當日)
    // v383：日期改斜線 MM/DD
    const fmtMD = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const weekdayMap = ["日", "一", "二", "三", "四", "五", "六"];
    // 過濾出落在 [start, end] 區間、且非取消的場次
    const inRange = trips.filter((t) => {
      const td = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
      return td >= start && td <= end && t.status !== "cancelled";
    });
    inRange.sort((a, b) => {
      const da = a.date.slice(0, 10);
      const db = b.date.slice(0, 10);
      if (da !== db) return da < db ? -1 : 1;
      return a.startTime.localeCompare(b.startTime);
    });
    const siteName = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
    const baseUrl =
      typeof window !== "undefined" ? window.location.origin : "https://haiwangzi.xyz";
    // v383：小編 LINE 群組連結（如需更換改這裡）
    const supportLine = "https://line.me/R/ti/p/@894bpmew";
    const lines: string[] = [];
    // v886：壓縮排版 — 全篇不用空行，改用 ━ 分隔線分段（LINE 上更緊湊好讀）
    const HR = "━━━━━━━━━━━━━━";
    // v554：品牌三叉戟 emoji(純文字無法嵌真圖)。v886：標題與網址同行
    lines.push(`🔱 東北角海王子官網 ${baseUrl}`);
    // v391：開啟「Dump 優惠開頭」時，先帶出系統設定的優惠文案 + 分隔線
    if (dumpPromo.enabled && dumpPromo.text.trim()) {
      // 後台文案本身可能含空行 → 一併壓掉，避免整份被撐開
      lines.push(...dumpPromo.text.trim().split("\n").map((s) => s.trimEnd()).filter((s) => s !== ""));
    }
    lines.push(HR);
    const startLabel = `${fmtMD(start)}(週${weekdayMap[start.getDay()]})`;
    const endLabel = `${fmtMD(end)}(週${weekdayMap[end.getDay()]})`;
    // v888：先出「手機開啟連結」+ 網址，再接場次標題與清單
    lines.push("📱 請用手機開啟連結 可以累積潛水並贈送抵用金");
    lines.push(`${baseUrl}/d`);
    lines.push(`🌊 日潛場次 ${startLabel} ~ ${endLabel}`);
    if (inRange.length === 0) {
      lines.push("（此週尚無場次）");
    } else {
      for (const t of inRange) {
        const d = new Date(`${t.date.slice(0, 10)}T00:00:00+08:00`);
        const dateStr = fmtMD(d);
        const wd = weekdayMap[d.getDay()];
        const sitesStr = t.diveSiteIds.map(siteName).join("·") || "未設潛點";
        const moon = t.isNightDive ? "🌙" : ""; // v383：夜潛圖示放潛點前
        lines.push(`${dateStr}(週${wd}) ${t.startTime} ${moon}${sitesStr} ${t.tankCount} 支`);
      }
    }
    // v545：潛旅 — 依「起始日 dateStart」落在本週區間才納入
    const fmtMDs = (s: string) => { const p = s.slice(0, 10).split("-"); return `${p[1]}/${p[2]}`; };
    const toursInRange = tours
      .filter((t) => {
        if (t.status === "cancelled") return false;
        const sd = new Date(`${t.dateStart.slice(0, 10)}T00:00:00+08:00`);
        return sd >= start && sd <= end;
      })
      .sort((a, b) => (a.dateStart.slice(0, 10) < b.dateStart.slice(0, 10) ? -1 : 1));
    if (toursInRange.length > 0) {
      lines.push(HR);
      lines.push("⛴️ 本週出發潛旅");
      for (const t of toursInRange) {
        const range = t.dateStart.slice(0, 10) === t.dateEnd.slice(0, 10)
          ? fmtMDs(t.dateStart)
          : `${fmtMDs(t.dateStart)}–${fmtMDs(t.dateEnd)}`;
        const dur = t.durationLabel ? `（${t.durationLabel}）` : "";
        const remain = t.capacity == null
          ? ""
          : (Math.max(0, t.capacity - (t.booked ?? 0)) > 0 ? `　餘 ${t.capacity - (t.booked ?? 0)}` : "　額滿");
        // v887：不列訂金/團費（客戶點進潛旅頁看即可，dump 只留日期/名稱/餘額）
        lines.push(`${range} ${t.title}${dur}${remain}`);
      }
    }
    // v891：結尾聯繫／資訊（區塊 3）由後台 Dump 設定控制；留空 → 用程式預設
    const DEFAULT_FOOTER = [
      "🔗 如果有潛水任何問題可以透過以下方式汪汪聯繫",
      `LINE  ${supportLine}`,
      `會員優惠 ${baseUrl}/rewards`,
      `常見問題 ${baseUrl}/faq`,
      `費用價目 ${baseUrl}/pricing`,
    ].join("\n");
    if (dumpFooter.enabled) {
      const footerLines = (dumpFooter.text.trim() || DEFAULT_FOOTER)
        .split("\n").map((s) => s.trimEnd()).filter((s) => s !== "");
      if (footerLines.length) {
        lines.push(HR);
        lines.push(...footerLines);
      }
    }
    return lines.join("\n");
  }
  async function copyDumpText() {
    const text = dumpText || computeDumpText(); // v559：複製手動編輯後的內容
    try {
      await navigator.clipboard.writeText(text);
      setDumpCopied(true);
      setTimeout(() => setDumpCopied(false), 2000);
    } catch {
      // fallback：選取 textarea
      const ta = document.getElementById("dump-textarea") as HTMLTextAreaElement | null;
      if (ta) { ta.select(); document.execCommand("copy"); setDumpCopied(true); setTimeout(() => setDumpCopied(false), 2000); }
    }
  }

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
      {/* v192：與潛水團相同的 雙欄佈局；外層固定高度 + overflow:hidden 讓左右各自獨立 scroll */}
      <div style={{ height: "calc(100vh - 56px)", margin: "-1rem", display: "flex", flexDirection: "column", overflow: "hidden", background: "#EEF1F5" }}>
        {/* 共用 topbar（v342：移除下載範本 / Excel 匯出 / Excel 匯入）*/}
        <div className="flex flex-wrap items-center justify-end gap-2"
          style={{ padding: "12px 24px", borderBottom: "1px solid #E4E8ED", background: "#fff", flexShrink: 0 }}>
          {/* v397：搜尋 filter（編號 / 地點 / 教練 / 日期）*/}
          <div className="relative mr-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋 編號 / 地點 / 教練 / 日期…"
              className="w-full rounded-md border py-1.5 pl-8 pr-8 text-sm"
              style={{ borderColor: "var(--border)" }}
            />
            {search && (
              <button type="button" onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
                title="清除">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {/* v336：Dump 一週場次 — 給 LINE 筆記本貼 */}
          <Button size="sm" variant="outline" onClick={() => setDumpOpen(true)} title="dump 一週場次成可貼 LINE 的文字">
            <FileText className="mr-1.5 h-4 w-4" />
            Dump 一週
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            新增場次
          </Button>
        </div>

        {/* main: 1fr 列表 / 460px 表單 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 460px", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* LEFT — 列表（獨立 scroll） */}
          <div style={{ overflowY: "auto", padding: "1rem", minWidth: 0 }}>
            <div className="space-y-4">

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
            { k: "all" as const, label: "全部" },
            { k: "upcoming" as const, label: "未到期（全部未來）" },
            { k: "week" as const, label: "未來 7 天" },
            { k: "month" as const, label: "未來 30 天" },
            { k: "past" as const, label: "過期" },
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
                    <th className="px-3 py-2 font-medium"><SortHeader k="date">日期 / 時段</SortHeader></th>
                    <th className="px-3 py-2 font-medium">地點</th>
                    <th className="px-3 py-2 font-medium">
                      教練
                      <span className="block font-normal text-[10px] text-[var(--muted-foreground)]"><SortHeader k="booked">已報名/可接受</SortHeader></span>
                    </th>
                    <th className="px-3 py-2 font-medium text-right"><SortHeader k="revenue" align="right">預估收費</SortHeader></th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTrips.map((trip, i) => {
                    const [effStatus, isAuto] = effectiveTripStatus(trip);
                    const isExpanded = expandedTripId === trip.id;
                    const tripBks = tripBookings[trip.id];
                    return (
                      <React.Fragment key={trip.id}>
                      <tr
                        onClick={() => openEdit(trip)}
                        className={cn(
                          "border-t cursor-pointer transition-colors hover:bg-sky-50",
                          trip.status === "cancelled" && "opacity-50",
                          editingId === trip.id && "ring-2 ring-cyan-400 ring-inset",
                        )}
                        style={{
                          borderColor: "var(--border)",
                          background: editingId === trip.id
                            ? "rgba(14,158,145,0.08)"
                            : trip.isNightDive
                              ? i % 2 === 0 ? "#d4e4f7" : "#c8daf2"
                              : i % 2 === 0 ? "#ffffff" : "rgba(var(--muted-rgb,240,242,245),0.5)",
                        }}
                      >
                        {/* 狀態 + 展開鈕 */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); toggleExpand(trip.id); }}
                              className="rounded p-0.5 hover:bg-slate-200 text-slate-500"
                              title={isExpanded ? "收起訂單" : "查看訂單"}
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <div className="flex flex-col items-start gap-0.5">
                              <Badge variant={statusVariant(effStatus)} className="text-[10px]">
                                {TRIP_STATUS_LABEL[effStatus] ?? effStatus}
                              </Badge>
                              {isAuto && (
                                <span className="text-[9px] text-[var(--muted-foreground)]" title="日期已過，自動視為結束">
                                  自動
                                </span>
                              )}
                            </div>
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
                        {/* 日期 + 時段（合併欄） */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="tabular-nums font-medium">
                            {trip.date.slice(0, 10)}
                            <span className="ml-1 text-[10px] font-normal text-[var(--muted-foreground)]">
                              ({weekdayLabel(trip.date)})
                            </span>
                          </div>
                          <div className="flex items-center gap-1 tabular-nums text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            {trip.isNightDive ? (
                              <Moon className="h-3 w-3 shrink-0" style={{ color: "#6b9fd4" }} />
                            ) : (
                              <Sun className="h-3 w-3 shrink-0" style={{ color: "#e8a020" }} />
                            )}
                            <span className="font-semibold text-[var(--foreground)]">{trip.startTime}</span>
                            {trip.isScooter && (
                              <Anchor className="h-3 w-3 text-[var(--color-phosphor)]" />
                            )}
                          </div>
                        </td>
                        {/* 地點 + 氣瓶數（兩行；含總量）*/}
                        <td className="px-3 py-1.5 text-xs">
                          <div className="font-medium text-[var(--foreground)]">
                            <span className={`mr-1 rounded px-1 py-0.5 text-[9px] font-semibold ${trip.isBoat ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                              {trip.isBoat ? "🚤船潛" : "🏖岸潛"}
                            </span>
                            {trip.diveSiteIds.length > 0
                              ? trip.diveSiteIds.map(siteName).join("・")
                              : "—"}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                            {trip.tankCount} 支/人
                            {(trip.booked ?? 0) > 0 && (
                              <span className="ml-1 font-semibold" style={{ color: "#0891b2" }}>
                                · 需 {trip.bookedTanks ?? (trip.booked ?? 0) * (trip.tankCount ?? 0)} 支
                              </span>
                            )}
                          </div>
                        </td>
                        {/* 教練 + 已報名/可接受 合併欄 */}
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                          <div className="font-medium text-[var(--foreground)]">
                            {trip.coachIds.length > 0
                              ? trip.coachIds.map(coachName).join("、")
                              : <span className="text-amber-600">⚠ 尚未指派</span>}
                          </div>
                          <div className="tabular-nums text-[11px] text-[var(--muted-foreground)] mt-0.5">
                            已報 <b style={{ color: (trip.capacity != null && (trip.booked ?? 0) >= trip.capacity) ? "#dc2626" : (trip.booked ?? 0) === 0 ? "#d97706" : "var(--foreground)" }}>{trip.booked ?? 0}</b>
                            <span> / {trip.capacity == null ? "∞" : trip.capacity}</span>
                          </div>
                        </td>
                        {/* 預估收費 */}
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {(trip.booked ?? 0) === 0 || !estimatedRevenue(trip)
                            ? <span className="text-[var(--muted-foreground)]">—</span>
                            : (estimatedRevenue(trip)).toLocaleString()}
                        </td>
                        {/* 操作 — 縮小成 28px icon-only 按鈕 */}
                        <td className="px-3 py-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
                      {/* v183: 展開訂單明細 */}
                      {isExpanded && (
                        <tr style={{ background: "#eaf3ff", borderTop: "1px solid #c0d8f0" }}>
                          <td colSpan={7} className="p-0">
                            {tripBks === "loading" ? (
                              <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">載入訂單中...</div>
                            ) : tripBks === "error" ? (
                              <div className="py-4 text-center text-xs text-rose-600">訂單載入失敗</div>
                            ) : !tripBks || tripBks.length === 0 ? (
                              <div className="py-4 text-center text-xs text-[var(--muted-foreground)]">此場次目前沒有訂單</div>
                            ) : (() => {
                              // v224：明確區分活躍 vs 取消/退款（與 trip.revenue 一致）
                              const isCancelled = (s: string) => s === "cancelled_by_user" || s === "cancelled_by_weather" || s === "no_show";
                              const isRefunding = (p: string) => p === "refunding" || p === "refunded";
                              const active = tripBks.filter((b) => !isCancelled(b.status) && !isRefunding(b.paymentStatus));
                              const cancelled = tripBks.filter((b) => isCancelled(b.status) || isRefunding(b.paymentStatus));
                              const activeParticipants = active.reduce((s, b) => s + b.participants, 0);
                              // v708：總氣瓶數 = 各訂單實際潛次×人數的加總（非「人數×場次預設」）
                              const activeTanks = active.reduce((s, b) => s + b.participants * (b.tankCount ?? trip.tankCount ?? 0), 0);
                              const activeRevenue = active.reduce((s, b) => s + b.totalAmount, 0);
                              const activePaid = active.reduce((s, b) => s + b.paidAmount, 0);
                              return (
                              <div className="overflow-x-auto px-3 py-2">
                                {/* summary */}
                                <div className="mb-2 flex flex-wrap items-center gap-3 rounded-md bg-white/70 px-2.5 py-1.5 text-[11px]">
                                  <span><b style={{ color: "#1a4a70" }}>{active.length}</b> 筆有效訂單 ・ <b className="text-emerald-700">{activeParticipants}</b> 人 ・ <b className="text-emerald-700">{activeTanks}</b> 支氣瓶</span>
                                  <span className="text-slate-500">應收 <b className="text-slate-700 tabular-nums">{activeRevenue.toLocaleString()}</b> · 實收 <b className="text-slate-700 tabular-nums">{activePaid.toLocaleString()}</b></span>
                                  {cancelled.length > 0 && (
                                    <span className="text-rose-600">已取消 <b>{cancelled.length}</b> 筆（不計入）</span>
                                  )}
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left" style={{ color: "#2a5580" }}>
                                      <th className="px-2 py-1.5 font-semibold">訂單編號</th>
                                      <th className="px-2 py-1.5 font-semibold">姓名</th>
                                      <th className="px-2 py-1.5 font-semibold">電話</th>
                                      <th className="px-2 py-1.5 font-semibold text-right">人數</th>
                                      <th className="px-2 py-1.5 font-semibold text-right">氣瓶</th>
                                      <th className="px-2 py-1.5 font-semibold text-right">已付/總額</th>
                                      <th className="px-2 py-1.5 font-semibold">付款</th>
                                      <th className="px-2 py-1.5 font-semibold">方式</th>
                                      <th className="px-2 py-1.5 font-semibold">訂單狀態</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tripBks.map((b, j) => {
                                      const cancelledRow = isCancelled(b.status) || isRefunding(b.paymentStatus);
                                      return (
                                      <tr
                                        key={b.id}
                                        className={cancelledRow ? "opacity-50" : ""}
                                        style={{
                                          background: cancelledRow
                                            ? "rgba(248,113,113,0.06)"
                                            : j % 2 === 0 ? "transparent" : "rgba(255,255,255,0.4)",
                                          borderTop: "1px solid rgba(192,216,240,0.5)",
                                          textDecoration: cancelledRow ? "line-through" : "none",
                                        }}
                                      >
                                        <td className="px-2 py-1 whitespace-nowrap">
                                          {b.code ? (
                                            <span className="inline-block rounded bg-teal-50 px-1 py-0.5 font-mono text-[10px] text-teal-800">{b.code}</span>
                                          ) : "—"}
                                        </td>
                                        <td className="px-2 py-1 font-semibold whitespace-nowrap" style={{ color: "#1a4a70" }}>{b.userName}</td>
                                        <td className="px-2 py-1 tabular-nums whitespace-nowrap text-[var(--muted-foreground)]">{b.phone ?? "—"}</td>
                                        <td className="px-2 py-1 text-right tabular-nums font-medium whitespace-nowrap">×{b.participants}</td>
                                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-[var(--muted-foreground)]">
                                          {/* v708：用訂單實際潛次（每人）×人數；舊單 fallback 場次預設 */}
                                          {(() => { const per = b.tankCount ?? trip.tankCount; return per != null ? `${b.participants * per} 支` : "—"; })()}
                                        </td>
                                        <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-[var(--muted-foreground)]">
                                          {b.paidAmount.toLocaleString()}/{b.totalAmount.toLocaleString()}
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap" style={{ textDecoration: "none" }}>
                                          <Badge variant="muted" className="text-[9px]">
                                            {PAY_STATUS_LABEL[b.paymentStatus] ?? b.paymentStatus}
                                          </Badge>
                                        </td>
                                        <td className="px-2 py-1 text-[var(--muted-foreground)] text-[10px] whitespace-nowrap">
                                          {b.paymentMethod === "cash" ? "現場" : b.paymentMethod === "bank" ? "轉帳" : b.paymentMethod === "linepay" ? "LINE Pay" : b.paymentMethod === "other" ? "其他" : "—"}
                                        </td>
                                        <td className="px-2 py-1 whitespace-nowrap" style={{ textDecoration: "none" }}>
                                          <Badge variant={cancelledRow ? "coral" : "muted"} className="text-[9px]">
                                            {BOOK_STATUS_LABEL[b.status] ?? b.status}
                                          </Badge>
                                        </td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                  {pagedTrips.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
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
          </div>
          {/* /LEFT */}

          {/* RIGHT — 新增 / 編輯 panel（獨立 scroll） */}
          <div style={{
            background: "#fff",
            borderLeft: "1px solid #E4E8ED",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}>
            {/* panel header */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid #E4E8ED",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexShrink: 0, background: "#fff",
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <span>
                  {form.isNightDive ? "🌙" : "☀️"}{" "}
                  {dialogMode === "edit" ? "編輯日潛水場次" : "新增日潛水場次"}
                </span>
                {dialogMode === "edit" && editingId && (() => {
                  const t = trips.find((x) => x.id === editingId);
                  return t?.code ? (
                    <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-normal text-teal-800">
                      {t.code}
                    </span>
                  ) : null;
                })()}
              </h2>
              <span style={{ fontSize: 12, color: "#0E9E91", fontFamily: "monospace", letterSpacing: ".14em" }}>
                {dialogMode === "edit" ? "EDIT" : "NEW"}
              </span>
            </div>
            {/* /panel header */}
            <div className="space-y-3" style={{ padding: "16px 24px", overflowY: "auto", flex: 1, minHeight: 0 }}>
            {/* Row 1: 日期 + 集合時間 + 場次狀態 (三欄並排) */}
            {/* v226：日期拿到大空間（5/12），集合時間縮窄（4/12），狀態 3/12 */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-5">
                <Label className="mb-1 block text-xs">日期</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    // v181：選到過去日期時，若狀態還是「開放」自動切為「結束」
                    // 避免 API 擋下「trip_date_passed」錯誤
                    const isPast = newDate < taipeiToday();
                    const newStatus =
                      isPast && form.status === "open" ? "completed" : form.status;
                    setForm({ ...form, date: newDate, status: newStatus });
                  }}
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
              <div className="col-span-3">
                <Label className="mb-1 block text-xs">狀態</Label>
                {(() => {
                  const isFormDatePast = form.date < taipeiToday();
                  return (
                    <>
                      <select
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-1 py-1.5 text-xs"
                      >
                        <option value="open" disabled={isFormDatePast}>🟢 開放</option>
                        <option value="cancelled">🚫 取消</option>
                        <option value="completed">✓ 結束</option>
                      </select>
                      {isFormDatePast && form.status === "open" && (
                        <p className="mt-0.5 text-[9px] text-amber-600">
                          日期已過，請改取消或結束
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

            {/* v714：岸潛 / 船潛 */}
            <div>
              <Label className="mb-1 block text-xs">潛水方式</Label>
              <div className="flex gap-2">
                {([["岸潛", false], ["船潛", true]] as const).map(([label, boat]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setForm({ ...form, isBoat: boat })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-sm ${form.isBoat === boat ? "border-[var(--color-ocean-deep)] bg-[var(--color-ocean-deep)] text-white" : "border-[var(--border)]"}`}
                  >
                    {boat ? "🚤 " : "🏖 "}{label}
                  </button>
                ))}
              </div>
              {form.isBoat && (
                <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                  船潛為「每人套裝價」（下方費用填套裝價，含 {form.tankCount} 潛）；計價不乘支數，活動減免仍 ×氣瓶數。
                </p>
              )}
            </div>

            {/* 費用設定 — 氣瓶費 + 其他費用 同一行 */}
            <div>
              <Label className="mb-1.5 block text-xs">費用設定 (NT$)</Label>
              <div className="flex items-end gap-2">
                {/* 氣瓶費 */}
                <div className="w-28 shrink-0">
                  <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                    {form.isBoat ? `套裝價（每人·含${form.tankCount}潛）` : "氣瓶費（每瓶）"}
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

            {/* v782：原「日潛水備註(內部)」已合併進「活動提醒事項」，只留一個客戶可見欄位 */}
            <div>
              <Label className="mb-1 block text-xs">📣 活動提醒事項<span className="ml-1 text-[10px]" style={{ color: "#0a7d4f" }}>客戶可見・這場全員都看得到（天氣／裝備／注意事項）</span></Label>
              <textarea
                className="w-full rounded-md border px-2 py-1.5 text-sm"
                style={{ borderColor: "#bfe9d4", background: "#f0fbf6" }}
                rows={3}
                value={form.activityNote}
                onChange={(e) => setForm({ ...form, activityNote: e.target.value })}
                placeholder="例：本場水溫偏低，建議厚防寒衣；天氣/裝備/注意事項；集合後先做裝備檢查"
              />
            </div>
            </div>
            {/* sticky 底部操作列 */}
            <div style={{
              borderTop: "1px solid #E4E8ED", background: "#fff",
              padding: "14px 24px", display: "flex", gap: 10, flexShrink: 0,
            }}>
              <Button variant="outline" onClick={openCreate} style={{ flex: "0 0 auto" }}>
                {dialogMode === "edit" ? "取消編輯" : "清空"}
              </Button>
              <Button onClick={saveForm} disabled={saving} style={{ flex: 1 }}>
                {saving ? "儲存中..." : (dialogMode === "edit" ? "儲存變更" : "新增場次")}
              </Button>
            </div>
          </div>
          {/* /RIGHT */}
        </div>
        {/* /grid */}
      </div>
      {/* /outer */}

      {/* v242：取消場次原因 modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !cancelBusy && setCancelTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-amber-600">
              <Ban className="h-5 w-5" />
              <h3 className="text-base font-bold">取消場次</h3>
            </div>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              {cancelTarget.date.slice(0, 10)} {cancelTarget.startTime}
              {(cancelTarget.booked ?? 0) > 0 && (
                <span className="ml-1 text-rose-600">
                  ・已有 {cancelTarget.booked} 筆報名
                </span>
              )}
            </p>

            <div className="mt-4">
              <Label className="mb-1.5 block text-xs text-[var(--muted-foreground)]">
                常用原因（點選自動填入，可再修改）
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {CANCEL_REASON_PRESETS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCancelReason(r)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      cancelReason === r
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-[var(--border)] text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">
                取消原因（必填，會記錄於操作紀錄）
              </Label>
              <textarea
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
                rows={3}
                placeholder="點上方常用原因，或自行輸入..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                autoFocus
              />
            </div>

            {/* v617：天氣取消開關 — 由老闆/教練決定是否通知客戶並退款 */}
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5">
              <input
                type="checkbox"
                checked={cancelNotify}
                onChange={(e) => setCancelNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-sky-600"
              />
              <span className="text-[12px] leading-snug text-sky-900">
                <b>🌊 天氣取消：通知客戶並退款</b>
                <span className="block text-[11px] text-sky-700">
                  取消此場次所有訂單 → 發「天氣取消通知」(LINE/Email/站內) → 自動退還客戶折抵的抵用金。
                  {(cancelTarget.booked ?? 0) === 0 && "（本場次目前無報名）"}
                </span>
              </span>
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelTarget(null)}
                disabled={cancelBusy}
              >
                返回
              </Button>
              <Button
                size="sm"
                style={{ background: cancelNotify ? "#0284c7" : "#d97706", color: "#fff" }}
                onClick={confirmCancelTrip}
                disabled={cancelBusy || !cancelReason.trim()}
              >
                {cancelBusy ? "處理中..." : cancelNotify ? "天氣取消並通知客戶" : "確認取消場次"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* v336：Dump 一週場次 dialog */}
      <Dialog open={dumpOpen} onOpenChange={(o) => setDumpOpen(o)}>
        <DialogContent className="max-w-[min(95vw,560px)]">
          <DialogHeader>
            <DialogTitle>📋 Dump 一週場次（給 LINE 筆記本）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[80px_1fr] items-center gap-2">
              <Label className="text-xs">起始日期</Label>
              <div className="flex items-center gap-2">
                {/* v560：自製日曆(保證星期一為開始,不靠瀏覽器 native picker) */}
                <div className="flex-1">
                  <MondayDatePicker value={dumpStartDate} onChange={setDumpStartDate} />
                </div>
                <Label className="text-xs whitespace-nowrap">天數</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dumpDays}
                  onChange={(e) => setDumpDays(Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 7)))}
                  className="w-16"
                />
              </div>
            </div>
            <div className="text-[11px] text-[var(--muted-foreground)] pl-[80px]">
              範圍：起始日起算 {dumpDays} 天（含當日，預設下週一×7天）；潛旅依「起始日」落在此區間自動納入
            </div>
            {activePromos.length > 0 && (
              <div>
                <Label className="text-xs mb-1 block">🎏 加入優惠代碼</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs"
                  value=""
                  onChange={(e) => {
                    const p = activePromos.find((x) => x.code === e.target.value);
                    if (p) setDumpText((t) => `${t.replace(/\s*$/, "")}\n──────────\n🎏 ${p.title}：${p.label}，優惠碼 ${p.code}（至 ${p.endAt.slice(5, 10)} 止）\n`);
                  }}
                >
                  <option value="">選擇生效中的優惠檔 → 自動加進下方文字…</option>
                  {activePromos.map((p) => (
                    <option key={p.code} value={p.code}>{p.title}・{p.label}・{p.code}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label className="text-xs mb-1 block">預覽（可直接編輯）</Label>
              <textarea
                id="dump-textarea"
                value={dumpText}
                onChange={(e) => setDumpText(e.target.value)}
                rows={Math.max(8, dumpText.split("\n").length + 1)}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-mono whitespace-pre"
                spellCheck={false}
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {dumpCopied ? "✓ 已複製到剪貼簿" : "點下方按鈕複製、或直接拖選文字"}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDumpOpen(false)}>關閉</Button>
                <Button size="sm" onClick={copyDumpText} className={dumpCopied ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
                  {dumpCopied ? <><Check className="mr-1.5 h-3.5 w-3.5" />已複製</> : <><Copy className="mr-1.5 h-3.5 w-3.5" />一鍵複製</>}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

// v560：自製日曆 —— 保證「星期一為一週開始」(native input 的週起始無法可靠控制)。
//   value/onChange 用 yyyy-mm-dd 字串,與原本相容。
const CAL_WD = ["一", "二", "三", "四", "五", "六", "日"];
function MondayDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [vy, setVy] = useState(base.getFullYear());
  const [vm, setVm] = useState(base.getMonth());

  const now = new Date();
  const today = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7; // 週一=0
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysIn; d++) cells.push(d);
  const prevM = () => { if (vm === 0) { setVy(vy - 1); setVm(11); } else { setVm(vm - 1); } };
  const nextM = () => { if (vm === 11) { setVy(vy + 1); setVm(0); } else { setVm(vm + 1); } };
  const selWd = value ? (new Date(`${value}T00:00:00`).getDay() + 6) % 7 : -1;

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", textAlign: "left", padding: "8px 12px", border: "1px solid #cdd9de", borderRadius: 8, background: "#fff", fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>{value || "選擇日期"}{selWd >= 0 ? `（週${CAL_WD[selWd]}）` : ""}</span>
        <span aria-hidden style={{ opacity: 0.55 }}>📅</span>
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, background: "#fff", border: "1px solid #d3dde2", borderRadius: 10, boxShadow: "0 8px 28px rgba(8,34,47,.2)", padding: 10, width: 252 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={prevM} style={calNavBtn}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0a2342" }}>{vy} 年 {vm + 1} 月</span>
            <button type="button" onClick={nextM} style={calNavBtn}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
            {CAL_WD.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: i >= 5 ? "#c0432a" : "#7c8a96" }}>{w}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d == null) return <div key={`b${i}`} />;
              const ds = ymd(vy, vm, d);
              const isSel = ds === value;
              const isToday = ds === today;
              const weekend = i % 7 >= 5;
              return (
                <button key={ds} type="button" onClick={() => { onChange(ds); setOpen(false); }}
                  style={{ height: 28, borderRadius: 7, border: isToday && !isSel ? "1px solid #00b3a4" : "1px solid transparent", background: isSel ? "#0e7c8a" : "transparent", color: isSel ? "#fff" : weekend ? "#c0432a" : "#1a2330", fontSize: 12.5, fontWeight: isSel ? 700 : 500, cursor: "pointer" }}>
                  {d}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button type="button" onClick={() => { onChange(today); setOpen(false); }} style={calLinkBtn}>今天</button>
            <button type="button" onClick={() => setOpen(false)} style={calLinkBtn}>關閉</button>
          </div>
        </div>
      )}
    </div>
  );
}
const calNavBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, border: "1px solid #d3dde2", background: "#fff", cursor: "pointer", fontSize: 15, lineHeight: 1, color: "#0a2342" };
const calLinkBtn: React.CSSProperties = { fontSize: 11.5, color: "#0e7c8a", background: "none", border: "none", cursor: "pointer", fontWeight: 600 };
