"use client";
// v911：首頁「本週潛水精選」編輯式影片卡（與現有 Shorts 輪播牆並存）。
//   讀 /api/config → featuredDiveVideos；latest=大卡、best=小卡；點卡片直接開 YouTube 新分頁。
//   縮圖 hqdefault + lazy（facade，不預載 iframe）→ 手機也快。
import { useEffect, useState } from "react";
import { DEFAULT_DIVE_VIDEOS, ytThumb, ytWatchUrl, type DiveVideo } from "@/lib/dive-videos";
import { YT_CHANNEL } from "./data";

export default function FeaturedVideos() {
  const [vids, setVids] = useState<DiveVideo[]>(DEFAULT_DIVE_VIDEOS);
  useEffect(() => {
    let off = false;
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => { if (!off && Array.isArray(c?.featuredDiveVideos) && c.featuredDiveVideos.length) setVids(c.featuredDiveVideos); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  const latest = vids.find((v) => v.category === "latest") ?? vids[0];
  const best = vids.filter((v) => v !== latest).slice(0, 6);
  if (!latest) return null;

  const Card = ({ v, feat }: { v: DiveVideo; feat?: boolean }) => (
    <a className={`fv-card${feat ? " feat" : ""}`} href={ytWatchUrl(v.id)} target="_blank" rel="noopener noreferrer" title={v.title}>
      <span className="fv-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ytThumb(v.id)} alt={v.title} loading="lazy" decoding="async" />
        <span className="fv-yt"><span className="fv-tri" />YouTube</span>
        <span className={`fv-badge ${v.category}`}>{v.category === "latest" ? "🆕 本週最新" : "⭐ 近期最佳"}</span>
        <span className="fv-play" />
      </span>
      <span className="fv-body">
        <span className="fv-ttl">{v.title || "海王子潛水精選"}</span>
        {feat && v.desc ? <span className="fv-desc">{v.desc}</span> : null}
      </span>
    </a>
  );

  return (
    <div className="fv-wrap">
      <div className="fv-head">
        <h2 className="fv-title">最新動態</h2>
        <p className="fv-sub">海裡每天都在上演精彩——汪汪帶你直擊東北角海底世界，<b>想不想一起下水看看？</b></p>
      </div>
      <div className="fv-grid">
        <Card v={latest} feat />
        {best.map((v) => <Card key={v.id} v={v} />)}
      </div>
      <div className="fv-more">
        <a href={YT_CHANNEL} target="_blank" rel="noopener noreferrer">追蹤海王子，看更多影片 → YouTube 頻道</a>
      </div>
      <style>{`
        .fv-more{text-align:center;margin-top:16px}
        .fv-more a{color:#1ed4c2;font-size:12.5px;text-decoration:underline;text-underline-offset:3px}
        .fv-wrap{max-width:1080px;margin:0 auto;padding:8px 16px 4px;}
        .fv-head{text-align:center;margin-bottom:22px;}
        .fv-title{margin:0 0 10px;font-size:34px;font-weight:900;letter-spacing:-.02em;line-height:1.15;color:#fff;text-shadow:0 2px 18px rgba(30,212,194,.25);}
        .fv-sub{margin:0;font-size:17px;line-height:1.6;color:#bcd9ec;}
        .fv-sub b{color:#5fe0cf;font-weight:800;}
        @media(min-width:760px){.fv-title{font-size:42px;} .fv-sub{font-size:20px;white-space:nowrap;}}
        .fv-grid{display:grid;gap:14px;grid-template-columns:1fr;}
        @media(min-width:760px){.fv-grid{grid-template-columns:1.6fr 1fr 1fr;}.fv-card.feat{grid-row:span 2;}}
        .fv-card{display:flex;flex-direction:column;border-radius:15px;overflow:hidden;text-decoration:none;
          background:#0c2033;border:1px solid rgba(255,255,255,.09);transition:.18s;color:#eaf4fb;}
        .fv-card:hover{transform:translateY(-3px);border-color:rgba(30,212,194,.5);box-shadow:0 16px 40px rgba(0,0,0,.4);}
        .fv-thumb{position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#0e4c6a,#0a2a44);display:block;overflow:hidden;}
        .fv-card.feat .fv-thumb{aspect-ratio:16/10;}
        .fv-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
        .fv-yt{position:absolute;top:9px;left:9px;display:inline-flex;align-items:center;gap:4px;background:rgba(0,0,0,.62);
          color:#fff;font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:6px;}
        .fv-tri{width:0;height:0;border-left:7px solid #ff3d3d;border-top:5px solid transparent;border-bottom:5px solid transparent;}
        .fv-badge{position:absolute;top:9px;right:9px;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:999px;}
        .fv-badge.latest{background:#12c2b0;color:#04323a;}
        .fv-badge.best{background:#f5b945;color:#3d2c00;}
        .fv-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;
          background:rgba(255,255,255,.92);box-shadow:0 6px 18px rgba(0,0,0,.35);}
        .fv-play::before{content:"";position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);
          border-left:15px solid #0a2440;border-top:9px solid transparent;border-bottom:9px solid transparent;}
        .fv-body{padding:12px 13px 14px;display:flex;flex-direction:column;gap:5px;}
        .fv-ttl{font-size:14.5px;font-weight:800;line-height:1.4;letter-spacing:-.01em;}
        .fv-card.feat .fv-ttl{font-size:17.5px;}
        .fv-desc{font-size:12.5px;line-height:1.6;color:#8bb0c9;}
      `}</style>
    </div>
  );
}
