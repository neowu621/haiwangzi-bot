"use client";
// v946：後台「潛點主題播放清單牆」管理 —— 貼 YT 播放清單網址加入，填地點名稱；
//   縮圖：A 貼代表影片網址(用其 YT 縮圖) / B 上傳封面照(優先於 A)。排序、刪除、存 siteConfig.homePlaylists。
import { useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Trash2, ArrowUp, ArrowDown, Upload } from "lucide-react";
import { parseYouTubeId } from "@/lib/dive-videos";
import {
  DEFAULT_HOME_PLAYLISTS, parsePlaylistId, playlistUrl, playlistThumb, type HomePlaylist,
} from "@/lib/home-playlists";

export function HomePlaylistsEditor() {
  const [list, setList] = useState<HomePlaylist[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    adminFetch<{ config: { homePlaylists?: HomePlaylist[] } }>("/api/admin/site-config")
      .then((r) => setList(r.config.homePlaylists ?? DEFAULT_HOME_PLAYLISTS))
      .catch(() => setList(DEFAULT_HOME_PLAYLISTS))
      .finally(() => setLoading(false));
  }, []);

  const upd = (i: number, patch: Partial<HomePlaylist>) =>
    setList((l) => l.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const del = (i: number) => setList((l) => l.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => { const j = i + d; if (j < 0 || j >= l.length) return l; const x = [...l]; [x[i], x[j]] = [x[j], x[i]]; return x; });

  function add() {
    const id = parsePlaylistId(url);
    if (!id) { setMsg("網址看不出播放清單 ID（需含 list=…）"); return; }
    if (list.some((v) => v.playlistId === id)) { setMsg("這個播放清單已在牆上"); return; }
    setList((l) => [...l, { playlistId: id, title: "", coverVideoId: "", coverImageUrl: "" }]);
    setUrl(""); setMsg(null);
  }

  // v947：上傳前自動最佳化 —— 裁成 16:9（cover）、壓成 WebP、寬 640，手機也輕量
  async function optimizeToWebp(file: File): Promise<Blob> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file);
    });
    const TW = 640, TH = 360; // 16:9
    const canvas = document.createElement("canvas"); canvas.width = TW; canvas.height = TH;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(img.src); return file; }
    const scale = Math.max(TW / img.width, TH / img.height); // cover
    const w = img.width * scale, h = img.height * scale;
    ctx.drawImage(img, (TW - w) / 2, (TH - h) / 2, w, h);
    URL.revokeObjectURL(img.src);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/webp", 0.82));
    return blob ?? file;
  }

  async function uploadCover(i: number, file: File) {
    setUploadingIdx(i); setMsg(null);
    try {
      let body: Blob = file, contentType = file.type, filename = file.name;
      try { // 最佳化失敗就退回原圖，不擋上傳
        body = await optimizeToWebp(file); contentType = "image/webp"; filename = file.name.replace(/\.[^.]+$/, "") + ".webp";
      } catch { /* fallback 原圖 */ }
      const presign = await adminFetch<{ url: string; publicUrl: string | null }>("/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ prefix: "media", filename, contentType }),
      });
      const put = await fetch(presign.url, { method: "PUT", headers: { "Content-Type": contentType }, body });
      if (!put.ok) throw new Error(`上傳失敗 (${put.status})`);
      if (!presign.publicUrl) throw new Error("無公開網址");
      upd(i, { coverImageUrl: presign.publicUrl });
      setMsg(`✓ 封面已最佳化上傳（${Math.round(body.size / 1024)}KB），記得按下方儲存`);
    } catch (e) {
      setMsg("封面上傳失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setUploadingIdx(null);
    }
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await adminFetch("/api/admin/site-config", { method: "POST", body: JSON.stringify({ homePlaylists: list }) });
      setMsg("✓ 已儲存，首頁與 /api/config 已更新");
    } catch (e) {
      setMsg("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">載入中…</div>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        首頁「🌊 潛點主題影片」磚牆。點磚 → 開該 YouTube <b>播放清單</b>。縮圖：<b>貼一支代表影片網址</b>（用它的縮圖），或 <b>上傳封面照</b>（優先）。
        <br />📐 封面照<b>不用管尺寸</b> —— 上傳後系統會自動裁成 16:9、壓成 WebP（約 30–60KB），手機也順。
      </p>

      {/* 加入 */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="貼 YouTube 播放清單網址（含 list=…）…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex-1 min-w-[240px]"
        />
        <Button size="sm" variant="outline" onClick={add}>＋ 加入清單</Button>
      </div>

      {/* 清單 */}
      <div className="space-y-2">
        {list.length === 0 && <div className="text-xs text-[var(--muted-foreground)]">尚無播放清單，貼上網址加入。</div>}
        {list.map((v, i) => {
          const thumb = playlistThumb(v);
          return (
            <div key={v.playlistId} className="flex gap-3 rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
              {/* 縮圖預覽 */}
              <div className="h-16 w-28 flex-none overflow-hidden rounded" style={{ background: "linear-gradient(135deg,#0e4c6a,#0a2a44)" }}>
                {thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumb} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full w-full items-center justify-center text-[10px] text-white/70">無縮圖</div>}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Input placeholder="地點名稱（首頁顯示）" value={v.title} onChange={(e) => upd(i, { title: e.target.value })} className="h-8 text-xs" />
                <Input
                  placeholder="代表影片網址（縮圖用，可留空）"
                  defaultValue={v.coverVideoId ? `https://youtu.be/${v.coverVideoId}` : ""}
                  onChange={(e) => { const id = parseYouTubeId(e.target.value); upd(i, { coverVideoId: id ?? "" }); }}
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <a href={playlistUrl(v.playlistId)} target="_blank" rel="noreferrer" className="text-[11px] text-sky-600 underline">預覽清單</a>
                  <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{v.playlistId.slice(0, 22)}{v.playlistId.length > 22 ? "…" : ""}</span>
                  <button type="button" onClick={() => fileRefs.current[i]?.click()} disabled={uploadingIdx === i}
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-[var(--muted-foreground)] hover:bg-slate-50" style={{ borderColor: "var(--border)" }}>
                    <Upload className="h-3 w-3" />{uploadingIdx === i ? "上傳中…" : v.coverImageUrl ? "換封面" : "上傳封面"}
                  </button>
                  {v.coverImageUrl && <button type="button" onClick={() => upd(i, { coverImageUrl: "" })} className="text-[11px] text-rose-500 underline">移除封面</button>}
                  <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/*" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(i, f); e.target.value = ""; }} />
                  <div className="ml-auto flex gap-0.5">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => del(i)} className="rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {msg && <span className={`text-xs ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>}
        <Button size="sm" className="ml-auto" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }} onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />{saving ? "儲存中…" : "儲存播放清單牆"}
        </Button>
      </div>
    </div>
  );
}
