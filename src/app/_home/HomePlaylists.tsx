"use client";
// v946：首頁「潛點主題影片」磚牆 —— 各地點一磚，點下去開該 YouTube 播放清單。
//   縮圖：上傳封面 > 代表影片縮圖 > 漸層底+名稱。橫向可滑；資料來自 /api/config.homePlaylists。
import { useEffect, useState } from "react";
import { DEFAULT_HOME_PLAYLISTS, playlistUrl, playlistThumb, type HomePlaylist } from "@/lib/home-playlists";

export default function HomePlaylists() {
  const [list, setList] = useState<HomePlaylist[]>(DEFAULT_HOME_PLAYLISTS);

  useEffect(() => {
    let off = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (!off && Array.isArray(c?.homePlaylists) && c.homePlaylists.length) setList(c.homePlaylists); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="hpl-wrap">
      <div className="hpl-head">
        <span className="hpl-eyebrow">Dive Site Playlists</span>
        <h2 className="hpl-title">潛點主題影片</h2>
        <p className="hpl-sub">跟著海王子看遍東北角各潛點 —— 點一下，直接看整個系列。</p>
      </div>

      <div className="hpl-row">
        {list.map((p) => {
          const thumb = playlistThumb(p);
          return (
            <a key={p.playlistId} className="hpl-card" href={playlistUrl(p.playlistId)} target="_blank" rel="noopener noreferrer" title={p.title || "播放清單"}>
              <span className="hpl-thumb">
                {thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={thumb} alt={p.title} loading="lazy" decoding="async" />
                  : <span className="hpl-noimg">{p.title || "潛點影片"}</span>}
                <span className="hpl-badge">▶ 播放清單</span>
                <span className="hpl-scrim" />
                <span className="hpl-name">{p.title || "潛點影片"}</span>
              </span>
            </a>
          );
        })}
      </div>

      <style>{`
        .hpl-wrap{background:linear-gradient(180deg,#05284a,#031a32);padding:40px 0 44px;}
        .hpl-head{text-align:center;max-width:640px;margin:0 auto 22px;padding:0 16px;}
        .hpl-eyebrow{font-size:12px;font-weight:800;letter-spacing:.24em;color:#1ed4c2;text-transform:uppercase;}
        .hpl-title{margin:8px 0 6px;font-size:30px;font-weight:900;letter-spacing:-.02em;color:#fff;}
        .hpl-sub{margin:0;font-size:15px;line-height:1.6;color:#bcd9ec;}
        @media(min-width:760px){.hpl-title{font-size:36px;}}
        .hpl-row{display:flex;gap:14px;overflow-x:auto;padding:4px 16px 6px;max-width:1180px;margin:0 auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
        .hpl-row::-webkit-scrollbar{display:none;}
        .hpl-card{flex:none;width:230px;text-decoration:none;}
        @media(max-width:520px){.hpl-card{width:200px;}}
        .hpl-thumb{position:relative;display:block;aspect-ratio:16/10;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.1);background:linear-gradient(135deg,#0e4c6a,#0a2a44);transition:transform .18s,border-color .18s;}
        .hpl-card:hover .hpl-thumb{transform:translateY(-3px);border-color:rgba(30,212,194,.55);}
        .hpl-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
        .hpl-noimg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:0 14px;text-align:center;color:#cfeaf5;font-weight:800;font-size:16px;}
        .hpl-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(2,21,42,0) 40%,rgba(2,21,42,.82) 100%);}
        .hpl-badge{position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;}
        .hpl-name{position:absolute;left:12px;right:12px;bottom:10px;z-index:2;color:#fff;font-weight:900;font-size:16px;line-height:1.3;letter-spacing:-.01em;text-shadow:0 2px 8px rgba(0,0,0,.5);}
      `}</style>
    </div>
  );
}
