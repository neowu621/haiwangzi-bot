"use client";
// v911：後台「本週潛水精選」影片管理 —— 貼 YouTube 網址自動抓 id/縮圖，填標題/簡介、選分類、排序、刪除。
//   存 siteConfig.featuredDiveVideos（PATCH /api/admin/site-config）。
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import {
  DEFAULT_DIVE_VIDEOS, parseYouTubeId, isShortsUrl, ytThumb, type DiveVideo,
} from "@/lib/dive-videos";

export function FeaturedVideosEditor() {
  const [list, setList] = useState<DiveVideo[]>([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ config: { featuredDiveVideos?: DiveVideo[] } }>("/api/admin/site-config")
      .then((r) => setList(r.config.featuredDiveVideos ?? DEFAULT_DIVE_VIDEOS))
      .catch(() => setList(DEFAULT_DIVE_VIDEOS))
      .finally(() => setLoading(false));
  }, []);

  const upd = (i: number, patch: Partial<DiveVideo>) =>
    setList((l) => l.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const del = (i: number) => setList((l) => l.filter((_, j) => j !== i));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const x = [...l]; [x[i], x[j]] = [x[j], x[i]]; return x;
    });

  function add() {
    const id = parseYouTubeId(url);
    if (!id) { setMsg("網址看不出 YouTube 影片 ID，請確認"); return; }
    if (list.some((v) => v.id === id)) { setMsg("這支影片已在清單裡"); return; }
    setList((l) => [...l, { id, isShort: isShortsUrl(url), category: "best", title: "", desc: "" }]);
    setUrl(""); setMsg(null);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await adminFetch("/api/admin/site-config", {
        method: "PATCH",
        body: JSON.stringify({ featuredDiveVideos: list }),
      });
      setMsg("✓ 已儲存，首頁與 /api/config 已更新");
    } catch (e) {
      setMsg("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">載入中…</div>;

  const latestCount = list.filter((v) => v.category === "latest").length;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        首頁「🎬 本週潛水精選」卡片。<b>🆕 本週最新</b> 建議設 1 支（大卡）、<b>⭐ 近期最佳</b> 3–4 支（小卡）。點卡片直接開 YouTube。
        {latestCount === 0 && <span className="text-amber-600"> ⚠ 目前沒有「本週最新」，首頁會用第一支當大卡。</span>}
        {latestCount > 1 && <span className="text-amber-600"> ⚠ 有 {latestCount} 支標為「本週最新」，首頁只會用第一支當大卡。</span>}
      </p>

      {/* 加入 */}
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="貼 YouTube 網址（watch / youtu.be / shorts 都可）…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          className="flex-1 min-w-[220px]"
        />
        <Button size="sm" variant="outline" onClick={add}>＋ 加入影片</Button>
      </div>

      {/* 清單 */}
      <div className="space-y-2">
        {list.length === 0 && <div className="text-xs text-[var(--muted-foreground)]">尚無影片，貼上網址加入。</div>}
        {list.map((v, i) => (
          <div key={v.id} className="flex gap-3 rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ytThumb(v.id)} alt="" className="h-14 w-24 flex-none rounded object-cover" style={{ background: "#0a2a44" }} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Input placeholder="標題（首頁顯示）" value={v.title} onChange={(e) => upd(i, { title: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="一句簡介（大卡才顯示，可留空）" value={v.desc} onChange={(e) => upd(i, { desc: e.target.value })} className="h-8 text-xs" />
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md bg-[var(--muted)] p-0.5 text-[11px]">
                  {(["latest", "best"] as const).map((cat) => (
                    <button key={cat} type="button" onClick={() => upd(i, { category: cat })}
                      className={`rounded px-2 py-1 font-medium ${v.category === cat ? "bg-white text-[var(--color-ocean-deep)] shadow-sm" : "text-[var(--muted-foreground)]"}`}>
                      {cat === "latest" ? "🆕 本週最新" : "⭐ 近期最佳"}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
                  <input type="checkbox" checked={v.isShort} onChange={(e) => upd(i, { isShort: e.target.checked })} /> Shorts
                </label>
                <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="text-[11px] text-sky-600 underline">預覽</a>
                <div className="ml-auto flex gap-0.5">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => del(i)} className="rounded p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-1">
        {msg && <span className={`text-xs ${msg.startsWith("✓") ? "text-emerald-600" : "text-rose-600"}`}>{msg}</span>}
        <Button size="sm" className="ml-auto" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }} onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-4 w-4" />{saving ? "儲存中…" : "儲存影片精選"}
        </Button>
      </div>
    </div>
  );
}
