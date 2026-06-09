"use client";
// v429: 最新動態影片牆 client island（從 page.tsx 抽出）。
//   - 讀 /api/config → { homeVideosMode, homeVideos, ... }；auto 模式打 /api/youtube/recent
//   - 4 格 9:16 facade，點擊開 lightbox 播放（含 playing 狀態、Esc 關閉、鎖捲動、iframe）
//   - 完整保留 v403/v406/v407B/v417/v417b/v423b 的去重 / 亂數抽 4 支邏輯
import { useEffect, useRef, useState } from "react";
import { YT_CHANNEL, IG_URL, FB_URL } from "./data";

type YtVideo = { id: string; title: string; isShort: boolean };

// 內建保底（DB 為空、API 全炸時最後一道防線）
const BUILTIN_FALLBACK_VIDS: YtVideo[] = [
  { id: "8nDJqaDl_sM", title: "萊萊鶯歌石剪輯", isShort: true },
  { id: "04q6aMx_4U4", title: "海王子潛水", isShort: false },
  { id: "0XE0lzv7jpY", title: "海王子 Shorts", isShort: true },
  { id: "z-eu3lGy8vQ", title: "海王子 Shorts", isShort: true },
  { id: "SqlGVHXuBOE", title: "海王子潛水", isShort: false },
];

