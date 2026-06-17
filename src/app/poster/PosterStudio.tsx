"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---- 型別（對應 /api/trips、/api/tours 回傳）----
type Site = { id: string; name: string };
type Trip = {
  id: string; date: string; startTime: string; isNightDive: boolean; isScooter: boolean;
  tankCount: number; capacity: number | null; booked: number; available: number | null;
  sites: Site[]; status: string;
};
type Tour = {
  id: string; title: string; dateStart: string; dateEnd: string; durationLabel: string | null;
  capacity: number | null; available: number | null; subtitle: string | null; status: string;
};

const LINE_URL = "https://line.me/R/ti/p/@894bpmew";
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const BASE_W = 480; // 海報設計基準寬（下載時 scale 到 1080）

// ---- 主題配色 ----
const THEMES: Record<string, { bg: string; panel: string; accent: string; gold: string; mist: string }> = {
  ocean: { bg: "#0A2342", panel: "rgba(255,255,255,.06)", accent: "#2bb7a8", gold: "#e9b949", mist: "#9bb6cc" },
  teal: { bg: "#063b39", panel: "rgba(255,255,255,.07)", accent: "#5dd0b8", gold: "#ffd166", mist: "#8fc9bd" },
  sunset: { bg: "#2a1633", panel: "rgba(255,255,255,.07)", accent: "#ff8a5c", gold: "#ffd166", mist: "#c9a9c4" },
};
// ---- 背景照（站內現有 webp，同源可被 html2canvas 擷取）----
const PHOTOS: Record<string, string> = {
  none: "",
  coach: "/home/src-hero.webp",
  wall: "/home/review-wall.webp",
  reef: "/home/review-coral.webp",
};

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error("load " + src));
    document.head.appendChild(s);
  });
}

function fmtMD(iso: string) { const [, m, d] = iso.split("-"); return `${+m}/${+d}`; }
function wd(iso: string) { const [y, m, d] = iso.split("-").map(Number); return WD[new Date(y, m - 1, d).getDay()]; }

