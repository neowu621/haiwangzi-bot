"use client";
import { useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, Ban, Upload, Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import ExcelJS from "exceljs";

type Dest = "northeast" | "green_island" | "lanyu" | "kenting" | "other";
const DEST_LABELS: Record<Dest, string> = { northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "其他" };

// 中文 → 內部代碼 對照（Excel 匯入用，只接受中文）
const DEST_FROM_LABEL: Record<string, Dest> = {
  "東北角": "northeast",
  "綠島": "green_island",
  "蘭嶼": "lanyu",
  "墾丁": "kenting",
  "其他": "other",
};

// （v153 起：移除 SiteRef、不再從潛點管理對照）

interface Tour {
  id: string;
  code?: string | null;
  title: string;
  destination: Dest;
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
  _count?: { bookings: number };
}

const labelStyle: React.CSSProperties = { color: "rgba(230,240,255,0.8)" };
const inputCls = "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)]";

const today = new Date().toISOString().split("T")[0];
const BLANK = {
  title: "", destination: "northeast" as Dest,
  dateStart: today, dateEnd: today,
  basePrice: 15000, deposit: 5000, capacity: 10,
  depositDeadline: "", finalDeadline: "",
  depositReminderDays: 7, finalReminderDays: 30, guideReminderDays: 2,
};

export default function ToursPage() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "cancelled">("all");
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  // Excel 匯入相關
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    created: number;
    errors: { row: number; title: string; message: string }[];
  } | null>(null);

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

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm(BLANK); setEditingId(null); setDialogMode("create");
  }

  function openEdit(t: Tour) {
    setForm({
      title: t.title, destination: t.destination,
      dateStart: t.dateStart.split("T")[0], dateEnd: t.dateEnd.split("T")[0],
      basePrice: t.basePrice, deposit: t.deposit, capacity: t.capacity ?? 10,
      depositDeadline: t.depositDeadline ? t.depositDeadline.split("T")[0] : "",
      finalDeadline: t.finalDeadline ? t.finalDeadline.split("T")[0] : "",
      depositReminderDays: t.depositReminderDays, finalReminderDays: t.finalReminderDays,
      guideReminderDays: t.guideReminderDays,
    });
    setEditingId(t.id); setDialogMode("edit");
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        ...form,
        depositDeadline: form.depositDeadline || null,
        finalDeadline: form.finalDeadline || null,
      };
      if (dialogMode === "create") {
        await adminFetch("/api/admin/tours", { method: "POST", body: JSON.stringify(body) });
      } else if (editingId) {
        await adminFetch(`/api/admin/tours/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      setDialogMode(null); await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  // ── Excel 範本下載 + 上傳匯入 ──────────────────────────────────────
  async function downloadTourTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("潛水團");
    ws.columns = [
      { header: "標題（必填）", key: "title", width: 28 },
      { header: "目的地（東北角／綠島／蘭嶼／墾丁／其他，必填）", key: "destination", width: 22 },
      { header: "出發日（YYYY-MM-DD，必填）", key: "dateStart", width: 18 },
      { header: "結束日（YYYY-MM-DD，必填）", key: "dateEnd", width: 18 },
      { header: "團費（必填，整數）", key: "basePrice", width: 14 },
      { header: "訂金（必填，整數）", key: "deposit", width: 12 },
      { header: "人數上限（0=∞）", key: "capacity", width: 14 },
      { header: "訂金截止日（YYYY-MM-DD，選填）", key: "depositDeadline", width: 22 },
      { header: "尾款截止日（YYYY-MM-DD，選填）", key: "finalDeadline", width: 22 },
      { header: "訂金截止前 N 天提醒", key: "depositReminderDays", width: 18 },
      { header: "尾款截止前 N 天提醒", key: "finalReminderDays", width: 18 },
      { header: "出發前 N 天發手冊提醒", key: "guideReminderDays", width: 20 },
      { header: "潛點名稱（逗號分隔，例：藍洞,雞善嶼）", key: "sites", width: 30 },
      { header: "包含項目（逗號分隔）", key: "includes", width: 30 },
      { header: "不含項目（逗號分隔）", key: "excludes", width: 30 },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2342" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 32;

    // 範例列
    ws.addRow({
      title: "綠島 3 天 2 夜潛水團",
      destination: "綠島",
      dateStart: "2026-07-18",
      dateEnd: "2026-07-20",
      basePrice: 18500,
      deposit: 5000,
      capacity: 12,
      depositDeadline: "2026-06-20",
      finalDeadline: "2026-07-10",
      depositReminderDays: 7,
      finalReminderDays: 30,
      guideReminderDays: 2,
      sites: "大白沙,雞善嶼,柴口",
      includes: "船宿, 早午晚餐, 接駁, 氣瓶",
      excludes: "個人裝備, 保險, 行前住宿",
    });
    ws.addRow({
      title: "墾丁 2 天 1 夜深潛體驗",
      destination: "墾丁",
      dateStart: "2026-08-15",
      dateEnd: "2026-08-16",
      basePrice: 9800,
      deposit: 3000,
      capacity: 10,
      depositDeadline: "",
      finalDeadline: "",
      depositReminderDays: 7,
      finalReminderDays: 30,
      guideReminderDays: 2,
      sites: "後壁湖,出水口",
      includes: "民宿, 早餐, 氣瓶",
      excludes: "個人裝備",
    });

    // 欄位說明 worksheet
    const help = wb.addWorksheet("欄位說明");
    help.columns = [
      { header: "欄位", key: "k", width: 22 },
      { header: "說明", key: "v", width: 70 },
    ];
    help.getRow(1).font = { bold: true };
    [
      ["標題", "顯示在 LIFF 與後台的團名（建議含目的地 + 天數）"],
      ["目的地", "東北角 / 綠島 / 蘭嶼 / 墾丁 / 其他"],
      ["出發日 / 結束日", "YYYY-MM-DD"],
      ["團費", "全程含稅總價（不含個人裝備）"],
      ["訂金", "訂金金額（NT$）"],
      ["人數上限", "整數，0 = 無上限"],
      ["訂金截止 / 尾款截止", "選填，留空則使用系統預設規則"],
      ["提醒天數", "Cron 自動發 LINE 推播的天數設定（預設 7 / 30 / 2）"],
      ["潛點名稱", "自由輸入（多個用半形或全形逗號分隔），系統不再強制對照潛點清單"],
      ["包含 / 不含項目", "用半形或全形逗號、頓號分隔，例：船宿,早午晚餐"],
      ["匯入規則", "全部視為新增（不會更新既有團）；單次最多 100 筆"],
    ].forEach(([k, v]) => help.addRow({ k, v }));

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tours_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleTourFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet("潛水團") ?? wb.worksheets[0];
      if (!ws) throw new Error("Excel 檔內沒有工作表");

      // v153 起：不再用潛點清單對照，直接存名稱

      // 解析 Excel cell 為文字
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
      const parseInt0 = (s: string, dflt = 0): number => {
        const n = parseInt(s.replace(/[^\d-]/g, ""), 10);
        return Number.isNaN(n) ? dflt : n;
      };

      const rows: Array<Record<string, unknown>> = [];
      const localErrors: { row: number; title: string; message: string }[] = [];
      let rowIdx = 0;
      ws.eachRow((row, idx) => {
        if (idx === 1) return; // skip header
        rowIdx = idx;
        const cell = (col: number) => cellText(row.getCell(col).value);
        const title = cell(1);
        const destRaw = cell(2);
        const dateStart = cell(3);
        const dateEnd = cell(4);
        if (!title) return; // 跳過空白列

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStart)) {
          localErrors.push({ row: idx, title, message: "出發日格式錯誤，應為 YYYY-MM-DD" });
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEnd)) {
          localErrors.push({ row: idx, title, message: "結束日格式錯誤，應為 YYYY-MM-DD" });
          return;
        }
        const destination = DEST_FROM_LABEL[destRaw];
        if (!destination) {
          localErrors.push({ row: idx, title, message: `目的地「${destRaw}」不在 (東北角/綠島/蘭嶼/墾丁/其他)` });
          return;
        }

        // 潛點：直接存入名稱（v153 起不再對照潛點管理表）
        const diveSiteIds = cell(13).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

        const depositDeadline = cell(8);
        const finalDeadline = cell(9);

        rows.push({
          title,
          destination,
          dateStart,
          dateEnd,
          basePrice: parseInt0(cell(5)),
          deposit: parseInt0(cell(6)),
          capacity: parseInt0(cell(7), 10),
          depositDeadline: depositDeadline && /^\d{4}-\d{2}-\d{2}$/.test(depositDeadline) ? depositDeadline : "",
          finalDeadline: finalDeadline && /^\d{4}-\d{2}-\d{2}$/.test(finalDeadline) ? finalDeadline : "",
          depositReminderDays: parseInt0(cell(10), 7),
          finalReminderDays: parseInt0(cell(11), 30),
          guideReminderDays: parseInt0(cell(12), 2),
          diveSiteIds,
          includes: cell(14).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          excludes: cell(15).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
        });
      });

      if (rowIdx === 0) {
        throw new Error("檔案內沒有資料");
      }
      if (rows.length === 0 && localErrors.length > 0) {
        setImportResult({ total: 0, created: 0, errors: localErrors });
        return;
      }
      if (rows.length === 0) {
        throw new Error("沒有可匯入的資料（請至少填寫標題、出發日、結束日、目的地）");
      }

      const res = await adminFetch<{
        ok: boolean; total: number; created: number;
        errors: { row: number; title: string; message: string }[];
      }>("/api/admin/tours/bulk-import", {
        method: "POST",
        body: JSON.stringify({ rows }),
      });

      setImportResult({
        total: res.total + localErrors.length,
        created: res.created,
        errors: [...localErrors, ...res.errors],
      });
      await load();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Excel 匯入失敗");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function cancelTour(t: Tour) {
    if (!window.confirm(`取消「${t.title}」？`)) return;
    try {
      await adminFetch(`/api/admin/tours/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "操作失敗"); }
  }

  async function deleteTour(t: Tour) {
    if (!window.confirm(`永久刪除「${t.title}」？`)) return;
    if (window.prompt('輸入 "DELETE" 確認') !== "DELETE") return;
    try {
      await adminFetch(`/api/admin/tours/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "刪除失敗"); }
  }

  const visible = tours.filter(t => filter === "all" ? true : t.status === filter);

  return (
    <AdminShell>
      <div className="space-y-4">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}

        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            {(["all", "open", "cancelled"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  filter === f
                    ? "bg-[var(--color-ocean-deep)] text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                )}>
                {f === "all" ? "全部" : f === "open" ? "進行中" : "已取消"}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleTourFileUpload}
            className="hidden"
          />
          <Button size="sm" variant="outline" onClick={downloadTourTemplate} title="下載 Excel 範本">
            <Download className="mr-1.5 h-4 w-4" />下載範本
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1.5 h-4 w-4" />
            {importing ? "匯入中..." : "Excel 匯入"}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增潛水團
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
                    第 {er.row} 列（{er.title || "—"}）：{er.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                  {["編號", "主題", "目的地", "出發日", "結束日", "定價", "訂金", "已報名/可接受", "狀態", "操作"].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => (
                  <tr key={t.id} className={cn("border-t", i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20")} style={{ opacity: t.status === "cancelled" ? 0.5 : 1 }}>
                    <td className="px-4 py-3">
                      {t.code ? (
                        <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-teal-800">
                          {t.code}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold max-w-[180px]" style={{ color: "var(--foreground)" }}>{t.title}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{DEST_LABELS[t.destination]}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{t.dateStart.split("T")[0]}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{t.dateEnd.split("T")[0]}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">NT$ {t.basePrice.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">NT$ {t.deposit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{t._count?.bookings ?? 0} / {t.capacity ?? "∞"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={t.status === "open" ? "ocean" : "muted"}>{t.status === "open" ? "進行中" : "已取消"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(t)} className="rounded p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)]" title="編輯"><Edit3 className="h-3.5 w-3.5" /></button>
                        {t.status === "open" && (
                          <button onClick={() => cancelTour(t)}
                            className="rounded p-1.5 hover:bg-amber-50 text-amber-600"
                            title="取消潛水團（保留資料）"><Ban className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => deleteTour(t)}
                          className="rounded p-1.5 hover:bg-[var(--color-coral)]/10"
                          style={{ color: "var(--color-coral)" }}
                          title="永久刪除（不可復原）"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">沒有潛水團資料</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogMode !== null} onOpenChange={open => { if (!open) setDialogMode(null); }}>
          <DialogContent style={{ background: "var(--color-ocean-deep)", border: "1px solid rgba(255,255,255,0.15)", color: "#e6f0ff", maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--color-phosphor)" }}>{dialogMode === "create" ? "新增潛水團" : "編輯潛水團"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              {[
                { label: "主題名稱", field: "title" as const, type: "text" },
              ].map(({ label, field, type }) => (
                <div key={field} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                  <Label style={labelStyle}>{label}</Label>
                  <Input type={type} className={inputCls} value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} autoFocus={field === "title"} />
                </div>
              ))}
              <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
                <Label style={labelStyle}>目的地</Label>
                <select value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value as Dest }))}
                  className="rounded-lg border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "#e6f0ff" }}>
                  {(Object.keys(DEST_LABELS) as Dest[]).map(d => <option key={d} value={d} style={{ background: "#0a1628" }}>{DEST_LABELS[d]}</option>)}
                </select>
              </div>
              {[
                { label: "出發日期", field: "dateStart" as const },
                { label: "結束日期", field: "dateEnd" as const },
              ].map(({ label, field }) => (
                <div key={field} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                  <Label style={labelStyle}>{label}</Label>
                  <Input type="date" className={inputCls} value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs" style={{ color: "rgba(230,240,255,0.5)" }}>定價 (NT$)</Label>
                  <Input type="number" className={inputCls} value={form.basePrice} onChange={e => setForm(f => ({ ...f, basePrice: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs" style={{ color: "rgba(230,240,255,0.5)" }}>訂金 (NT$)</Label>
                  <Input type="number" className={inputCls} value={form.deposit} onChange={e => setForm(f => ({ ...f, deposit: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="grid grid-cols-[8rem_1fr] items-center gap-3">
                <Label style={labelStyle}>容量</Label>
                <Input type="number" className={inputCls} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: parseInt(e.target.value) || 0 }))} />
              </div>
              {[
                { label: "訂金截止日", field: "depositDeadline" as const },
                { label: "全款截止日", field: "finalDeadline" as const },
              ].map(({ label, field }) => (
                <div key={field} className="grid grid-cols-[8rem_1fr] items-center gap-3">
                  <Label style={labelStyle}>{label}</Label>
                  <Input type="date" className={inputCls} value={String(form[field])} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDialogMode(null)} style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(230,240,255,0.7)" }}>取消</Button>
                <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>{saving ? "儲存中..." : "儲存"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
