"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Trash2, Ban, X, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { weekdayTW } from "@/lib/utils";
import ExcelJS from "exceljs";

// v186 後台「行程資料庫」配色（對應 mockup）
const AQUA = "#0E9E91";
const AQUA_DIM = "#0a6f64";
const CORAL = "#F2603C";
const BG = "#EEF1F5";
const LINE = "#E4E8ED";
const LINE2 = "#D2D9E0";
const MUTED = "#6B7682";
const MUTED2 = "#9AA6B2";
const thStyle: React.CSSProperties = {
  position: "sticky", top: 0, background: "#EEF1F5", textAlign: "left",
  fontSize: 11, letterSpacing: ".06em", color: "#9AA6B2", textTransform: "uppercase",
  padding: "8px 8px", fontWeight: 700,
};

type Dest = "northeast" | "green_island" | "lanyu" | "kenting" | "other";
const DEST_LABELS: Record<Dest, string> = {
  northeast: "東北角",
  green_island: "綠島",
  lanyu: "蘭嶼",
  kenting: "墾丁",
  other: "其他",
};
const DEST_FROM_LABEL: Record<string, Dest> = {
  "東北角": "northeast",
  "綠島": "green_island",
  "蘭嶼": "lanyu",
  "墾丁": "kenting",
  "其他": "other",
};
const ALL_STYLES = ["水推", "岸潛", "船潛", "夜潛", "沉船潛水"];

interface ItineraryDay {
  t: string;
  c: string;
}

interface Tour {
  id: string;
  code?: string | null;
  title: string;
  subtitle?: string | null;
  destination: Dest;
  dateStart: string;
  dateEnd: string;
  durationLabel?: string | null;
  roomLabel?: string | null;
  basePrice: number;
  deposit: number;
  capacity: number | null;
  depositDeadline: string | null;
  finalDeadline: string | null;
  depositReminderDays: number;
  finalReminderDays: number;
  guideReminderDays: number;
  diveStyles?: string[];
  beginnerFriendly?: boolean;
  tanksCount?: number | null;
  siteList?: string | null;
  pricingNotes?: string | null;
  extraNote?: string | null;
  itinerary?: ItineraryDay[];
  diveSiteIds?: string[];
  includes?: string[];
  excludes?: string[];
  status: string;
  _count?: { bookings: number };
  booked?: number;        // v194：累計報名人數
  totalRevenue?: number;  // v194：累計應收金額（含未付）
  totalPaid?: number;     // v194：累計實收金額
}

const today = new Date().toISOString().split("T")[0];

interface FormState {
  title: string;
  subtitle: string;
  destination: Dest;
  dateStart: string;
  dateEnd: string;
  durationLabel: string;
  roomLabel: string;
  basePrice: number;
  deposit: number;
  capacity: number;
  depositDeadline: string;
  finalDeadline: string;
  depositReminderDays: number;
  finalReminderDays: number;
  guideReminderDays: number;
  diveStyles: string[];
  beginnerFriendly: boolean;
  tanksCount: number;
  siteList: string;
  pricingNotes: string;
  extraNote: string;
  includes: string;
  excludes: string;
  itinerary: ItineraryDay[];
}

const BLANK: FormState = {
  title: "", subtitle: "", destination: "northeast",
  dateStart: today, dateEnd: today,
  durationLabel: "", roomLabel: "",
  basePrice: 15000, deposit: 5000, capacity: 10,
  depositDeadline: "", finalDeadline: "",
  depositReminderDays: 7, finalReminderDays: 30, guideReminderDays: 2,
  diveStyles: [], beginnerFriendly: false, tanksCount: 0,
  siteList: "", pricingNotes: "", extraNote: "",
  includes: "", excludes: "",
  itinerary: [],
};

