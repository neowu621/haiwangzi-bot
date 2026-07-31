"use client";
// v946/v947：首頁「潛點主題影片」磚牆 —— 各地點一磚，點下去開該 YouTube 播放清單。
//   縮圖：上傳封面 > 代表影片縮圖 > 漸層底+名稱。資料來自 /api/config.homePlaylists。
//   v979：溢出時改「原生捲動 + rAF 自動輪播」——手指可自由滑、點磚後自動接著跑(不再卡住)。
//   transparent：放進 Hero 內部時用(共用 Hero 背景)；預設(手機)自帶深色底。
import { useEffect, useRef, useState } from "react";
import { DEFAULT_HOME_PLAYLISTS, playlistUrl, playlistThumb, type HomePlaylist } from "@/lib/home-playlists";
import { useAutoScroll } from "./useAutoScroll";

export default function HomePlaylists({ transparent = false }: { transparent?: boolean }) {
  const [list, setList] = useState<HomePlaylist[]>(DEFAULT_HOME_PLAYLISTS);
  const [overflow, setOverflow] = useState(false); // 滿了(溢出) → 輪播；沒滿 → 置中
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useAutoScroll<HTMLDivElement>(overflow); // 溢出才啟動自動輪播

  useEffect(() => {
    let off = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (!off && Array.isArray(c?.homePlaylists) && c.homePlaylists.length) setList(c.homePlaylists); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  // 量測：原始磚總寬 > 容器寬 → 溢出(輪播)；否則置中
  useEffect(() => {
    const measure = () => {
      const row = rowRef.current, track = trackRef.current;
      if (!row || !track) return;
      const kids = Array.from(track.children).slice(0, list.length) as HTMLElement[];
      if (kids.length === 0) return;
      const contentW = kids.reduce((s, k) => s + k.offsetWidth, 0) + 12 * (kids.length - 1);
      setOverflow(contentW > row.clientWidth + 1);
    };
    const raf = () => requestAnimationFrame(measure);
    raf();
    const t = setTimeout(measure, 300); // 等縮圖/字體載入後再量一次
    window.addEventListener("resize", raf);
    const ro = rowRef.current ? new ResizeObserver(raf) : null;
    if (ro && rowRef.current) ro.observe(rowRef.current);
    return () => { window.removeEventListener("resize", raf); clearTimeout(t); ro?.disconnect(); };
  }, [list, trackRef]);

  if (list.length === 0) return null;
  const items = overflow ? [...list, ...list] : list; // 溢出才複製一份做無縫輪播

  return (
    <div className={`hpl-wrap${transparent ? " hpl-transparent" : ""}`}>
      <p className="hpl-sub">跟著海王子看遍東北角各潛點 —— <b>點一下，直接看整個系列。</b></p>

      <div className={`hpl-row${overflow ? " is-overflow" : ""}`} ref={rowRef}>
        <div className="hpl-track" ref={trackRef}>
        {items.map((p, idx) => {
          const thumb = playlistThumb(p);
          return (
            <a key={`${p.playlistId}-${idx}`} className="hpl-card" href={playlistUrl(p.playlistId)} target="_blank" rel="noopener noreferrer" title={p.title || "播放清單"}
              aria-hidden={idx >= list.length} tabIndex={idx >= list.length ? -1 : 0}>
              <span className="hpl-thumb">
                {thumb ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={p.title} loading="lazy" decoding="async" />
                    <span className="hpl-scrim" />
                    <span className="hpl-name">{p.title || "潛點影片"}</span>
                  </>
                ) : (
                  <span className="hpl-noimg">{p.title || "潛點影片"}</span>
                )}
                <span className="hpl-badge">▶ 播放清單</span>
              </span>
            </a>
          );
        })}
        </div>
      </div>

      <style>{`
        .hpl-wrap{background:linear-gradient(180deg,#05284a,#031a32);padding:10px 0 32px;}
        .hpl-wrap.hpl-transparent{background:transparent;padding:0;}
        .hpl-sub{margin:0 auto 12px;max-width:760px;padding:0 16px;text-align:center;font-size:18px;line-height:1.55;color:#fff;text-shadow:0 1px 10px rgba(0,0,0,.5);}
        .hpl-sub b{color:#7fe9d9;font-weight:800;}
        @media(min-width:760px){.hpl-sub{font-size:20px;}}
        /* 沒滿 → 置中；滿了(溢出) → 手指可滑 + 自動輪播 */
        .hpl-row{display:flex;justify-content:center;padding:2px 16px 4px;max-width:1180px;margin:0 auto;overflow:hidden;}
        .hpl-row.is-overflow{justify-content:flex-start;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);}
        .hpl-track{display:flex;gap:12px;width:max-content;max-width:100%;}
        .hpl-row.is-overflow .hpl-track{width:100%;max-width:none;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:none;}
        .hpl-row.is-overflow .hpl-track::-webkit-scrollbar{display:none;}
        .hpl-card{flex:none;width:200px;text-decoration:none;}
        @media(max-width:520px){.hpl-card{width:172px;}}
        @media(max-height:820px){.hpl-card{width:180px;}}
        @media(max-height:700px){.hpl-card{width:150px;} .hpl-sub{font-size:15px;margin-bottom:6px;} .hpl-name{font-size:13px;bottom:8px;} .hpl-thumb{border-radius:11px;}}
        .hpl-thumb{position:relative;display:block;aspect-ratio:16/9;border-radius:13px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,#0e4c6a,#0a2a44);transition:transform .18s,border-color .18s;}
        .hpl-card:hover .hpl-thumb{transform:translateY(-3px);border-color:rgba(30,212,194,.6);}
        .hpl-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
        .hpl-noimg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:22px 14px 0;text-align:center;color:#fff;font-weight:900;font-size:17px;line-height:1.3;letter-spacing:-.01em;text-shadow:0 2px 10px rgba(0,0,0,.5);}
        .hpl-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,21,42,0) 42%,rgba(2,21,42,.84) 100%);}
        .hpl-badge{position:absolute;top:7px;left:7px;z-index:2;background:rgba(0,0,0,.62);color:#fff;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:999px;}
        .hpl-name{position:absolute;left:11px;right:11px;bottom:9px;z-index:2;color:#fff;font-weight:900;font-size:15px;line-height:1.3;letter-spacing:-.01em;text-shadow:0 2px 8px rgba(0,0,0,.6);}
      `}</style>
    </div>
  );
}
