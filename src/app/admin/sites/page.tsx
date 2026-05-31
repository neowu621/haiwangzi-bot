"use client";
import { useEffect, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, Upload, Download, FileSpreadsheet } from "lucide-react";
import ExcelJS from "exceljs";

type Region = "northeast" | "green_island" | "lanyu" | "kenting" | "other";
type Difficulty = "easy" | "medium" | "hard";

const REGION_LABELS: Record<Region, string> = { northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "其他" };
const DIFF_LABELS: Record<Difficulty, string> = { easy: "初級", medium: "中級", hard: "進階" };

interface DiveSite {
  id: string;
  name: string;
  region: Region;
  description: string | null;
  difficulty: Difficulty;
  maxDepth: string;  // v137: 改為文字，允許 "20" 或 "20-30"
  features: string[];
  images: string[];
  youtubeUrl: string | null;
  locationUrl: string | null;
  cautions: string | null;
}

// 淺色 dialog（與 settings / users 頁一致）
const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

const BLANK: Omit<DiveSite, "id"> = {
  name: "", region: "northeast", description: "", difficulty: "easy",
  maxDepth: "", features: [], images: [], youtubeUrl: "", locationUrl: "", cautions: "",
};

// region / difficulty 中文 → 內部英文代碼對照（給 Excel 匯入用）
// 對外只接受中文，內部仍用英文代碼存 DB（不影響既有資料）
const REGION_FROM_LABEL: Record<string, Region> = {
  "東北角": "northeast",
  "綠島": "green_island",
  "蘭嶼": "lanyu",
  "墾丁": "kenting",
  "其他": "other",
};
const DIFF_FROM_LABEL: Record<string, Difficulty> = {
  "初級": "easy",
  "中級": "medium",
  "進階": "hard",
};

