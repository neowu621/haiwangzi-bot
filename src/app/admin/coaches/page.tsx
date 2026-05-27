"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, UserX, UserCheck } from "lucide-react";

type Cert = "DM" | "Instructor" | "CourseDirector";

interface Coach {
  id: string;
  realName: string;
  cert: Cert;
  specialty: string[];
  feePerDive: number;
  note: string | null;
  lineUserId: string | null;
  active: boolean;
}

const CERT_LABELS: Record<Cert, string> = {
  DM: "DM", Instructor: "Instructor", CourseDirector: "Course Director",
};

const cardStyle: React.CSSProperties = { background: "var(--color-ocean-surface)", border: "1px solid rgba(255,255,255,0.1)" };
const labelStyle: React.CSSProperties = { color: "rgba(230,240,255,0.8)" };
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };
const inputCls = "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)]";
const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

const BLANK: Omit<Coach, "id"> = {
  realName: "", cert: "DM", specialty: [], feePerDive: 1500,
  note: "", lineUserId: "", active: true,
};

export default function CoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [defaultFee, setDefaultFee] = useState(1500);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Coach, "id">>(BLANK);
  const [specialtyInput, setSpecialtyInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [coachData, cfgData] = await Promise.all([
        adminFetch<{ coaches: Coach[] }>("/api/admin/coaches?includeInactive=1"),
        adminFetch<{ config: { defaultCoachFee?: number } }>("/api/admin/site-config").catch(() => ({ config: {} as { defaultCoachFee?: number } })),
      ]);
      setCoaches(coachData.coaches);
      setDefaultFee(cfgData.config.defaultCoachFee ?? 1500);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ ...BLANK, feePerDive: defaultFee });
    setSpecialtyInput("");
    setEditingId(null);
    setDialogMode("create");
  }

  function openEdit(c: Coach) {
    setForm({ realName: c.realName, cert: c.cert, specialty: c.specialty, feePerDive: c.feePerDive, note: c.note ?? "", lineUserId: c.lineUserId ?? "", active: c.active });
    setSpecialtyInput(c.specialty.join(", "));
    setEditingId(c.id);
    setDialogMode("edit");
  }

  async function save() {
    if (!form.realName.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, specialty: specialtyInput.split(/[,，、]/).map(s => s.trim()).filter(Boolean) };
      if (dialogMode === "create") {
        await adminFetch("/api/admin/coaches", { method: "POST", body: JSON.stringify(body) });
      } else if (editingId) {
        await adminFetch(`/api/admin/coaches/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      setDialogMode(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coach) {
    try {
      await adminFetch(`/api/admin/coaches/${c.id}`, { method: "PATCH", body: JSON.stringify({ active: !c.active }) });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失敗");
    }
  }

  async function deleteCoach(c: Coach) {
    const confirm1 = window.confirm(`確定要永久刪除「${c.realName}」？此操作無法復原。`);
    if (!confirm1) return;
    const input = window.prompt('請輸入 "DELETE" 確認');
    if (input !== "DELETE") return;
    try {
      await adminFetch(`/api/admin/coaches/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "刪除失敗");
    }
  }

  const visible = showInactive ? coaches : coaches.filter(c => c.active);

  return (
    <AdminShell>
      <div className="space-y-4">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm" style={subStyle}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-phosphor)]" />
            顯示停用教練
          </label>
          <Button size="sm" style={primaryBtn} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增教練
          </Button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm" style={subStyle}>載入中...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={cardStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {["姓名", "證照", "特長", "費用/潛", "LINE", "狀態", "操作"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={subStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined, opacity: c.active ? 1 : 0.5 }}>
                    <td className="px-4 py-3 font-semibold" style={{ color: "#e6f0ff" }}>{c.realName}</td>
                    <td className="px-4 py-3" style={subStyle}>{CERT_LABELS[c.cert]}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.specialty.slice(0, 3).map(s => (
                          <span key={s} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(230,240,255,0.7)" }}>{s}</span>
                        ))}
                        {c.specialty.length > 3 && <span className="text-[10px]" style={subStyle}>+{c.specialty.length - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={subStyle}>NT$ {c.feePerDive}</td>
                    <td className="px-4 py-3 font-mono text-[11px]" style={subStyle}>{c.lineUserId ? c.lineUserId.slice(0, 12) + "..." : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.active ? "ocean" : "muted"}>{c.active ? "啟用" : "停用"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(c)} className="rounded p-1.5 hover:bg-white/10" style={{ color: "rgba(230,240,255,0.6)" }} title="編輯">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggleActive(c)} className="rounded p-1.5 hover:bg-white/10" style={{ color: c.active ? "var(--color-coral)" : "var(--color-phosphor)" }} title={c.active ? "停用" : "啟用"}>
                          {c.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </button>
                        <button onClick={() => deleteCoach(c)} className="rounded p-1.5 hover:bg-white/10" style={{ color: "var(--color-coral)" }} title="永久刪除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={subStyle}>沒有教練資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <Dialog open={dialogMode !== null} onOpenChange={open => { if (!open) setDialogMode(null); }}>
          <DialogContent style={{ background: "var(--color-ocean-deep)", border: "1px solid rgba(255,255,255,0.15)", color: "#e6f0ff", maxWidth: "480px" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--color-phosphor)" }}>
                {dialogMode === "create" ? "新增教練" : "編輯教練"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>姓名</Label>
                <Input className={inputCls} value={form.realName} onChange={e => setForm(f => ({ ...f, realName: e.target.value }))} autoFocus />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>證照等級</Label>
                <select value={form.cert} onChange={e => setForm(f => ({ ...f, cert: e.target.value as Cert }))}
                  className="rounded-lg border px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "#e6f0ff" }}>
                  {(["DM", "Instructor", "CourseDirector"] as Cert[]).map(c => (
                    <option key={c} value={c} style={{ background: "#0a1628" }}>{CERT_LABELS[c]}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>特長（逗號分隔）</Label>
                <Input className={inputCls} value={specialtyInput} onChange={e => setSpecialtyInput(e.target.value)} placeholder="攝影、夜潛、水肺" />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>費用/潛 (NT$)</Label>
                <Input type="number" className={inputCls} value={form.feePerDive} onChange={e => setForm(f => ({ ...f, feePerDive: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>LINE User ID</Label>
                <Input className={inputCls} value={form.lineUserId ?? ""} onChange={e => setForm(f => ({ ...f, lineUserId: e.target.value }))} placeholder="選填" />
              </div>
              <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                <Label style={labelStyle}>備註</Label>
                <textarea value={form.note ?? ""} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                  style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "#e6f0ff" }} />
              </div>
              {dialogMode === "edit" && (
                <div className="grid grid-cols-[7rem_1fr] items-center gap-3">
                  <Label style={labelStyle}>狀態</Label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                      className="h-4 w-4 accent-[var(--color-phosphor)]" />
                    <span className="text-sm" style={labelStyle}>啟用</span>
                  </label>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}
                  style={{ borderColor: "rgba(255,255,255,0.2)", color: "rgba(230,240,255,0.7)" }}>取消</Button>
                <Button size="sm" style={primaryBtn} onClick={save} disabled={saving || !form.realName.trim()}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
