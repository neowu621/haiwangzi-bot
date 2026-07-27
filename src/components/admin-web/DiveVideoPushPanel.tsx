"use client";
// v912/v923：首頁精選影片「每日推播」—— 挑一則影片、帶影片連結傳給會員。站內為主 + 可加 Email。
//   每天最多一則(系統擋)；預覽/試送/送出。
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import type { DiveVideo } from "@/lib/dive-videos";

type Audience = "all" | "active30" | "vip5";
interface Preview { count: number; inapp: number; email: number; preview: { title: string; body: string; videoTitle?: string; watch?: string }; lastPushAt: string | null; locked: boolean }

const AUD_LABEL: Record<Audience, string> = { all: "全體會員", active30: "近 30 天活躍", vip5: "VIP LV5" };

export function DiveVideoPushPanel() {
  const [videos, setVideos] = useState<DiveVideo[]>([]);
  const [videoId, setVideoId] = useState("");
  const [inapp, setInapp] = useState(true);
  const [email, setEmail] = useState(false);
  const [audience, setAudience] = useState<Audience>("all");
  const [pv, setPv] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<{ config: { featuredDiveVideos?: DiveVideo[] } }>("/api/admin/site-config")
      .then((r) => {
        const vs = r.config.featuredDiveVideos ?? [];
        setVideos(vs);
        const latest = vs.find((v) => v.category === "latest") ?? vs[0];
        if (latest) setVideoId(latest.id);
      })
      .catch(() => {});
  }, []);

  const channels = () => [...(inapp ? ["inapp"] : []), ...(email ? ["email"] : [])];

  async function call(mode: "preview" | "send", testSelf = false) {
    if (channels().length === 0) { setMsg("請至少選一個通道"); return; }
    if (!videoId) { setMsg("請先選一支影片"); return; }
    if (mode === "send" && !testSelf && !window.confirm(`確定推播給「${AUD_LABEL[audience]}」？`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await adminFetch<Preview & { ok?: boolean; inapp?: number; email?: number }>("/api/admin/dive-videos/push", {
        method: "POST",
        body: JSON.stringify({ videoId, channels: channels(), audience, mode, testSelf }),
      });
      if (mode === "preview") { setPv(r as Preview); setMsg(null); }
      else { setMsg(testSelf ? "✓ 已試送給你自己" : `✓ 已推播 — 站內 ${r.inapp ?? 0} 筆、Email ${r.email ?? 0} 筆`); setPv(null); }
    } catch (e) {
      setMsg("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally { setBusy(false); }
  }

  const lockedNote = pv?.locked ? "🔒 今天已經推過一則了，明天再推（每天最多一則）。" : null;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        <b>每天挑一則</b>精選影片傳給會員（<b>帶影片連結、站內為主、不佔 LINE 額度</b>）。<b>預設不會自動發</b> —— 你按「推播」才送。<b>每天最多一則</b>（系統會擋）。
      </p>

      {/* 挑影片 */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--muted-foreground)]">要推的影片</span>
        <select value={videoId} onChange={(e) => setVideoId(e.target.value)}
          className="min-w-0 flex-1 rounded-md border bg-white px-2 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
          {videos.length === 0 && <option value="">（尚無影片，請先到上方新增）</option>}
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.category === "latest" ? "🆕 " : "⭐ "}{v.title || v.id}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="font-semibold text-[var(--muted-foreground)]">通道</span>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={inapp} onChange={(e) => setInapp(e.target.checked)} /> 🔔 站內（建議）</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> ✉️ Email</label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--muted-foreground)]">對象</span>
        <div className="inline-flex rounded-md bg-[var(--muted)] p-0.5">
          {(["all", "active30", "vip5"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAudience(a)}
              className={`rounded px-2.5 py-1 font-medium ${audience === a ? "bg-white text-[var(--color-ocean-deep)] shadow-sm" : "text-[var(--muted-foreground)]"}`}>
              {AUD_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => call("preview")} disabled={busy}>👁 預覽人數／內容</Button>
        <Button size="sm" variant="outline" onClick={() => call("send", true)} disabled={busy}>📨 試送給自己</Button>
        <Button size="sm" style={{ background: "var(--color-coral)", color: "#fff" }} onClick={() => call("send")} disabled={busy || !!pv?.locked}>
          🚀 推播給會員
        </Button>
      </div>

      {lockedNote && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{lockedNote}</div>}
      {msg && <div className={`rounded-md px-3 py-2 text-xs ${msg.startsWith("✓") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{msg}</div>}

      {pv && (
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
          <div className="mb-2 flex flex-wrap gap-3 font-semibold">
            <span>預估對象 <b className="text-[var(--color-ocean-deep)]">{pv.count}</b> 人</span>
            {inapp && <span>站內 {pv.inapp}</span>}
            {email && <span>Email {pv.email}</span>}
          </div>
          <div className="rounded-md bg-[var(--muted)]/40 p-2.5 whitespace-pre-line leading-relaxed">
            <b>{pv.preview.title}</b>{"\n"}{pv.preview.body}
            {pv.preview.watch && <>{"\n"}<span className="text-sky-600 underline">{pv.preview.watch}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}
