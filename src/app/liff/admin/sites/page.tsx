"use client";
import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, MapPin, Youtube } from "lucide-react";
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

interface Site {
  id: string;
  name: string;
  region: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  maxDepth: number;
  features: string[];
  images: string[];
  youtubeUrl: string | null;
  cautions: string | null;
}

const REGIONS = [
  { id: "northeast", label: "東北角" },
  { id: "green_island", label: "綠島" },
  { id: "lanyu", label: "蘭嶼" },
  { id: "kenting", label: "墾丁" },
  { id: "other", label: "其他" },
] as const;

const DIFFICULTIES = [
  { id: "easy", label: "簡單" },
  { id: "medium", label: "中等" },
  { id: "hard", label: "困難" },
] as const;

function regionLabel(r: string) {
  return REGIONS.find((x) => x.id === r)?.label ?? r;
}

function newSiteDraft(): Partial<Site> & { isNew?: boolean } {
  return {
    id: "",
    name: "",
    region: "northeast",
    description: "",
    difficulty: "medium",
    maxDepth: 18,
    features: [],
    images: [],
    youtubeUrl: "",
    cautions: "",
    isNew: true,
  };
}

export default function AdminSitesPage() {
  const liff = useLiff();
  const [sites, setSites] = useState<Site[]>([]);
  const [editing, setEditing] = useState<
    (Partial<Site> & { isNew?: boolean }) | null
  >(null);
  const [featuresInput, setFeaturesInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    try {
      const data = await liff.fetchWithAuth<Site[]>("/api/admin/sites");
      setSites(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  function startEdit(s: Site) {
    setEditing({ ...s });
    setFeaturesInput((s.features ?? []).join(", "));
  }

  function startNew() {
    setEditing(newSiteDraft());
    setFeaturesInput("");
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const features = featuresInput
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        ...editing,
        features,
      };
      if (editing.isNew) {
        await liff.fetchWithAuth("/api/admin/sites", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await liff.fetchWithAuth(`/api/admin/sites/${editing.id}`, {
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

  async function remove(s: Site) {
    if (!confirm(`確定刪除潛點「${s.name}」？\n若已被場次引用會被阻擋。`))
      return;
    try {
      await liff.fetchWithAuth(`/api/admin/sites/${s.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <LiffShell title="潛點管理" backHref="/liff/admin/dashboard">
      <div className="px-4 pt-4 space-y-2">
        {error && (
          <Card className="bg-[var(--color-coral)]/15 p-3 text-sm">
            {error}
          </Card>
        )}

        <Button className="w-full" onClick={startNew}>
          <Plus className="h-4 w-4" /> 新增潛點
        </Button>

        {sites.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
            還沒有任何潛點。點上面「新增潛點」開始建檔。
          </div>
        )}

        {sites.map((s) => (
          <Card key={s.id}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <MapPin className="h-3.5 w-3.5 text-[var(--color-phosphor)]" />
                    <span className="font-bold text-sm">{s.name}</span>
                    <Badge variant="muted" className="text-[10px]">
                      {regionLabel(s.region)}
                    </Badge>
                    <Badge
                      variant={
                        s.difficulty === "hard"
                          ? "coral"
                          : s.difficulty === "easy"
                            ? "ocean"
                            : "muted"
                      }
                      className="text-[10px]"
                    >
                      {DIFFICULTIES.find((d) => d.id === s.difficulty)?.label}
                    </Badge>
                    <span className="text-[10px] text-[var(--muted-foreground)] tabular">
                      最深 {s.maxDepth}m
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--muted-foreground)] font-mono">
                    id: {s.id}
                  </div>
                  {s.description && (
                    <div className="mt-1 text-xs line-clamp-2 text-[var(--muted-foreground)]">
                      {s.description}
                    </div>
                  )}
                  {s.features.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.features.map((f) => (
                        <span
                          key={f}
                          className="text-[10px] rounded-full bg-[var(--muted)] px-2 py-0.5"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {s.youtubeUrl && (
                    <a
                      href={s.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--color-coral)]"
                    >
                      <Youtube className="h-3 w-3" /> YouTube
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startEdit(s)}
                    title="編輯"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(s)}
                    title="刪除"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                  </Button>
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
              {editing?.isNew ? "新增潛點" : "編輯潛點"}
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
                    placeholder="例：longdong_82_8"
                  />
                </div>
                <div>
                  <Label className="text-xs">名稱</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, name: e.target.value })
                    }
                    placeholder="例：龍洞 82.8"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">區域</Label>
                  <select
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                    value={editing.region ?? "northeast"}
                    onChange={(e) =>
                      setEditing({ ...editing, region: e.target.value })
                    }
                  >
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">難度</Label>
                  <select
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                    value={editing.difficulty ?? "medium"}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        difficulty: e.target.value as Site["difficulty"],
                      })
                    }
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-xs">最大深度 (公尺)</Label>
                <Input
                  type="number"
                  value={editing.maxDepth ?? 0}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxDepth: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label className="text-xs">介紹</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={3}
                  value={editing.description ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                  placeholder="景點特色、地形概況..."
                />
              </div>

              <div>
                <Label className="text-xs">
                  特色 (用逗號或頓號分隔，例：軟珊瑚, 燈塔, 沉船)
                </Label>
                <Input
                  value={featuresInput}
                  onChange={(e) => setFeaturesInput(e.target.value)}
                  placeholder="軟珊瑚, 海扇, 燈塔"
                />
              </div>

              <div>
                <Label className="text-xs">注意事項 (流況/能見度等)</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={2}
                  value={editing.cautions ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, cautions: e.target.value })
                  }
                  placeholder="水流較強 / 注意湧浪..."
                />
              </div>

              <div>
                <Label className="text-xs">YouTube 介紹影片 URL</Label>
                <Input
                  value={editing.youtubeUrl ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, youtubeUrl: e.target.value })
                  }
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>

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