export default function ToursPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "cancelled">("all");
  const [destFilter, setDestFilter] = useState<"all" | "taiwan" | "overseas">("all");
  const [keyword, setKeyword] = useState("");
  // v194：日期排序
  const [dateSort, setDateSort] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);

  // v193：展開查看該團報名客戶
  const [expandedTourId, setExpandedTourId] = useState<string | null>(null);
  interface TourBookingRow {
    id: string;
    code: string | null;
    userName: string;
    phone: string | null;
    participants: number;
    totalAmount: number;
    paidAmount: number;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
  }
  const [tourBookings, setTourBookings] = useState<Record<string, TourBookingRow[] | "loading" | "error">>({});

  async function toggleExpand(tourId: string) {
    if (expandedTourId === tourId) {
      setExpandedTourId(null);
      return;
    }
    setExpandedTourId(tourId);
    if (tourBookings[tourId] && tourBookings[tourId] !== "error") return;
    setTourBookings((m) => ({ ...m, [tourId]: "loading" }));
    try {
      interface BkResp {
        bookings: Array<{
          id: string;
          code?: string | null;
          participants: number;
          totalAmount: number;
          paidAmount: number;
          status: string;
          paymentStatus: string;
          paymentMethod?: string | null;
          user: { displayName: string; realName: string | null; phone: string | null };
        }>;
      }
      const r = await adminFetch<BkResp>(`/api/admin/bookings?refId=${tourId}`);
      const rows: TourBookingRow[] = r.bookings.map((b) => ({
        id: b.id,
        code: b.code ?? null,
        userName: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        participants: b.participants,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        status: b.status,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod ?? "",
      }));
      setTourBookings((m) => ({ ...m, [tourId]: rows }));
    } catch {
      setTourBookings((m) => ({ ...m, [tourId]: "error" }));
    }
  }
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  function showToast(msg: string, isErr = false) {
    setToast({ msg, err: isErr });
    setTimeout(() => setToast(null), 2600);
  }

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<{ tours: Tour[] }>("/api/admin/tours");
      setTours(data.tours);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function newTrip() {
    setForm(BLANK);
    setEditingId(null);
  }

  function loadTour(t: Tour) {
    setForm({
      title: t.title,
      subtitle: t.subtitle ?? "",
      destination: t.destination,
      dateStart: t.dateStart.split("T")[0],
      dateEnd: t.dateEnd.split("T")[0],
      durationLabel: t.durationLabel ?? "",
      roomLabel: t.roomLabel ?? "",
      basePrice: t.basePrice,
      deposit: t.deposit,
      capacity: t.capacity ?? 10,
      depositDeadline: t.depositDeadline ? t.depositDeadline.split("T")[0] : "",
      finalDeadline: t.finalDeadline ? t.finalDeadline.split("T")[0] : "",
      depositReminderDays: t.depositReminderDays,
      finalReminderDays: t.finalReminderDays,
      guideReminderDays: t.guideReminderDays,
      diveStyles: t.diveStyles ?? [],
      beginnerFriendly: t.beginnerFriendly ?? false,
      tanksCount: t.tanksCount ?? 0,
      siteList: t.siteList ?? (t.diveSiteIds ?? []).join("\n"),
      pricingNotes: t.pricingNotes ?? "",
      extraNote: t.extraNote ?? "",
      includes: (t.includes ?? []).join("\n"),
      excludes: (t.excludes ?? []).join("\n"),
      itinerary: t.itinerary ?? [],
    });
    setEditingId(t.id);
    if (typeof document !== "undefined") {
      document.querySelector(".form-col")?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function save() {
    if (!form.title.trim()) return showToast("請填寫行程名稱", true);
    if (!form.basePrice) return showToast("請填寫團費", true);
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        destination: form.destination,
        dateStart: form.dateStart,
        dateEnd: form.dateEnd,
        durationLabel: form.durationLabel.trim() || null,
        roomLabel: form.roomLabel.trim() || null,
        basePrice: form.basePrice,
        deposit: form.deposit,
        capacity: form.capacity === 0 ? null : form.capacity,
        depositDeadline: form.depositDeadline || null,
        finalDeadline: form.finalDeadline || null,
        depositReminderDays: form.depositReminderDays,
        finalReminderDays: form.finalReminderDays,
        guideReminderDays: form.guideReminderDays,
        diveStyles: form.diveStyles,
        beginnerFriendly: form.beginnerFriendly,
        tanksCount: form.tanksCount || null,
        siteList: form.siteList || null,
        diveSiteIds: form.siteList.split("\n").map((s) => s.trim()).filter(Boolean),
        pricingNotes: form.pricingNotes || null,
        extraNote: form.extraNote || null,
        includes: form.includes.split("\n").map((s) => s.trim()).filter(Boolean),
        excludes: form.excludes.split("\n").map((s) => s.trim()).filter(Boolean),
        itinerary: form.itinerary.filter((d) => d.t || d.c),
      };
      if (editingId) {
        await adminFetch(`/api/admin/tours/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        showToast(`已更新「${form.title}」`);
      } else {
        await adminFetch("/api/admin/tours", { method: "POST", body: JSON.stringify(body) });
        showToast(`已新增「${form.title}」`);
        newTrip();
      }
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "儲存失敗", true);
    } finally {
      setSaving(false);
    }
  }

  function addDay() {
    setForm((f) => ({ ...f, itinerary: [...f.itinerary, { t: `Day ${f.itinerary.length + 1}`, c: "" }] }));
  }
  function removeDay(idx: number) {
    setForm((f) => ({ ...f, itinerary: f.itinerary.filter((_, i) => i !== idx) }));
  }
  function updateDay(idx: number, key: "t" | "c", val: string) {
    setForm((f) => ({
      ...f,
      itinerary: f.itinerary.map((d, i) => (i === idx ? { ...d, [key]: val } : d)),
    }));
  }
  function toggleStyle(s: string) {
    setForm((f) => ({
      ...f,
      diveStyles: f.diveStyles.includes(s)
        ? f.diveStyles.filter((x) => x !== s)
        : [...f.diveStyles, s],
    }));
  }

  async function cancelTour(t: Tour) {
    if (!confirm(`取消「${t.title}」？`)) return;
    try {
      await adminFetch(`/api/admin/tours/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      await load();
      showToast("已取消潛水團");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "操作失敗", true);
    }
  }

  async function deleteTour(t: Tour) {
    if (!confirm(`永久刪除「${t.title}」？此操作不可復原`)) return;
    if (prompt('輸入 "DELETE" 確認') !== "DELETE") return;
    try {
      await adminFetch(`/api/admin/tours/${t.id}?permanent=true`, { method: "DELETE" });
      if (editingId === t.id) newTrip();
      await load();
      showToast("已刪除");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "刪除失敗", true);
    }
  }

  async function dupTour(t: Tour) {
    if (!confirm(`複製「${t.title}」一份？`)) return;
    try {
      const body = {
        title: t.title,
        subtitle: (t.subtitle ?? "") + "（複製）",
        destination: t.destination,
        dateStart: t.dateStart.split("T")[0],
        dateEnd: t.dateEnd.split("T")[0],
        durationLabel: t.durationLabel ?? null,
        roomLabel: t.roomLabel ?? null,
        basePrice: t.basePrice,
        deposit: t.deposit,
        capacity: t.capacity,
        depositDeadline: t.depositDeadline ? t.depositDeadline.split("T")[0] : null,
        finalDeadline: t.finalDeadline ? t.finalDeadline.split("T")[0] : null,
        depositReminderDays: t.depositReminderDays,
        finalReminderDays: t.finalReminderDays,
        guideReminderDays: t.guideReminderDays,
        diveStyles: t.diveStyles ?? [],
        beginnerFriendly: t.beginnerFriendly ?? false,
        tanksCount: t.tanksCount,
        siteList: t.siteList ?? null,
        diveSiteIds: t.diveSiteIds ?? [],
        pricingNotes: t.pricingNotes ?? null,
        extraNote: t.extraNote ?? null,
        includes: t.includes ?? [],
        excludes: t.excludes ?? [],
        itinerary: t.itinerary ?? [],
      };
      await adminFetch("/api/admin/tours", { method: "POST", body: JSON.stringify(body) });
      await load();
      showToast("已複製行程");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "複製失敗", true);
    }
  }

  // ─── Excel ───────────────────────────────────────────
  async function downloadTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("潛水團");
    ws.columns = [
      { header: "標題（必填）", key: "title", width: 28 },
      { header: "副標", key: "subtitle", width: 14 },
      { header: "目的地（東北角／綠島／蘭嶼／墾丁／其他）", key: "destination", width: 22 },
      { header: "出發日（YYYY-MM-DD）", key: "dateStart", width: 16 },
      { header: "結束日（YYYY-MM-DD）", key: "dateEnd", width: 16 },
      { header: "天數標籤（例 4天3夜）", key: "durationLabel", width: 18 },
      { header: "住宿", key: "roomLabel", width: 16 },
      { header: "潛水型態（逗號分隔：水推,岸潛,船潛,夜潛,沉船潛水）", key: "diveStyles", width: 30 },
      { header: "新手可參加（是/否）", key: "beginner", width: 14 },
      { header: "潛水支數", key: "tanksCount", width: 10 },
      { header: "團費", key: "basePrice", width: 12 },
      { header: "訂金", key: "deposit", width: 12 },
      { header: "人數上限（0=∞）", key: "capacity", width: 14 },
      { header: "潛點（逗號分隔）", key: "sites", width: 30 },
      { header: "包含項目（逗號分隔）", key: "includes", width: 30 },
      { header: "不含項目（逗號分隔）", key: "excludes", width: 30 },
      { header: "備註", key: "extraNote", width: 24 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9E91" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 32;
    ws.addRow({
      title: "綠島三天兩夜水推團", subtitle: "平日團", destination: "綠島",
      dateStart: "2026-07-18", dateEnd: "2026-07-20",
      durationLabel: "3天2夜", roomLabel: "四人房",
      diveStyles: "水推,岸潛", beginner: "是", tanksCount: 7,
      basePrice: 14500, deposit: 7000, capacity: 12,
      sites: "海馬郵筒,大香菇,十字架",
      includes: "氣瓶,四人房住宿,每日早餐", excludes: "",
      extraNote: "新手可參加",
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tours_template.xlsx";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function exportExcel() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("潛水團");
    ws.columns = [
      { header: "編號", key: "code", width: 14 },
      { header: "標題", key: "title", width: 24 },
      { header: "副標", key: "sub", width: 14 },
      { header: "目的地", key: "dest", width: 12 },
      { header: "出發日", key: "ds", width: 14 },
      { header: "結束日", key: "de", width: 14 },
      { header: "天數", key: "dur", width: 12 },
      { header: "型態", key: "styles", width: 18 },
      { header: "新手OK", key: "beg", width: 8 },
      { header: "支數", key: "tk", width: 8 },
      { header: "團費", key: "price", width: 12 },
      { header: "訂金", key: "dep", width: 12 },
      { header: "容量", key: "cap", width: 8 },
      { header: "已報", key: "bk", width: 8 },
      { header: "狀態", key: "st", width: 10 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E9E91" } };
    const ST: Record<string, string> = { open: "開放", full: "額滿", cancelled: "已取消", completed: "已完成" };
    for (const t of tours) {
      ws.addRow({
        code: t.code ?? "", title: t.title, sub: t.subtitle ?? "",
        dest: DEST_LABELS[t.destination], ds: t.dateStart.split("T")[0], de: t.dateEnd.split("T")[0],
        dur: t.durationLabel ?? "", styles: (t.diveStyles ?? []).join("/"),
        beg: t.beginnerFriendly ? "是" : "", tk: t.tanksCount ?? "",
        price: t.basePrice, dep: t.deposit, cap: t.capacity ?? 0,
        bk: t._count?.bookings ?? 0, st: ST[t.status] ?? t.status,
      });
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tours_export_${today.replace(/-/g, "")}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet("潛水團") ?? wb.worksheets[0];
      if (!ws) throw new Error("檔內無工作表");

      const cellText = (raw: unknown): string => {
        if (raw == null) return "";
        if (typeof raw === "string") return raw.trim();
        if (typeof raw === "number") return String(raw);
        if (raw instanceof Date) {
          const d = new Date(raw.getTime() + 8 * 60 * 60 * 1000);
          return d.toISOString().slice(0, 10);
        }
        if (typeof raw === "object" && "text" in raw) return String((raw as { text: string }).text).trim();
        return String(raw).trim();
      };
      const pInt = (s: string, d = 0) => {
        const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
        return Number.isNaN(n) ? d : n;
      };
      const rows: Array<Record<string, unknown>> = [];
      ws.eachRow((row, idx) => {
        if (idx === 1) return;
        const c = (n: number) => cellText(row.getCell(n).value);
        const title = c(1);
        if (!title) return;
        const dest = DEST_FROM_LABEL[c(3)];
        if (!dest) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c(4))) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(c(5))) return;
        rows.push({
          title, subtitle: c(2) || null, destination: dest,
          dateStart: c(4), dateEnd: c(5),
          durationLabel: c(6) || null, roomLabel: c(7) || null,
          diveStyles: c(8).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          beginnerFriendly: /^(是|true|yes|1|Y)$/i.test(c(9)),
          tanksCount: pInt(c(10), 0) || null,
          basePrice: pInt(c(11)), deposit: pInt(c(12)), capacity: pInt(c(13), 10),
          diveSiteIds: c(14).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          siteList: c(14).split(/[,，、]/).map((s) => s.trim()).filter(Boolean).join("\n"),
          includes: c(15).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          excludes: c(16).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          extraNote: c(17) || null,
        });
      });
      if (!rows.length) throw new Error("檔內無有效資料");
      const res = await adminFetch<{ ok: boolean; created: number }>(
        "/api/admin/tours/bulk-import",
        { method: "POST", body: JSON.stringify({ rows }) },
      );
      showToast(`已匯入 ${res.created ?? rows.length} 筆`);
      await load();
    } catch (er) {
      showToast(er instanceof Error ? er.message : "匯入失敗", true);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // 排序：未來 > 今日 > 過去
  const visible = useMemo(() => {
    const k = keyword.toLowerCase();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return tours
      .filter((t) => (filter === "all" ? true : t.status === filter))
      .filter((t) => {
        if (destFilter === "all") return true;
        if (destFilter === "overseas") return t.destination === "other";
        return t.destination !== "other";
      })
      .filter((t) => !k || (t.title + (t.subtitle ?? "")).toLowerCase().includes(k))
      .sort((a, b) => {
        const da = new Date(a.dateStart).getTime();
        const db = new Date(b.dateStart).getTime();
        // v194：純依使用者指定 asc/desc 排序（不再「未來優先過去後」）
        return dateSort === "asc" ? da - db : db - da;
      });
  }, [tours, filter, destFilter, keyword, dateSort]);

  return (
    <AdminShell title="潛水團管理">
      <div style={{ background: BG, height: "calc(100vh - 56px)", margin: "-1rem", padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* topbar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, padding: "16px 24px", borderBottom: `1px solid ${LINE}`,
          background: "#fff", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: AQUA, boxShadow: `0 0 14px ${AQUA}` }} />
            <h1 style={{ fontSize: 16, fontWeight: 900 }}>潛水旅行團</h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleUpload} style={{ display: "none" }} />
            <TopBtn onClick={downloadTemplate}>⬇ 範本</TopBtn>
            <TopBtn onClick={exportExcel} disabled={!tours.length}>⬇ 匯出 Excel</TopBtn>
            <TopBtn onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? "匯入中..." : "⬆ 匯入 Excel"}
            </TopBtn>
            <TopBtn primary onClick={newTrip}>＋ 新增行程</TopBtn>
          </div>
        </div>

        {err && (
          <div style={{ margin: "12px 24px", padding: 12, borderRadius: 8, background: "#FFE9E3", color: CORAL, fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 460px",
          gap: 0,
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
        }}>
          {/* LEFT: list */}
          <div style={{ borderRight: `1px solid ${LINE}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* toolbar */}
            <div style={{ display: "flex", gap: 8, padding: "12px 24px", flexWrap: "wrap" }}>
              <Seg value={destFilter} onChange={setDestFilter} options={[
                { v: "all", l: "全部" },
                { v: "taiwan", l: "台灣離島" },
                { v: "overseas", l: "海外潛旅" },
              ]} />
              <Seg value={filter} onChange={setFilter} options={[
                { v: "all", l: "全狀態" },
                { v: "open", l: "進行中" },
                { v: "cancelled", l: "已取消" },
              ]} />
              <div style={{ flex: 1, minWidth: 140 }}>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜尋行程名稱…"
                  style={{
                    width: "100%", background: "#fff", border: `1px solid ${LINE}`,
                    borderRadius: 8, padding: "7px 12px", fontSize: 13,
                  }}
                />
              </div>
            </div>

            {/* table */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 20px" }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: MUTED2, fontSize: 13 }}>載入中...</div>
              ) : visible.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: MUTED2, fontSize: 13 }}>無符合資料</div>
              ) : (
                <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}></th>
                      <th style={thStyle}>
                        <button type="button"
                          onClick={() => setDateSort((d) => (d === "asc" ? "desc" : "asc"))}
                          className="inline-flex items-center gap-0.5 font-bold hover:text-slate-700">
                          日期 / 支數
                          <span className="text-[10px] opacity-70">{dateSort === "asc" ? "▲" : "▼"}</span>
                        </button>
                      </th>
                      <th style={thStyle}>行程</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>已報/可接受</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>價格</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>累計費用</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => {
                      const isExpanded = expandedTourId === t.id;
                      const bks = tourBookings[t.id];
                      const ds = t.dateStart.split("T")[0];
                      const de = t.dateEnd.split("T")[0];
                      const sameDay = ds === de;
                      return (
                        <React.Fragment key={t.id}>
                          <tr
                            onClick={() => loadTour(t)}
                            className="border-b cursor-pointer hover:bg-slate-50 transition-colors"
                            style={{
                              borderColor: LINE,
                              background: t.id === editingId ? "rgba(14,158,145,.08)" : undefined,
                              boxShadow: t.id === editingId ? `inset 3px 0 0 ${AQUA}` : "none",
                              opacity: t.status === "cancelled" ? 0.5 : 1,
                            }}
                          >
                            {/* expand chevron */}
                            <td className="px-2 py-2 align-top" onClick={(e) => { e.stopPropagation(); toggleExpand(t.id); }}>
                              <button type="button"
                                className="rounded p-0.5 hover:bg-slate-200 text-slate-500"
                                title={isExpanded ? "收起客戶列表" : "查看報名客戶"}>
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              </button>
                            </td>
                            {/* 日期 / 支數 — leftmost */}
                            <td className="px-2 py-2 align-top whitespace-nowrap">
                              <div className="tabular-nums font-medium text-[13px]">
                                {ds} <span className="text-[10px] text-slate-500">({weekdayTW(ds)})</span>
                              </div>
                              {!sameDay && (
                                <div className="tabular-nums text-[12px] text-slate-600">
                                  ~ {de} <span className="text-[10px] text-slate-500">({weekdayTW(de)})</span>
                                </div>
                              )}
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {t.durationLabel ?? `${Math.round((+new Date(t.dateEnd) - +new Date(t.dateStart)) / 86400000) + 1}天`}
                                {t.tanksCount != null && t.tanksCount > 0 && ` · ${t.tanksCount}支`}
                              </div>
                            </td>
                            {/* 行程 */}
                            <td className="px-2 py-2 align-top">
                              <div className="font-bold text-[13.5px]">
                                {t.title}
                                {t.subtitle && <span className="text-slate-500 font-normal text-[12px] ml-1">{t.subtitle}</span>}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                <MiniBadge color={t.destination === "other" ? "ov" : "tw"}>
                                  {t.destination === "other" ? "海外" : "台灣"}
                                </MiniBadge>
                                {t.beginnerFriendly && (
                                  <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ background: "#FFF3DA", color: "#C98800" }}>
                                    新手OK
                                  </span>
                                )}
                                {t.code && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                                    style={{ background: "#F4F6F8", color: MUTED }}>
                                    {t.code}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* 已報 / 可接受 */}
                            <td className="px-2 py-2 align-top whitespace-nowrap text-right tabular-nums">
                              <div className="font-bold text-[13px]" style={{ color: AQUA }}>
                                {t.booked ?? 0}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                / {t.capacity ?? "∞"}
                              </div>
                            </td>
                            {/* 價格 */}
                            <td className="px-2 py-2 align-top whitespace-nowrap text-right">
                              <span className="font-mono text-[17px] font-bold tabular-nums"
                                style={{ color: t.destination === "other" ? CORAL : AQUA }}>
                                {t.basePrice.toLocaleString()}
                              </span>
                            </td>
                            {/* 累計費用（總應收 + 實收） */}
                            <td className="px-2 py-2 align-top whitespace-nowrap text-right">
                              <div className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: "#1B2733" }}>
                                NT$ {(t.totalRevenue ?? 0).toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-500 tabular-nums">
                                實收 {(t.totalPaid ?? 0).toLocaleString()}
                              </div>
                            </td>
                            {/* actions */}
                            <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: "flex", gap: 5 }}>
                                <Mini onClick={() => dupTour(t)} title="複製"><Copy size={12} /></Mini>
                                {t.status === "open" && (
                                  <Mini onClick={() => cancelTour(t)} title="取消" color="#D88E1E"><Ban size={12} /></Mini>
                                )}
                                <Mini onClick={() => deleteTour(t)} title="刪除" color={CORAL}><Trash2 size={12} /></Mini>
                              </div>
                            </td>
                          </tr>
                          {/* expanded — bookings */}
                          {isExpanded && (
                            <tr style={{ background: "#F8FAFC" }}>
                              <td colSpan={7} className="p-0">
                                <div className="p-3 border-t" style={{ borderColor: LINE }}>
                                  {bks === "loading" && <div className="text-xs text-slate-500 py-3 text-center">載入中...</div>}
                                  {bks === "error" && <div className="text-xs text-rose-600 py-3 text-center">載入失敗</div>}
                                  {Array.isArray(bks) && bks.length === 0 && (
                                    <div className="text-xs text-slate-500 py-3 text-center">尚無人報名</div>
                                  )}
                                  {Array.isArray(bks) && bks.length > 0 && (
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr style={{ background: "#E2E8F0" }}>
                                          <th className="px-2 py-1.5 font-semibold text-left">編號</th>
                                          <th className="px-2 py-1.5 font-semibold text-left">姓名</th>
                                          <th className="px-2 py-1.5 font-semibold text-left">電話</th>
                                          <th className="px-2 py-1.5 font-semibold text-right">人數</th>
                                          <th className="px-2 py-1.5 font-semibold text-right">已付/總額</th>
                                          <th className="px-2 py-1.5 font-semibold text-left">付款狀態</th>
                                          <th className="px-2 py-1.5 font-semibold text-left">訂單狀態</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {bks.map((b, j) => (
                                          <tr key={b.id} style={{ background: j % 2 === 0 ? "transparent" : "rgba(255,255,255,0.5)", borderTop: `1px solid ${LINE}` }}>
                                            <td className="px-2 py-1 whitespace-nowrap">
                                              {b.code ? (
                                                <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-teal-50 text-teal-800">{b.code}</span>
                                              ) : "—"}
                                            </td>
                                            <td className="px-2 py-1 font-semibold whitespace-nowrap">{b.userName}</td>
                                            <td className="px-2 py-1 tabular-nums whitespace-nowrap text-slate-500">{b.phone ?? "—"}</td>
                                            <td className="px-2 py-1 text-right tabular-nums">×{b.participants}</td>
                                            <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-slate-600">
                                              {b.paidAmount.toLocaleString()}/{b.totalAmount.toLocaleString()}
                                            </td>
                                            <td className="px-2 py-1 text-[10px]">{b.paymentStatus}</td>
                                            <td className="px-2 py-1 text-[10px]">{b.status}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* RIGHT: form */}
          <div className="form-col" style={{ background: "#fff", overflowY: "auto", minHeight: 0, position: "relative" }}>
            <div style={{
              padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "sticky", top: 0, background: "#fff", zIndex: 5, borderBottom: `1px solid ${LINE}`,
            }}>
              <h2 style={{ fontSize: 15, fontWeight: 700 }}>
                {editingId ? "編輯行程" : "新增行程"}
              </h2>
              <span style={{ fontSize: 12, color: AQUA, fontFamily: "monospace", letterSpacing: ".14em" }}>
                {editingId ? "EDIT" : "NEW"}
              </span>
            </div>

            <div style={{ padding: "8px 24px 90px" }}>
              <FieldSet title="基本資料">
                <Field label="行程名稱" required>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="蘭嶼四天三夜潛旅"
                    style={inputStyle}
                  />
                </Field>
                <Row2>
                  <Field label="副標 / 團別">
                    <input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                      placeholder="端午團" style={inputStyle} />
                  </Field>
                  <Field label="目的地" required>
                    <select value={form.destination}
                      onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value as Dest }))}
                      style={inputStyle}>
                      {(Object.keys(DEST_LABELS) as Dest[]).map((d) => (
                        <option key={d} value={d}>{DEST_LABELS[d]}{d === "other" && "（海外）"}</option>
                      ))}
                    </select>
                  </Field>
                </Row2>
                <Row3>
                  <Field label="出發日"><input type="date" value={form.dateStart}
                    onChange={(e) => setForm((f) => ({ ...f, dateStart: e.target.value }))} style={inputStyle} /></Field>
                  <Field label="結束日"><input type="date" value={form.dateEnd}
                    onChange={(e) => setForm((f) => ({ ...f, dateEnd: e.target.value }))} style={inputStyle} /></Field>
                  <Field label="天數標籤"><input value={form.durationLabel}
                    onChange={(e) => setForm((f) => ({ ...f, durationLabel: e.target.value }))}
                    placeholder="4天3夜" style={inputStyle} /></Field>
                </Row3>
                <Field label="住宿">
                  <input value={form.roomLabel} onChange={(e) => setForm((f) => ({ ...f, roomLabel: e.target.value }))}
                    placeholder="四人房套房" style={inputStyle} />
                </Field>
              </FieldSet>

              <FieldSet title="潛水資訊">
                <Field label="潛水型態">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ALL_STYLES.map((s) => {
                      const on = form.diveStyles.includes(s);
                      return (
                        <label key={s}
                          onClick={() => toggleStyle(s)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            border: `1px solid ${on ? CORAL : LINE}`,
                            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                            fontSize: 13, userSelect: "none",
                            background: on ? "rgba(242,96,60,.12)" : "transparent",
                            color: on ? CORAL : "#1B2733",
                          }}>
                          {s}
                        </label>
                      );
                    })}
                  </div>
                </Field>
                <Row2>
                  <Field label="潛水支數"><input type="number" value={form.tanksCount}
                    onChange={(e) => setForm((f) => ({ ...f, tanksCount: parseInt(e.target.value) || 0 }))}
                    placeholder="10" style={inputStyle} /></Field>
                  <Field label="　">
                    <label
                      onClick={() => setForm((f) => ({ ...f, beginnerFriendly: !f.beginnerFriendly }))}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                      <span style={{
                        width: 42, height: 24, borderRadius: 99, position: "relative",
                        background: form.beginnerFriendly ? AQUA : LINE2,
                        transition: "background .2s", flexShrink: 0,
                      }}>
                        <span style={{
                          position: "absolute", top: 3, left: 3,
                          width: 18, height: 18, borderRadius: "50%", background: "#fff",
                          transform: form.beginnerFriendly ? "translateX(18px)" : "translateX(0)",
                          transition: "transform .2s",
                        }} />
                      </span>
                      <span style={{ fontSize: 13 }}>新手可參加</span>
                    </label>
                  </Field>
                </Row2>
                <Field label="潛點（每行一個）">
                  <textarea value={form.siteList}
                    onChange={(e) => setForm((f) => ({ ...f, siteList: e.target.value }))}
                    placeholder="八代灣沉船&#10;機場外礁&#10;椰油大斷層"
                    style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" }} />
                </Field>
              </FieldSet>

              <FieldSet title="費用">
                <Row2>
                  <Field label="團費 NT$" required><input type="number" value={form.basePrice}
                    onChange={(e) => setForm((f) => ({ ...f, basePrice: parseInt(e.target.value) || 0 }))}
                    style={inputStyle} /></Field>
                  <Field label="訂金 NT$"><input type="number" value={form.deposit}
                    onChange={(e) => setForm((f) => ({ ...f, deposit: parseInt(e.target.value) || 0 }))}
                    style={inputStyle} /></Field>
                </Row2>
                <Row2>
                  <Field label="人數上限（0=∞）"><input type="number" value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 0 }))}
                    style={inputStyle} /></Field>
                  <Field label="訂金截止日"><input type="date" value={form.depositDeadline}
                    onChange={(e) => setForm((f) => ({ ...f, depositDeadline: e.target.value }))}
                    style={inputStyle} /></Field>
                </Row2>
                <Row3>
                  <Field label="尾款截止日"><input type="date" value={form.finalDeadline}
                    onChange={(e) => setForm((f) => ({ ...f, finalDeadline: e.target.value }))}
                    style={inputStyle} /></Field>
                  <Field label="訂金前 N 天提醒"><input type="number" value={form.depositReminderDays}
                    onChange={(e) => setForm((f) => ({ ...f, depositReminderDays: parseInt(e.target.value) || 0 }))}
                    style={inputStyle} /></Field>
                  <Field label="尾款前 N 天提醒"><input type="number" value={form.finalReminderDays}
                    onChange={(e) => setForm((f) => ({ ...f, finalReminderDays: parseInt(e.target.value) || 0 }))}
                    style={inputStyle} /></Field>
                </Row3>
                <Field label="早鳥 / 加價 / 優惠（每行一條）">
                  <textarea value={form.pricingNotes}
                    onChange={(e) => setForm((f) => ({ ...f, pricingNotes: e.target.value }))}
                    placeholder="雙人房：+300/人/晚&#10;自備水推：折3,500&#10;4月底前報名折1,000"
                    style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit", resize: "vertical" }} />
                </Field>
              </FieldSet>

              <FieldSet title="費用包含 / 不包含">
                <Row2>
                  <Field label="費用包含（每行一項）">
                    <textarea value={form.includes}
                      onChange={(e) => setForm((f) => ({ ...f, includes: e.target.value }))}
                      placeholder="氣瓶&#10;住宿&#10;早餐"
                      style={{ ...inputStyle, minHeight: 90, fontFamily: "inherit", resize: "vertical" }} />
                  </Field>
                  <Field label="費用不包含（每行一項）">
                    <textarea value={form.excludes}
                      onChange={(e) => setForm((f) => ({ ...f, excludes: e.target.value }))}
                      placeholder="國際機票&#10;簽證&#10;裝備租借"
                      style={{ ...inputStyle, minHeight: 90, fontFamily: "inherit", resize: "vertical" }} />
                  </Field>
                </Row2>
              </FieldSet>

              <FieldSet title="行程內容">
                {form.itinerary.map((d, i) => (
                  <div key={i} style={{
                    border: `1px solid ${LINE}`, borderRadius: 10, padding: 12,
                    marginBottom: 10, background: BG,
                  }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={d.t} onChange={(e) => updateDay(i, "t", e.target.value)}
                        placeholder="Day 1" style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => removeDay(i)}
                        style={{ ...miniStyle, width: 34, color: CORAL, borderColor: LINE }}>
                        <X size={12} />
                      </button>
                    </div>
                    <textarea value={d.c} onChange={(e) => updateDay(i, "c", e.target.value)}
                      placeholder="09:00 搭船...&#10;13:00 下水兩支"
                      style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit", resize: "vertical" }} />
                  </div>
                ))}
                <button onClick={addDay} style={{
                  width: "100%", border: `1px dashed ${LINE2}`, background: "transparent",
                  color: MUTED, padding: 10, borderRadius: 9, cursor: "pointer", fontSize: 13,
                }}>＋ 新增一天</button>
              </FieldSet>

              <FieldSet title="備註">
                <Field label="">
                  <textarea value={form.extraNote}
                    onChange={(e) => setForm((f) => ({ ...f, extraNote: e.target.value }))}
                    placeholder="新手可參加；潛點視海況安排；船票教練代訂..."
                    style={{ ...inputStyle, minHeight: 80, fontFamily: "inherit", resize: "vertical" }} />
                </Field>
              </FieldSet>
            </div>

            {/* sticky save */}
            <div style={{
              position: "sticky", bottom: 0, background: "#fff",
              borderTop: `1px solid ${LINE}`, padding: "14px 24px",
              display: "flex", gap: 10,
            }}>
              <button onClick={() => (editingId ? loadTour(tours.find((x) => x.id === editingId)!) : newTrip())}
                style={{
                  border: `1px solid ${LINE2}`, background: "transparent", color: MUTED,
                  fontSize: 13, padding: "10px 16px", borderRadius: 9, cursor: "pointer",
                }}>
                {editingId ? "重置" : "清空"}
              </button>
              <button onClick={save} disabled={saving}
                style={{
                  flex: 1, border: "none",
                  background: `linear-gradient(135deg,${AQUA},${AQUA_DIM})`,
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  padding: 12, borderRadius: 10, cursor: saving ? "wait" : "pointer",
                }}>
                {saving ? "儲存中..." : "儲存行程"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#fff", border: `1px solid ${toast.err ? CORAL : AQUA}`,
          borderRadius: 10, padding: "13px 22px", fontSize: 13.5, zIndex: 60,
          color: toast.err ? CORAL : "#1B2733",
          boxShadow: "0 16px 40px -12px rgba(0,0,0,.3)",
        }}>
          {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: BG, border: `1px solid ${LINE}`,
  borderRadius: 8, padding: "9px 11px", color: "#1B2733",
  fontFamily: "inherit", fontSize: 13.5, outline: "none",
};

const miniStyle: React.CSSProperties = {
  width: 26, height: 26, border: `1px solid ${LINE}`,
  background: "transparent", borderRadius: 6, cursor: "pointer",
  color: MUTED, fontSize: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
};

function TopBtn({
  children, onClick, disabled, primary,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        border: `1px solid ${primary ? AQUA : LINE2}`,
        background: primary ? AQUA : "transparent",
        color: primary ? "#fff" : "#1B2733",
        fontSize: 13, fontWeight: 500, padding: "8px 16px",
        borderRadius: 9, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}>
      {children}
    </button>
  );
}

function Seg<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) {
  return (
    <div style={{ display: "flex", border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          style={{
            border: "none", background: value === o.v ? AQUA : "transparent",
            color: value === o.v ? "#fff" : MUTED, fontSize: 12, padding: "6px 13px", cursor: "pointer",
          }}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Mini({
  children, onClick, color, title,
}: { children: React.ReactNode; onClick: () => void; color?: string; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      style={{
        ...miniStyle,
        color: color ?? MUTED,
        borderColor: color ?? LINE,
      }}>
      {children}
    </button>
  );
}

function MiniBadge({ color, children }: { color: "tw" | "ov"; children: React.ReactNode }) {
  const map = {
    tw: { bg: "rgba(14,158,145,.13)", color: AQUA },
    ov: { bg: "rgba(242,96,60,.13)", color: CORAL },
  };
  const c = map[color];
  return (
    <span style={{
      display: "inline-block", fontSize: 10.5, fontWeight: 700,
      padding: "2px 7px", borderRadius: 5,
      background: c.bg, color: c.color,
    }}>
      {children}
    </span>
  );
}

function FieldSet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset style={{ border: "none", margin: "22px 0 0" }}>
      <legend style={{
        fontSize: 12, fontWeight: 700, color: AQUA,
        letterSpacing: ".1em", textTransform: "uppercase",
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", marginBottom: 14,
      }}>
        {title}
        <span style={{ flex: 1, height: 1, background: LINE }} />
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ display: "block", fontSize: 12, color: MUTED, marginBottom: 5, fontWeight: 500 }}>
          {label}
          {required && <span style={{ color: CORAL }}> *</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>{children}</div>;
}
function Row3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>{children}</div>;
}
