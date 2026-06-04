"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit3, Trash2, Eye, EyeOff, Pin, PinOff, ExternalLink } from "lucide-react";
import { cn, toTaipeiDateString } from "@/lib/utils";

interface MediaPost {
  id: string;
  source: string;
  externalId: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string;
  publishedAt: string;
  visible: boolean;
  pinned: boolean;
  createdAt: string;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: "手動", color: "muted" },
  youtube: { label: "YouTube", color: "coral" },
  facebook: { label: "Facebook", color: "ocean" },
  instagram: { label: "Instagram", color: "gold" },
};

const BLANK = {
  title: "",
  description: "",
  imageUrl: "",
  linkUrl: "",
  publishedAt: new Date().toISOString().slice(0, 16), // yyyy-MM-ddTHH:mm
  visible: true,
  pinned: false,
};

const primaryBtn: React.CSSProperties = {
  background: "var(--color-phosphor)",
  color: "var(--color-ocean-deep)",
};

export default function AdminMediaPostsPage() {
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<{ posts: MediaPost[] }>("/api/admin/media-posts");
      setPosts(data.posts ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ ...BLANK, publishedAt: new Date().toISOString().slice(0, 16) });
    setEditingId(null);
    setDialogMode("create");
  }

  function openEdit(p: MediaPost) {
    setForm({
      title: p.title,
      description: p.description ?? "",
      imageUrl: p.imageUrl ?? "",
      linkUrl: p.linkUrl,
      publishedAt: new Date(p.publishedAt).toISOString().slice(0, 16),
      visible: p.visible,
      pinned: p.pinned,
    });
    setEditingId(p.id);
    setDialogMode("edit");
  }

  async function save() {
    if (!form.title.trim() || !form.linkUrl.trim()) {
      alert("標題與連結為必填");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description || null,
        imageUrl: form.imageUrl || null,
        linkUrl: form.linkUrl,
        publishedAt: new Date(form.publishedAt).toISOString(),
        visible: form.visible,
        pinned: form.pinned,
      };
      if (dialogMode === "create") {
        await adminFetch("/api/admin/media-posts", {
          method: "POST",
          body: JSON.stringify({ ...body, source: "manual" }),
        });
      } else if (editingId) {
        await adminFetch(`/api/admin/media-posts/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      }
      await load();
      setDialogMode(null);
    } catch (e) {
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(p: MediaPost) {
    try {
      await adminFetch(`/api/admin/media-posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ visible: !p.visible }),
      });
      await load();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function togglePinned(p: MediaPost) {
    try {
      await adminFetch(`/api/admin/media-posts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !p.pinned }),
      });
      await load();
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function remove(p: MediaPost) {
    if (!confirm(`刪除「${p.title}」？`)) return;
    try {
      await adminFetch(`/api/admin/media-posts/${p.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <AdminShell title="最新動態管理">
      <div className="space-y-4">
        {err && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>
            {err}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-[var(--muted-foreground)]">
            這裡 post 的內容會顯示在客戶端「📱 最新動態」頁。可置頂、隱藏、設定發布時間。
          </div>
          <Button size="sm" style={primaryBtn} onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" /> 新增動態
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                  <th className="px-4 py-3 font-medium w-20">圖片</th>
                  <th className="px-4 py-3 font-medium">標題 / 連結</th>
                  <th className="px-4 py-3 font-medium">來源</th>
                  <th className="px-4 py-3 font-medium">發布日</th>
                  <th className="px-4 py-3 font-medium text-center">置頂</th>
                  <th className="px-4 py-3 font-medium text-center">顯示</th>
                  <th className="px-4 py-3 font-medium w-32">操作</th>
                </tr>
              </thead>
              <tbody>
                {posts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
                      尚無動態。點右上「新增動態」開始發布。
                    </td>
                  </tr>
                ) : posts.map((p, i) => (
                  <tr key={p.id} className={cn("border-t", i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20", !p.visible && "opacity-50")} style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-12 w-16 rounded-md object-cover border" style={{ borderColor: "var(--border)" }} />
                      ) : (
                        <div className="h-12 w-16 rounded-md bg-[var(--muted)] flex items-center justify-center text-xs text-[var(--muted-foreground)]">
                          無圖
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-sm">{p.title}</div>
                      <a href={p.linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-blue-600 hover:underline">
                        <ExternalLink className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[300px]">{p.linkUrl}</span>
                      </a>
                      {p.description && (
                        <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5 line-clamp-1">{p.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const meta = SOURCE_LABELS[p.source] ?? { label: p.source, color: "muted" };
                        return <Badge variant={meta.color as "muted" | "ocean" | "coral" | "gold"} className="text-[10px]">{meta.label}</Badge>;
                      })()}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted-foreground)] tabular-nums">
                      {toTaipeiDateString(p.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => togglePinned(p)} className="rounded p-1 hover:bg-[var(--muted)]" title={p.pinned ? "取消置頂" : "置頂"}>
                        {p.pinned ? <Pin className="h-4 w-4 text-emerald-600" /> : <PinOff className="h-4 w-4 text-[var(--muted-foreground)]" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleVisible(p)} className="rounded p-1 hover:bg-[var(--muted)]" title={p.visible ? "隱藏" : "顯示"}>
                        {p.visible ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-[var(--muted-foreground)]" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="rounded p-1.5 hover:bg-[var(--muted)] text-[var(--muted-foreground)]" title="編輯">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove(p)} className="rounded p-1.5 hover:bg-[var(--color-coral)]/10" style={{ color: "var(--color-coral)" }} title="刪除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(o) => { if (!o) setDialogMode(null); }}>
        <DialogContent className="max-w-lg bg-white text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              {dialogMode === "create" ? "新增動態" : "編輯動態"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">標題 *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例：龍洞夜潛精彩花絮" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">連結 URL *</Label>
              <Input type="url" value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." />
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">客戶點擊後跳轉到此網址（YouTube / IG / FB / 部落格 等）</p>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">封面圖片 URL（選填）</Label>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://...jpg" />
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">建議 16:9 比例。YouTube 縮圖格式：https://img.youtube.com/vi/影片ID/maxresdefault.jpg</p>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">說明（選填）</Label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] resize-none" />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">發布時間</Label>
              <Input type="datetime-local" value={form.publishedAt} onChange={(e) => setForm({ ...form, publishedAt: e.target.value })} />
              <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">影響排序（最新在上）。未來時間也可，會等到時間到才顯示</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.visible} onChange={(e) => setForm({ ...form, visible: e.target.checked })} />
                顯示（取消則客戶看不到）
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                置頂
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDialogMode(null)}>取消</Button>
              <Button size="sm" style={primaryBtn} onClick={save} disabled={saving || !form.title.trim() || !form.linkUrl.trim()}>
                {saving ? "儲存中..." : "儲存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
