"use client";
import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, User, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface Coach {
  id: string;
  realName: string;
  cert: "DM" | "Instructor" | "CourseDirector";
  specialty: string[];
  feePerDive: number;
  note: string | null;
  lineUserId: string | null;
  active: boolean;
}

const CERTS = [
  { id: "DM", label: "DM 潛水長" },
  { id: "Instructor", label: "Instructor 教練" },
  { id: "CourseDirector", label: "Course Director 課程主任" },
] as const;

function newCoachDraft(): Partial<Coach> & { isNew?: boolean } {
  return {
    id: "",
    realName: "",
    cert: "Instructor",
    specialty: [],
    feePerDive: 1500,
    note: "",
    lineUserId: "",
    active: true,
    isNew: true,
  };
}

export default function AdminCoachesPage() {
  const liff = useLiff();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<
    (Partial<Coach> & { isNew?: boolean }) | null
  >(null);
  const [specialtyInput, setSpecialtyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      const data = await liff.fetchWithAuth<{ coaches: Coach[] }>(
        `/api/admin/coaches${showInactive ? "?includeInactive=1" : ""}`,
      );
      setCoaches(data.coaches);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff, showInactive]);

  function startEdit(c: Coach) {
    setEditing({ ...c });
    setSpecialtyInput((c.specialty ?? []).join(", "));
  }

  function startNew() {
    setEditing(newCoachDraft());
    setSpecialtyInput("");
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const specialty = specialtyInput
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = { ...editing, specialty };
      if (editing.isNew) {
        await liff.fetchWithAuth("/api/admin/coaches", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await liff.fetchWithAuth(`/api/admin/coaches/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      setEditing(null);
      await reload();
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function softDelete(c: Coach) {
    if (!confirm(`停用教練「${c.realName}」？（可以再啟用）`)) return;
    try {
      await liff.fetchWithAuth(`/api/admin/coaches/${c.id}`, {
        method: "DELETE",
      });
      await reload();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function permaDelete(c: Coach) {
    const ok1 = confirm(
      `⚠ 永久刪除教練「${c.realName}」？\n\n這個動作無法復原。若這個教練還被任何場次引用會被擋下。`,
    );
    if (!ok1) return;
    const ok2 = prompt(`為了安全，請輸入「DELETE」確認永久刪除：`);
    if (ok2 !== "DELETE") {
      alert("取消刪除（沒輸入 DELETE）");
      return;
    }
    try {
      await liff.fetchWithAuth(
        `/api/admin/coaches/${c.id}?permanent=true`,
        { method: "DELETE" },
      );
      await reload();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function toggleActive(c: Coach) {
    try {
      await liff.fetchWithAuth(`/api/admin/coaches/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      await reload();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <LiffShell title="教練管理" backHref="/liff/admin/dashboard">
      <div className="px-4 pt-4 space-y-2">
        {error && (
          <Card className="bg-[var(--color-coral)]/15 p-3 text-sm">
            {error}
          </Card>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            含已停用
          </label>
          <Button size="sm" onClick={startNew}>
            <Plus className="h-4 w-4" /> 新增教練
          </Button>
        </div>

        <div className="rounded-lg bg-[var(--muted)]/40 p-2 text-[11px] text-[var(--muted-foreground)]">
          說明：教練「沒有基本費用」概念，每位教練直接設定「<b>每一支潛水的費用 (NT$/dive)</b>」。
          開團排教練時系統可參考此費率計算成本。
        </div>

        {coaches.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
            還沒有任何教練。
          </div>
        )}

        {coaches.map((c) => (
          <Card key={c.id} className={cn(!c.active && "opacity-50")}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <User className="h-3.5 w-3.5 text-[var(--color-phosphor)]" />
                    <span className="font-bold text-sm">{c.realName}</span>
                    <Badge variant="ocean" className="text-[10px]">
                      {CERTS.find((x) => x.id === c.cert)?.label ?? c.cert}
                    </Badge>
                    {!c.active && (
                      <Badge variant="coral" className="text-[10px]">
                        已停用
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--muted-foreground)] font-mono">
                    id: {c.id}
                  </div>
                  <div className="mt-1 text-sm font-bold tabular text-[var(--color-gold)]">
                    每支潛水 NT$ {c.feePerDive.toLocaleString()}
                  </div>
                  {c.specialty.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.specialty.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] rounded-full bg-[var(--muted)] px-2 py-0.5"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {c.note && (
                    <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                      {c.note}
                    </div>
                  )}
                  {c.lineUserId && (
                    <div className="mt-1 text-[10px] text-[var(--muted-foreground)] font-mono break-all">
                      LINE: {c.lineUserId}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(c)}
                    title="編輯"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  {c.active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => softDelete(c)}
                      title="停用"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(c)}
                        title="重新啟用"
                      >
                        ↻
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => permaDelete(c)}
                        title="永久刪除（雙重確認）"
                        className="border-[var(--color-coral)]"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.isNew ? "新增教練" : "編輯教練"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">id (英數)</Label>
                  <Input
                    value={editing.id ?? ""}
                    disabled={!editing.isNew}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        id: e.target.value.toLowerCase(),
                      })
                    }
                    placeholder="例：coach_lin"
                  />
                </div>
                <div>
                  <Label className="text-xs">姓名</Label>
                  <Input
                    value={editing.realName ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, realName: e.target.value })
                    }
                    placeholder="小林"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">證照等級</Label>
                <select
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  value={editing.cert ?? "Instructor"}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      cert: e.target.value as Coach["cert"],
                    })
                  }
                >
                  {CERTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">
                  每支潛水費用 (NT$/dive) — 此教練每帶一支潛水的成本
                </Label>
                <Input
                  type="number"
                  value={editing.feePerDive ?? 0}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      feePerDive: Number(e.target.value),
                    })
                  }
                  placeholder="1500"
                />
              </div>

              <div>
                <Label className="text-xs">
                  專長 (用逗號或頓號分隔，例：水攝, 夜潛, OW 教學)
                </Label>
                <Input
                  value={specialtyInput}
                  onChange={(e) => setSpecialtyInput(e.target.value)}
                  placeholder="水攝, 夜潛, 沉船"
                />
              </div>

              <div>
                <Label className="text-xs">備註</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={2}
                  value={editing.note ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, note: e.target.value })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">LINE userId (可選 — 綁定教練端)</Label>
                <Input
                  value={editing.lineUserId ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, lineUserId: e.target.value })
                  }
                  placeholder="U..."
                />
              </div>

              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) =>
                    setEditing({ ...editing, active: e.target.checked })
                  }
                />
                啟用中（可被排團）
              </label>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  取消
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </LiffShell>
  );
}