export default function SitesPage() {
  const [sites, setSites] = useState<DiveSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DiveSite, "id">>(BLANK);
  const [featuresInput, setFeaturesInput] = useState("");
  const [saving, setSaving] = useState(false);
  // Excel 匯入相關 state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number; created: number; updated: number;
    errors: { row: number; id: string; message: string }[];
  } | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<DiveSite[]>("/api/admin/sites");
      setSites(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(BLANK); setFeaturesInput(""); setEditingId(null); setDialogMode("create");
  }

  function openEdit(s: DiveSite) {
    setForm({ name: s.name, region: s.region, description: s.description ?? "", difficulty: s.difficulty, maxDepth: s.maxDepth ?? "", features: s.features, images: s.images, youtubeUrl: s.youtubeUrl ?? "", locationUrl: s.locationUrl ?? "", cautions: s.cautions ?? "" });
    setFeaturesInput(s.features.join(", "));
    setEditingId(s.id); setDialogMode("edit");
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...form,
        features: featuresInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        maxDepth: form.maxDepth ?? "",
      };
      if (dialogMode === "create") {
        // 自動產生內部 id（使用者看不見，純內部識別用）
        body.id = `site_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await adminFetch("/api/admin/sites", { method: "POST", body: JSON.stringify(body) });
      } else if (editingId) {
        await adminFetch(`/api/admin/sites/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      setDialogMode(null); await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  // ── Excel 範本下載 + 上傳匯入 ──────────────────────────────────────
  async function downloadTemplate() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("潛點");
    ws.columns = [
      { header: "名稱（必填）", key: "name", width: 22 },
      { header: "區域（東北角／綠島／蘭嶼／墾丁／其他，必填）", key: "region", width: 24 },
      { header: "難度（初級／中級／進階）", key: "difficulty", width: 18 },
      { header: "最大深度（可填 20 或 20-30）", key: "maxDepth", width: 22 },
      { header: "特色（逗號分隔）", key: "features", width: 30 },
      { header: "YouTube 網址", key: "youtubeUrl", width: 36 },
      { header: "Google 地圖網址", key: "locationUrl", width: 36 },
      { header: "描述", key: "description", width: 40 },
      { header: "備註（注意事項）", key: "cautions", width: 40 },
    ];
    // 標題列樣式
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A2342" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    // 範例列
    ws.addRow({
      name: "龍洞",
      region: "東北角",
      difficulty: "中級",
      maxDepth: "20-30",
      features: "珊瑚礁, 軟珊瑚, 魚群",
      youtubeUrl: "https://www.youtube.com/watch?v=xxx",
      locationUrl: "https://maps.app.goo.gl/xxx",
      description: "東北角最熱門潛點之一",
      cautions: "注意水流方向",
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dive_sites_template.xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("Excel 檔內沒有工作表");

      const rows: Array<Record<string, unknown>> = [];
      // 給每列產生唯一 id（內部用，使用者不可見）
      const genId = () => `site_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      ws.eachRow((row, idx) => {
        if (idx === 1) return; // skip header
        const cell = (col: number) => {
          const v = row.getCell(col).value;
          if (v == null) return "";
          if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
          return String(v);
        };
        const name = cell(1).trim();
        if (!name) return; // 跳過空白列
        const regionRaw = cell(2).trim();
        const diffRaw = cell(3).trim();
        rows.push({
          id: genId(),
          name,
          region: REGION_FROM_LABEL[regionRaw] ?? "other",
          difficulty: DIFF_FROM_LABEL[diffRaw] ?? "medium",
          maxDepth: cell(4).trim(),
          features: cell(5).split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
          youtubeUrl: cell(6).trim(),
          locationUrl: cell(7).trim(),
          description: cell(8).trim(),
          cautions: cell(9).trim(),
        });
      });

      if (rows.length === 0) {
        throw new Error("檔案內沒有可匯入的資料（名稱必填）");
      }
      if (rows.length > 500) {
        throw new Error(`單次最多 500 筆，此檔有 ${rows.length} 筆`);
      }

      const res = await adminFetch<{
        ok: boolean; total: number; created: number; updated: number;
        errors: { row: number; id: string; message: string }[];
      }>("/api/admin/sites/bulk-import", {
        method: "POST",
        body: JSON.stringify({ rows, mode: "upsert" }),
      });
      setImportResult(res);
      await load();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Excel 匯入失敗");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteSite(s: DiveSite) {
    const ok = window.confirm(`確定刪除「${s.name}」？`);
    if (!ok) return;
    try {
      const res = await adminFetch<{ error?: string; code?: string }>(`/api/admin/sites/${s.id}`, { method: "DELETE" }).catch(async (e) => ({ error: e.message }));
      if ((res as { error?: string })?.error?.includes("409") || (res as { code?: string })?.code === "REFERENCED") {
        const force = window.confirm("此潛點已被場次參考，確定強制刪除？");
        if (!force) return;
        await adminFetch(`/api/admin/sites/${s.id}?force=1`, { method: "DELETE" });
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "刪除失敗");
    }
  }

  return (
    <AdminShell>
      <div className="space-y-4">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button size="sm" variant="outline" onClick={downloadTemplate} title="下載 Excel 範本">
            <Download className="mr-1.5 h-4 w-4" />下載範本
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload className="mr-1.5 h-4 w-4" />
            {importing ? "匯入中..." : "Excel 匯入"}
          </Button>
          <Button size="sm" style={primaryBtn} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增潛點
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
              <span className="text-blue-700">更新 {importResult.updated}</span>
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
                    第 {er.row} 列 ({er.id || "—"})：{er.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                  {["名稱", "區域", "難度", "最大深度", "操作"].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={s.id} className={`border-t ${i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20"}`} style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{s.name}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{REGION_LABELS[s.region]}</td>
                    <td className="px-4 py-3">
                      <Badge variant={s.difficulty === "easy" ? "ocean" : s.difficulty === "medium" ? "muted" : "coral"}>
                        {DIFF_LABELS[s.difficulty]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{s.maxDepth ? `${s.maxDepth}m` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(s)} className="rounded p-1.5 hover:bg-[var(--muted)]" style={{ color: "var(--muted-foreground)" }} title="編輯"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteSite(s)} className="rounded p-1.5 hover:bg-[var(--muted)]" style={{ color: "var(--color-coral)" }} title="刪除"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {sites.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">沒有潛點資料</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogMode !== null} onOpenChange={open => { if (!open) setDialogMode(null); }}>
          <DialogContent className="max-w-lg bg-white text-[var(--foreground)]">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-[var(--foreground)]">
                {dialogMode === "create" ? "新增潛點" : "編輯潛點"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">名稱</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">區域</Label>
                <select value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value as Region }))}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]">
                  {(Object.keys(REGION_LABELS) as Region[]).map(r => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">難度</Label>
                <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as Difficulty }))}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]">
                  {(Object.keys(DIFF_LABELS) as Difficulty[]).map(d => <option key={d} value={d}>{DIFF_LABELS[d]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">最大深度(m)</Label>
                <Input type="text" value={form.maxDepth ?? ""} onChange={e => setForm(f => ({ ...f, maxDepth: e.target.value }))} placeholder="例：20 或 20-30（選填）" />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">特色（逗號分隔）</Label>
                <Input value={featuresInput} onChange={e => setFeaturesInput(e.target.value)} placeholder="珊瑚礁、洞穴、魚群" />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">YouTube URL</Label>
                <Input value={form.youtubeUrl ?? ""} onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))} placeholder="選填" />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label className="text-xs text-[var(--muted-foreground)]">位置 URL</Label>
                <Input value={form.locationUrl ?? ""} onChange={e => setForm(f => ({ ...f, locationUrl: e.target.value }))} placeholder="Google Map URL（選填）" />
              </div>

              {/* 描述 + 備註：移到底部、跨整列 */}
              <div className="space-y-1">
                <Label className="text-xs text-[var(--muted-foreground)]">描述</Label>
                <textarea value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-phosphor)]"
                  placeholder="這個潛點的特色、適合什麼程度的潛水員..." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[var(--muted-foreground)]">備註（注意事項）</Label>
                <textarea value={form.cautions ?? ""} onChange={e => setForm(f => ({ ...f, cautions: e.target.value }))}
                  rows={2}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-phosphor)]"
                  placeholder="水流方向、入水點、緊急聯絡注意事項..." />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}>取消</Button>
                <Button size="sm" style={primaryBtn} onClick={save} disabled={saving || !form.name.trim()}>{saving ? "儲存中..." : "儲存"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