export default function NewsVideos() {
  const [videos, setVideos] = useState<YtVideo[]>(BUILTIN_FALLBACK_VIDS);
  const [videosLoading, setVideosLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loaderHide, setLoaderHide] = useState(false);
  const marqueeRef = useRef<HTMLDivElement>(null);

  // v431：輪播只在「捲到畫面內」才跑動畫（IntersectionObserver 切換 .run）→ 首屏不動、省資源、不影響 Speed Index
  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => el.classList.toggle("run", e.isIntersecting)),
      { rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [videosLoading]);

  // v403：最新動態影片清單從 /api/config 取，模式由 admin 後台控制
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetch("/api/config").then((r) => r.json()).catch(() => null) as
          | { homeVideosMode?: "curated" | "auto"; homeVideos?: YtVideo[];
              homeVideoFeaturedId?: string; homeVideoCount?: number;
              homeVideoExcludeIds?: string[]; homeVideoFilter?: "all" | "long" }
          | null;
        if (cancelled) return;
        const mode = cfg?.homeVideosMode ?? "curated";
        const curated = Array.isArray(cfg?.homeVideos) && cfg!.homeVideos!.length > 0
          ? cfg!.homeVideos!
          : BUILTIN_FALLBACK_VIDS;
        // 取基底清單
        let base: YtVideo[] = curated;
        if (mode === "auto") {
          try {
            const data = await fetch("/api/youtube/recent").then((r) => r.json()) as { videos?: YtVideo[] };
            if (cancelled) return;
            base = Array.isArray(data.videos) && data.videos.length > 0 ? data.videos : curated;
          } catch { base = curated; }
        }
        // v406：排除 → 長片濾鏡 → 精選置頂 → 限制數量
        const exclude = new Set((cfg?.homeVideoExcludeIds ?? []).map((s) => (s ?? "").trim()).filter(Boolean));
        const filter = cfg?.homeVideoFilter ?? "all";
        const count = Math.max(1, Math.min(12, cfg?.homeVideoCount ?? 8));
        const featuredId = (cfg?.homeVideoFeaturedId ?? "").trim();
        // 去重：依 id + 標題（v430）。同一支影片若被用兩個不同 id 重複貼入，靠標題也能去掉，
        //   確保亂數抽出的 4 支彼此不同、不會出現重複縮圖。
        const seenIds = new Set<string>();
        const seenTitles = new Set<string>();
        let list = base.filter((v) => {
          const id = (v?.id ?? "").trim();
          if (!id || exclude.has(id) || seenIds.has(id)) return false;
          const title = (v?.title ?? "").trim().toLowerCase();
          if (title && seenTitles.has(title)) return false;
          seenIds.add(id);
          if (title) seenTitles.add(title);
          return true;
        });
        if (filter === "long") list = list.filter((v) => !v.isShort);
        // v417b：策展模式從清單亂數抽取（每次進站隨機 4 支）；精選置頂仍固定在最前
        const shuffle = (a: YtVideo[]) => {
          const x = [...a];
          for (let i = x.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [x[i], x[j]] = [x[j], x[i]];
          }
          return x;
        };
        if (featuredId) {
          const found = list.find((v) => v.id === featuredId);
          let rest = list.filter((v) => v.id !== featuredId);
          if (mode === "curated") rest = shuffle(rest);
          list = [found ?? { id: featuredId, title: "精選影片", isShort: false }, ...rest];
        } else if (mode === "curated") {
          list = shuffle(list);
        }
        list = list.slice(0, count);
        if (list.length === 0) list = BUILTIN_FALLBACK_VIDS.slice(0, count);
        if (!cancelled) setVideos(list);
      } finally {
        if (!cancelled) setVideosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // feed-loader 自動隱藏計時器
  useEffect(() => {
    const t = window.setTimeout(() => setLoaderHide(true), 1100);
    return () => window.clearTimeout(t);
  }, []);

  // v407B：Lightbox 開啟時鎖背景捲動 + Esc 關閉
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlaying(null); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [playing]);

  return (
    <div className="wrap">
      <div className={`feed-loader${loaderHide ? " hide" : ""}`}>
        <div className="trident-anim"><svg viewBox="0 0 48 48" fill="none"><path d="M24 4v40M24 8l-5 5M24 8l5 5M11 16c0 6 4 10 13 10s13-4 13-10M11 16v-4M37 16v-4M16 12v6M32 12v6" stroke="#66d8f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <span className="lt">載入最新動態…</span>
      </div>
      <div className="sec-head reveal"><span className="eyebrow">News &amp; Updates</span><h2 className="section-title">最新動態</h2><p>最新潛水影片整合在這裡，一次看完。</p></div>
      {videosLoading ? (
        <div className="reveal" style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.6)" }}>
          載入最新影片中…
        </div>
      ) : videos.length === 0 ? (
        <div className="reveal" style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.6)" }}>
          目前沒有影片，<a href={YT_CHANNEL} target="_blank" rel="noopener" style={{ color: "#66d8f6", textDecoration: "underline" }}>到 YouTube 頻道看看 →</a>
        </div>
      ) : (
        // v431：8 支直式（9:16）Shorts 自動輪播（左→右循環）。
        //   - 軌道＝清單複製兩份做無縫循環；CSS transform 動畫（GPU 合成）
        //   - 只在捲到畫面內才跑（.run）、hover/播放時暫停、尊重 prefers-reduced-motion
        //   - 縮圖 lazy（loading="lazy"），點擊開 lightbox（facade）
        <div
          className={`vid-marquee reveal${playing ? " paused" : ""}`}
          ref={marqueeRef}
        >
          <div className="vid-track">
            {[...videos.slice(0, 8), ...videos.slice(0, 8)].map((v, i) => (
              <button
                key={`${v.id}-${i}`}
                type="button"
                className="vid short"
                onClick={() => setPlaying(v.id)}
                title={v.title}
                aria-hidden={i >= Math.min(videos.length, 8)}
                tabIndex={i >= Math.min(videos.length, 8) ? -1 : 0}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="thumb"
                  src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`}
                  alt={v.title}
                  loading="lazy"
                  decoding="async"
                />
                <div className="scrim" />
                <div className="play" />
                <div className="meta">
                  <small>{v.isShort ? "SHORTS" : "YOUTUBE"}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="news-follow reveal">
        <span className="lbl">追蹤海王子，不錯過每一支新影片：</span>
        <div className="follow-btns">
          <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4c-.8.2-1.5.9-1.7 1.7C1 8.8 1 12 1 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7zM9.8 15V9l5.2 3-5.2 3z" /></svg></a>
          <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.05 1.8.25 2.2.42.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.17.4.37 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.05 1.2-.25 1.8-.42 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .37-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.05-1.8-.25-2.2-.42-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.37-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.05-1.2.25-1.8.42-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.37 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 4.86A4.94 4.94 0 1 0 12 17a4.94 4.94 0 0 0 0-9.94zm0 8.14A3.2 3.2 0 1 1 12 8.8a3.2 3.2 0 0 1 0 6.4zm6.3-8.34a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0z" /></svg></a>
          <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" /></svg></a>
        </div>
      </div>

      {/* v407B：影片 Lightbox 放大播放（點背景或 ✕ 關閉） */}
      {playing && (() => {
        const vertical = videos.find((v) => v.id === playing)?.isShort ?? false;
        return (
          <div className="hw-lightbox" onClick={() => setPlaying(null)} role="dialog" aria-modal="true">
            <div className={`hw-lightbox-inner${vertical ? " vertical" : ""}`} onClick={(e) => e.stopPropagation()}>
              <button className="hw-lightbox-close" onClick={() => setPlaying(null)} aria-label="關閉影片">✕</button>
              <div className={`hw-lightbox-frame${vertical ? " vertical" : ""}`}>
                <iframe
                  src={`https://www.youtube.com/embed/${playing}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title="YouTube"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
