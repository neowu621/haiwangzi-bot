"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2 } from "lucide-react";

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
  maxDepth: number | null;
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
  maxDepth: null, features: [], images: [], youtubeUrl: "", locationUrl: "", cautions: "",
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
    setForm({ name: s.name, region: s.region, description: s.description ?? "", difficulty: s.difficulty, maxDepth: s.maxDepth, features: s.features, images: s.images, youtubeUrl: s.youtubeUrl ?? "", locationUrl: s.locationUrl ?? "", cautions: s.cautions ?? "" });
    setFeaturesInput(s.features.join(", "));
    setEditingId(s.id); setDialogMode("edit");
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, features: featuresInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean), maxDepth: form.maxDepth ?? null };
      if (dialogMode === "create") {
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

        <div className="flex justify-end">
          <Button size="sm" style={primaryBtn} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增潛點
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                  {["ID", "名稱", "區域", "難度", "最大深度", "操作"].map(h => (
                    <th key={h} className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s, i) => (
                  <tr key={s.id} className={`border-t ${i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20"}`} style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">{s.id}</td>
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
                {sites.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">沒有潛點資料</td></tr>}
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
              {dialogMode === "create" && (
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                  <Label className="text-xs text-[var(--muted-foreground)]">ID（英文）</Label>
                  <Input value={(form as DiveSite & {id?: string}).id ?? ""} onChange={e => setForm(f => ({ ...f, id: e.target.value } as unknown as Omit<DiveSite,"id">))} placeholder="northeast_longdong" />
                </div>
              )}
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
                <Input type="number" value={form.maxDepth ?? ""} onChange={e => setForm(f => ({ ...f, maxDepth: e.target.value ? parseInt(e.target.value) : null }))} placeholder="選填" />
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