export default function PosterStudio({ embedded = false }: { embedded?: boolean }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() }); // m: 0-based
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(true);

  const [format, setFormat] = useState<"square" | "story">("square");
  const [themeKey, setThemeKey] = useState("ocean");
  const [photoKey, setPhotoKey] = useState("coach");
  const [title, setTitle] = useState("");
  const [dl, setDl] = useState(false);

  const posterRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLCanvasElement>(null);

  const theme = THEMES[themeKey];
  const defaultTitle = `${ym.m + 1}月潛水行程`;

  // ---- 抓真實場次 ----
  useEffect(() => {
    const first = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
    const last = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    setLoading(true);
    Promise.all([
      fetch(`/api/trips?from=${first}&to=${last}`).then((r) => r.json()).catch(() => ({ trips: [] })),
      fetch(`/api/tours`).then((r) => r.json()).catch(() => ({ tours: [] })),
    ]).then(([t, o]) => {
      setTrips(t.trips ?? []);
      // 只留與本月有重疊的潛旅
      setTours((o.tours ?? []).filter((tr: Tour) => tr.dateStart <= last && tr.dateEnd >= first));
      setLoading(false);
    });
  }, [ym]);

  // ---- QR ----
  useEffect(() => {
    loadScript("https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js").then(() => {
      const Q = (window as unknown as { QRious?: new (o: object) => unknown }).QRious;
      if (Q && qrRef.current) new Q({ element: qrRef.current, value: LINE_URL, size: 320, background: "#ffffff", foreground: "#0A2342", level: "M" });
    });
  }, []);

  // ---- 整理：日潛 + 潛旅 → 行事曆標記 + 條列 ----
  const data = useMemo(() => {
    const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
    const marks: Record<number, "dive" | "tour"> = {};
    type Row = { sortKey: string; day: number; lines: string };
    const rows: Row[] = [];

    for (const t of trips) {
      const [, , dd] = t.date.split("-").map(Number);
      marks[dd] = marks[dd] === "tour" ? "tour" : "dive";
      const type = t.isNightDive ? "夜潛" : t.isScooter ? "水推 DPV" : "日潛";
      const site = t.sites[0]?.name ?? "東北角";
      const avail = t.available == null ? "可約" : t.available > 0 ? `餘${t.available}` : "額滿";
      rows.push({ sortKey: `${t.date} ${t.startTime}`, day: dd, lines: `${site}・${type} ${t.startTime}　${avail}` });
    }
    for (const tr of tours) {
      const s = new Date(tr.dateStart), e = new Date(tr.dateEnd);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === ym.y && d.getMonth() === ym.m) marks[d.getDate()] = "tour";
      }
      const range = tr.dateStart === tr.dateEnd ? fmtMD(tr.dateStart) : `${fmtMD(tr.dateStart)}–${fmtMD(tr.dateEnd)}`;
      const avail = tr.available == null ? "可報名" : tr.available > 0 ? `餘${tr.available}` : "額滿";
      rows.push({ sortKey: `${tr.dateStart} 0`, day: new Date(tr.dateStart).getDate(), lines: `${tr.title}${tr.durationLabel ? `・${tr.durationLabel}` : ""}　${avail}`, });
    }
    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return { lastDay, marks, rows };
  }, [trips, tours, ym]);

  // ---- 下載 PNG（html2canvas，scale 拉到 1080+）----
  const download = useCallback(async () => {
    if (!posterRef.current || !wrapRef.current) return;
    setDl(true);
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      const h2c = (window as unknown as { html2canvas: (el: HTMLElement, o: object) => Promise<HTMLCanvasElement> }).html2canvas;
      const prev = wrapRef.current.style.transform;
      wrapRef.current.style.transform = "none"; // 擷取時用原尺寸
      const scale = format === "square" ? 1080 / BASE_W : 1080 / BASE_W;
      const canvas = await h2c(posterRef.current, { scale, useCORS: true, backgroundColor: null, logging: false });
      wrapRef.current.style.transform = prev;
      const a = document.createElement("a");
      a.download = `海王子_${ym.y}年${ym.m + 1}月_${format === "square" ? "貼文" : "限動"}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch { alert("產生圖片失敗，請再試一次"); }
    setDl(false);
  }, [format, ym]);

  // ---- 版面尺寸 ----
  const baseH = format === "square" ? 480 : 854;
  const previewW = 340;
  const scale = previewW / BASE_W;

  const monthNav = (delta: number) => setYm((p) => {
    const d = new Date(p.y, p.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() };
  });

  // 行事曆格子（週一起始）
  const firstWd = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7; // Mon=0
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= data.lastDay; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const listCap = format === "square" ? 5 : 12;
  const shownRows = data.rows.slice(0, listCap);
  const moreCount = data.rows.length - shownRows.length;

  const photoSrc = PHOTOS[photoKey];
  const small = format === "square";

  return (
    <div style={embedded
      ? { background: "#0e1620", color: "#e7eef4", fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif", padding: 16, borderRadius: 14 }
      : { minHeight: "100vh", background: "#0e1620", color: "#e7eef4", fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif", padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {!embedded && <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>🪸 潛水行程海報產生器</h1>}
        <p style={{ fontSize: 13, color: "#90a4b4", margin: "0 0 18px" }}>自動抓你後台真實場次 → 選格式 / 配色 / 標題 / 背景 → 下載高解析 PNG 直接發 IG・LINE・FB</p>

        {/* ---- 控制列 ---- */}
        <div style={{ display: "grid", gap: 12, background: "#16212e", border: "1px solid #243443", borderRadius: 14, padding: 16, marginBottom: 18 }}>
          <Row label="月份">
            <button onClick={() => monthNav(-1)} style={btn}>‹</button>
            <span style={{ fontWeight: 800, minWidth: 96, textAlign: "center" }}>{ym.y} 年 {ym.m + 1} 月</span>
            <button onClick={() => monthNav(1)} style={btn}>›</button>
            <span style={{ fontSize: 12, color: "#90a4b4", marginLeft: 8 }}>{loading ? "載入中…" : `日潛 ${trips.length} 場・潛旅 ${tours.length} 團`}</span>
          </Row>
          <Row label="格式">
            <Seg active={format === "square"} onClick={() => setFormat("square")}>正方形 1:1（貼文）</Seg>
            <Seg active={format === "story"} onClick={() => setFormat("story")}>直式 9:16（限動）</Seg>
          </Row>
          <Row label="配色">
            <Seg active={themeKey === "ocean"} onClick={() => setThemeKey("ocean")}>深海藍</Seg>
            <Seg active={themeKey === "teal"} onClick={() => setThemeKey("teal")}>青綠</Seg>
            <Seg active={themeKey === "sunset"} onClick={() => setThemeKey("sunset")}>日落紫</Seg>
          </Row>
          <Row label="背景照">
            <Seg active={photoKey === "none"} onClick={() => setPhotoKey("none")}>純色</Seg>
            <Seg active={photoKey === "coach"} onClick={() => setPhotoKey("coach")}>教練</Seg>
            <Seg active={photoKey === "wall"} onClick={() => setPhotoKey("wall")}>珊瑚牆</Seg>
            <Seg active={photoKey === "reef"} onClick={() => setPhotoKey("reef")}>珊瑚</Seg>
          </Row>
          <Row label="標題">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} style={{ flex: 1, background: "#0e1620", border: "1px solid #2c3e4f", borderRadius: 8, color: "#fff", padding: "8px 12px", fontSize: 14 }} />
          </Row>
          <button onClick={download} disabled={dl} style={{ ...btn, background: theme.accent, color: "#04241f", fontWeight: 800, padding: "12px", fontSize: 15, border: "none", opacity: dl ? 0.6 : 1 }}>
            {dl ? "產生中…" : "⬇ 下載 PNG（高解析）"}
          </button>
        </div>

        {/* ---- 預覽（外層裁切容器，避免手機水平捲動）---- */}
        <div style={{ width: previewW, height: baseH * scale, overflow: "hidden", margin: "0 auto", borderRadius: 14 }}>
          <div ref={wrapRef} style={{ width: BASE_W, height: baseH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {/* 海報本體（擷取對象）*/}
          <div ref={posterRef} style={{ position: "relative", width: BASE_W, height: baseH, background: theme.bg, overflow: "hidden", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
            {/* 背景照 + 暗化 */}
            {photoSrc && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoSrc} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${theme.bg}cc 0%, ${theme.bg}99 38%, ${theme.bg}f2 100%)` }} />
              </>
            )}

            {/* 內容 */}
            <div style={{ position: "relative", padding: small ? "20px 22px 16px" : "30px 28px 24px", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
              {/* header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: small ? 8 : 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: theme.mist, letterSpacing: 2, marginBottom: 2 }}>東北角海王子潛水</div>
                  <div style={{ fontSize: small ? 26 : 32, fontWeight: 900, lineHeight: 1.1, color: "#fff" }}>{title || defaultTitle}</div>
                </div>
                <div style={{ textAlign: "right", lineHeight: 1 }}>
                  <div style={{ fontSize: small ? 26 : 32, fontWeight: 900, color: theme.accent }}>{ym.m + 1}<span style={{ fontSize: 14, color: "#fff" }}>月</span></div>
                  <div style={{ fontSize: 10.5, color: theme.mist, letterSpacing: 2 }}>{ym.y}</div>
                </div>
              </div>

              {/* 行事曆 */}
              <div style={{ background: theme.panel, borderRadius: 12, padding: small ? "8px 8px 10px" : "12px", marginBottom: small ? 10 : 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 4 }}>
                  {["一", "二", "三", "四", "五", "六", "日"].map((w, i) => (
                    <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, padding: "2px 0", color: i >= 5 ? "#ff9e7a" : theme.mist }}>{w}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
                  {cells.map((d, i) => {
                    if (d == null) return <div key={i} />;
                    const mark = data.marks[d];
                    const weekend = i % 7 >= 5;
                    const bg = mark === "tour" ? theme.gold : mark === "dive" ? theme.accent : "transparent";
                    const fg = mark ? (mark === "tour" ? "#3a2c00" : "#04241f") : weekend ? "#ff9e7a" : "#cdd9e3";
                    return (
                      <div key={i} style={{ minHeight: small ? 26 : 40, borderRadius: 6, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: small ? 12 : 14, fontWeight: 700, color: fg }}>{d}</div>
                    );
                  })}
                </div>
              </div>

              {/* 圖例 */}
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: theme.mist, marginBottom: small ? 8 : 12 }}>
                <Legend c={theme.accent} t="日潛場次" />
                <Legend c={theme.gold} t="潛旅開團" />
              </div>

              {/* 條列 */}
              <div style={{ flex: 1, overflow: "hidden", background: theme.panel, borderRadius: 12, padding: small ? "10px 12px" : "14px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: theme.accent, marginBottom: 8, letterSpacing: 1 }}>本月可約 ▾</div>
                {loading ? (
                  <div style={{ fontSize: 13, color: theme.mist }}>載入中…</div>
                ) : data.rows.length === 0 ? (
                  <div style={{ fontSize: 13, color: theme.mist, lineHeight: 1.6 }}>本月場次陸續更新中，<br />加 LINE 詢問或預約客製行程 🔱</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: small ? 5 : 7 }}>
                    {shownRows.map((r, i) => (
                      <div key={i} style={{ fontSize: small ? 12 : 13.5, lineHeight: 1.35, color: "#e7eef4" }}>
                        <span style={{ color: theme.gold, fontWeight: 800, marginRight: 6 }}>{ym.m + 1}/{r.day}</span>
                        {r.lines}
                      </div>
                    ))}
                    {moreCount > 0 && <div style={{ fontSize: 11.5, color: theme.mist }}>…還有 {moreCount} 場，詳見 LINE</div>}
                  </div>
                )}
              </div>

              {/* footer + QR */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: small ? 10 : 16 }}>
                <div style={{ lineHeight: 1.5 }}>
                  <div style={{ fontSize: 11, color: theme.mist }}>地點：東北角・潮境・萊萊・綠島</div>
                  <div style={{ fontSize: 11, color: theme.mist }}>分級：初階｜進階｜潛旅</div>
                  <div style={{ fontSize: 11.5, color: theme.accent, fontWeight: 800, marginTop: 5 }}>@894bpmew ・ haiwangzi.xyz</div>
                </div>
                <div style={{ background: "#fff", borderRadius: 8, padding: 5, textAlign: "center" }}>
                  <canvas ref={qrRef} style={{ width: small ? 64 : 84, height: small ? 64 : 84, display: "block" }} />
                  <div style={{ fontSize: 9, color: "#0A2342", fontWeight: 700, marginTop: 2 }}>加 LINE</div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#6b7e8e", marginTop: 8 }}>💡 預覽是縮小版，下載的 PNG 為高解析（{format === "square" ? "1080×1080" : "1080×1920"}）。背景照可在控制列切換或關閉。</p>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = { background: "#243443", color: "#e7eef4", border: "1px solid #2c3e4f", borderRadius: 8, padding: "7px 12px", fontSize: 14, cursor: "pointer" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "#90a4b4", width: 52, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...btn, background: active ? "#2bb7a8" : "#243443", color: active ? "#04241f" : "#e7eef4", fontWeight: active ? 800 : 400, fontSize: 13 }}>{children}</button>;
}
function Legend({ c, t }: { c: string; t: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: c }} />{t}</span>;
}
