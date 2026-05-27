"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, XCircle } from "lucide-react";

type Dest = "northeast" | "green_island" | "lanyu" | "kenting" | "other";
const DEST_LABELS: Record<Dest, string> = { northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "其他" };

interface Tour {
  id: string;
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

const cardStyle: React.CSSProperties = { background: "var(--color-ocean-surface)", border: "1px solid rgba(255,255,255,0.1)" };
const labelStyle: React.CSSProperties = { color: "rgba(230,240,255,0.8)" };
const subStyle: React.CSSProperties = { color: "rgba(230,240,255,0.45)" };
const inputCls = "border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-[var(--color-phosphor)]";
const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

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
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.15)" }}>
            {(["all", "open", "cancelled"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-sm transition-colors"
                style={filter === f
                  ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                  : { color: "rgba(230,240,255,0.6)", background: "transparent" }}>
                {f === "all" ? "全部" : f === "open" ? "進行中" : "已取消"}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <Button size="sm" style={primaryBtn} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />新增潛水團
          </Button>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm" style={subStyle}>載入中...</div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={cardStyle}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  {["主題", "目的地", "出發日", "結束日", "定價", "訂金", "容額/已訂", "狀態", "操作"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={subStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t, i) => (
                  <tr key={t.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined, opacity: t.status === "cancelled" ? 0.5 : 1 }}>
                    <td className="px-4 py-3 font-semibold max-w-[180px]" style={{ color: "#e6f0ff" }}>{t.title}</td>
                    <td className="px-4 py-3" style={subStyle}>{DEST_LABELS[t.destination]}</td>
                    <td className="px-4 py-3" style={subStyle}>{t.dateStart.split("T")[0]}</td>
                    <td className="px-4 py-3" style={subStyle}>{t.dateEnd.split("T")[0]}</td>
                    <td className="px-4 py-3" style={subStyle}>NT$ {t.basePrice.toLocaleString()}</td>
                    <td className="px-4 py-3" style={subStyle}>NT$ {t.deposit.toLocaleString()}</td>
                    <td className="px-4 py-3" style={subStyle}>{t.capacity ?? "無上限"} / {t._count?.bookings ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={t.status === "open" ? "ocean" : "muted"}>{t.status === "open" ? "進行中" : "已取消"}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(t)} className="rounded p-1.5 hover:bg-white/10" style={{ color: "rgba(230,240,255,0.6)" }} title="編輯"><Edit3 className="h-3.5 w-3.5" /></button>
                        {t.status === "open" && (
                          <button onClick={() => cancelTour(t)} className="rounded p-1.5 hover:bg-white/10" style={{ color: "var(--color-coral)" }} title="取消"><XCircle className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => deleteTour(t)} className="rounded p-1.5 hover:bg-white/10" style={{ color: "var(--color-coral)" }} title="永久刪除"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-sm" style={subStyle}>沒有潛水團資料</td></tr>}
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
                <Button size="sm" style={primaryBtn} onClick={save} disabled={saving || !form.title.trim()}>{saving ? "儲存中..." : "儲存"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
