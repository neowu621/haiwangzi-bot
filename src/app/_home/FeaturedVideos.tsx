"use client";
// v927：首頁「最新動態」影片卡 —— 橫向自動跑馬燈(一直往左跑、右邊接著出來、無縫循環)。
//   點卡片直接開 YouTube；縮圖 hqdefault + lazy(facade)；hover 暫停；只在捲到畫面內才跑；尊重 reduced-motion。
import { useEffect, useRef, useState } from "react";
import { DEFAULT_DIVE_VIDEOS, ytThumb, ytWatchUrl, type DiveVideo } from "@/lib/dive-videos";
import { YT_CHANNEL } from "./data";

export default function FeaturedVideos() {
  const [vids, setVids] = useState<DiveVideo[]>(DEFAULT_DIVE_VIDEOS);
  const trackWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let off = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (!off && Array.isArray(c?.featuredDiveVideos) && c.featuredDiveVideos.length) setVids(c.featuredDiveVideos); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  // 只在捲到畫面內才跑動畫（省資源、不影響首屏）
  useEffect(() => {
    const el = trackWrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => el.classList.toggle("run", e.isIntersecting)),
      { rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [vids.length]);

  if (vids.length === 0) return null;
  // 至少 6 張才夠長，不足就重複補滿讓循環順
  const base = vids.length >= 4 ? vids : [...vids, ...vids, ...vids].slice(0, Math.max(4, vids.length));
  const loop = [...base, ...base]; // 複製兩份做無縫循環
  const dur = Math.max(24, base.length * 6); // 秒數隨數量增加、速度一致

  return (
    <div className="fv-wrap">
      <div className="fv-head">
        <p className="fv-sub">海裡每天都在上演精彩——汪汪帶你直擊東北角海底世界，<b>想不想一起下水看看？</b></p>
        <a className="fv-yt-link" href={YT_CHANNEL} target="_blank" rel="noopener noreferrer">更多影片 →</a>
      </div>

      <div className="fv-marquee" ref={trackWrapRef}>
        <div className="fv-track" style={{ animationDuration: `${dur}s` }}>
          {loop.map((v, i) => (
            <a
              key={`${v.id}-${i}`}
              className="fv-card"
              href={ytWatchUrl(v.id)}
              target="_blank"
              rel="noopener noreferrer"
              title={v.title}
              aria-hidden={i >= base.length}
              tabIndex={i >= base.length ? -1 : 0}
            >
              <span className="fv-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ytThumb(v.id)} alt={v.title} loading="lazy" decoding="async" />
                <span className="fv-yt"><span className="fv-tri" />YouTube</span>
                <span className={`fv-badge ${v.category}`}>{v.category === "latest" ? "🆕 本週最新" : "⭐ 近期最佳"}</span>
                <span className="fv-play" />
              </span>
              <span className="fv-ttl">{v.title || "海王子潛水精選"}</span>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        .fv-wrap{max-width:1180px;margin:0 auto;padding:0;}
        .fv-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:5px 12px;margin-bottom:10px;padding:0 16px;text-align:center;}
        .fv-sub{margin:0;font-size:15px;line-height:1.45;color:#dceaf5;text-shadow:0 1px 8px rgba(0,0,0,.4);}
        .fv-sub b{color:#5fe0cf;font-weight:800;}
        .fv-yt-link{flex:none;font-size:13.5px;font-weight:700;color:#1ed4c2;text-decoration:none;white-space:nowrap;}
        .fv-yt-link:hover{text-decoration:underline;text-underline-offset:3px;}
        @media(min-width:760px){.fv-sub{font-size:17px;white-space:nowrap;} .fv-yt-link{font-size:14px;}}
        /* 矮螢幕再壓縮：卡片縮小、留白縮小，確保與 Hero 同屏 */
        @media(max-height:820px){.fv-card{width:172px;} .fv-ttl{padding:6px 9px 8px;font-size:11.5px;} .fv-head{margin-bottom:8px;} .fv-sub{font-size:14px;}}
        @media(max-height:700px){.fv-card{width:150px;} .fv-ttl{font-size:11px;} .fv-sub{font-size:13px;}}

        /* 跑馬燈：一直往左跑，右邊接著出來，無縫循環 */
        .fv-marquee{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);}
        .fv-track{display:flex;gap:14px;width:max-content;padding:4px 14px;animation-name:fvscroll;animation-timing-function:linear;animation-iteration-count:infinite;animation-play-state:paused;}
        .fv-marquee.run .fv-track{animation-play-state:running;}
        .fv-marquee:hover .fv-track{animation-play-state:paused;}
        @keyframes fvscroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @media(prefers-reduced-motion:reduce){.fv-marquee{overflow-x:auto;} .fv-track{animation:none;}}

        .fv-card{flex:none;width:200px;display:flex;flex-direction:column;border-radius:13px;overflow:hidden;text-decoration:none;
          background:#0c2033;border:1px solid rgba(255,255,255,.09);color:#eaf4fb;transition:transform .18s,border-color .18s;}
        .fv-card:hover{transform:translateY(-3px);border-color:rgba(30,212,194,.55);}
        @media(max-width:520px){.fv-card{width:180px;}}
        .fv-thumb{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#0e4c6a,#0a2a44);display:block;overflow:hidden;}
        .fv-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
        .fv-yt{position:absolute;top:8px;left:8px;display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.62);color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;}
        .fv-tri{width:0;height:0;border-left:6px solid #ff3d3d;border-top:4px solid transparent;border-bottom:4px solid transparent;}
        .fv-badge{position:absolute;top:8px;right:8px;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;}
        .fv-badge.latest{background:#12c2b0;color:#04323a;}
        .fv-badge.best{background:#f5b945;color:#3d2c00;}
        .fv-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 6px 18px rgba(0,0,0,.35);}
        .fv-play::before{content:"";position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);border-left:14px solid #0a2440;border-top:8px solid transparent;border-bottom:8px solid transparent;}
        .fv-ttl{padding:8px 10px 10px;font-size:12.5px;font-weight:800;line-height:1.35;letter-spacing:-.01em;}

      `}</style>
    </div>
  );
}
