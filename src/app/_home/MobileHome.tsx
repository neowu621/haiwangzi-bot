import Image from "next/image";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
import {
  LINE_BOOK_URL, YT_CHANNEL, IG_URL, FB_URL,
  COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LineIcon, FbIcon, YtIcon, IgIcon,
} from "./data";
import { localBusinessJsonLd } from "@/lib/business-info";

// v504：手機專屬首頁（App 化）。同網址內部依裝置渲染，先放 /mobile 預覽。
// 設計重點（對症老闆痛點）：字級/間距收斂、區塊重排（預約優先）、圖片精簡延遲載入、
//   App 體驗（頂部列 + 底部固定預約列 + 卡片 + 橫向滑動）。純 server 渲染、零 client JS。

const C = {
  navy: "#0A2342", deep: "#0e2d52", teal: "#0a8f86", tealLite: "#2bb7a8",
  ink: "#1A2330", sub: "#5a6b7d", mist: "#8fa6b6", line: "#e6edf2", bg: "#f3f7fa", card: "#ffffff",
};

export default function MobileHome() {
  return (
    <div style={{ background: C.bg, color: C.ink, fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif", paddingBottom: 78, width: "100%", maxWidth: 520, margin: "0 auto", minHeight: "100vh", overflowX: "hidden", boxSizing: "border-box" }}>
      {/* v505：LocalBusiness 結構化資料（手機版也帶，配合 Google 行動優先索引）*/}
      {/* eslint-disable-next-line react/no-danger */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd()) }} />

      {/* 頂部 App Bar（sticky）*/}
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: C.navy, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌊</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>東北角海王子潛水</span>
        </div>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" aria-label="加 LINE" style={{ background: "#06c755", color: "#fff", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <LineIcon s={14} />LINE
        </a>
      </header>

      {/* Hero（精簡）*/}
      <section style={{ position: "relative", color: "#fff", overflow: "hidden" }}>
        <Image src="/home/src-hero.webp" alt="東北角海王子潛水教練 汪汪" width={520} height={560} priority sizes="(max-width:520px) 100vw, 520px" style={{ width: "100%", height: "auto", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(10,35,66,.15) 0%, rgba(10,35,66,.35) 45%, ${C.navy} 100%)` }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 18px 18px" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#9fd9d2", marginBottom: 6 }}>LAILAI YINGGE ROCK · NORTHEAST COAST</div>
          <h1 style={{ fontSize: 27, fontWeight: 900, lineHeight: 1.2, margin: "0 0 8px" }}>潛入大海<br />看見<span style={{ color: "#5fe0cf" }}>另一個世界</span></h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#d6e6ef", margin: 0 }}>剛入門也沒關係——有汪汪教練在身邊，每一潛都安心。</p>
        </div>
      </section>

      {/* 主 CTA（預約優先）*/}
      <div style={{ background: C.navy, padding: "0 16px 18px", display: "flex", gap: 10 }}>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ flex: 1, background: "#06c755", color: "#fff", textAlign: "center", padding: "13px", borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: "none", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
          <LineIcon s={18} />LINE 立即預約
        </a>
        <a href="#start" style={{ background: "rgba(255,255,255,.12)", color: "#fff", textAlign: "center", padding: "13px 16px", borderRadius: 12, fontWeight: 700, fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}>新手看這</a>
      </div>

      {/* 快速入口 chips */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 16px 4px", WebkitOverflowScrolling: "touch" }}>
        {[
          { t: "體驗潛水", h: "/course" }, { t: "考證 OW/AOW", h: "/course" },
          { t: "東北角潛點", h: "/northsea-diving" }, { t: "費用", h: "/pricing" },
          { t: "學員評價", h: "/comment" }, { t: "常見問題", h: "/faq" },
        ].map((c) => (
          <Link key={c.t} href={c.h} style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: C.navy, textDecoration: "none" }}>{c.t}</Link>
        ))}
      </div>

      {/* 第一次潛水 4 步 */}
      <Section id="start" title="第一次潛水，這樣開始" sub="First Dive">
        <div style={{ display: "grid", gap: 8 }}>
          {[
            ["1", "LINE 諮詢・預約", "告訴汪汪你的狀況與想潛的日期"],
            ["2", "淺水區適應", "先在淺水熟悉用嘴呼吸與裝備"],
            ["3", "教練陪同下潛", "全程在你身邊，節奏由你決定"],
            ["4", "上岸看美照", "教練側拍，帶走滿滿水下回憶"],
          ].map(([n, t, d]) => (
            <div key={n} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 13px" }}>
              <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: C.teal, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{t}</div>
                <div style={{ fontSize: 12.5, color: C.sub }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* 課程（橫向滑動，體驗潛水優先）*/}
      <Section title="潛水課程" sub="Courses" moreHref="/course">
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 0 2px", WebkitOverflowScrolling: "touch" }}>
          {COURSES.map((c) => (
            <div key={c.title} style={{ flexShrink: 0, width: 230, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 15px", display: "flex", flexDirection: "column" }}>
              <span style={{ alignSelf: "flex-start", background: C.navy, color: "#7fe3d3", fontSize: 10.5, fontWeight: 800, letterSpacing: .5, padding: "3px 9px", borderRadius: 999, marginBottom: 9 }}>{c.badge}</span>
              <div style={{ fontWeight: 900, fontSize: 16, color: C.navy, lineHeight: 1.3, marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: c.price.startsWith("NT$") ? C.navy : C.teal, marginBottom: 2 }}>{c.price}</div>
              <div style={{ fontSize: 11.5, color: C.mist, marginBottom: 10 }}>{c.includes}</div>
              <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ marginTop: "auto", background: "#06c755", color: "#fff", textAlign: "center", padding: "9px", borderRadius: 9, fontWeight: 800, fontSize: 13, textDecoration: "none" }}>LINE 報名</a>
            </div>
          ))}
        </div>
      </Section>

      {/* 關於汪汪 + 數據 */}
      <Section title="嗨，我是汪汪" sub="About">
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <Image src="/home/src-about.webp" alt="汪汪教練" width={520} height={300} loading="lazy" sizes="(max-width:520px) 100vw, 520px" style={{ width: "100%", height: "auto", display: "block" }} />
          <div style={{ padding: "13px 15px" }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: C.ink, margin: "0 0 12px" }}>潛水最重要的不是裝備多好，而是帶你下水的人夠不夠專業、細心。我最在意的就是兩個字——「安心」。</p>
            <div style={{ display: "flex", gap: 8 }}>
              {[["10+", "年教學"], ["1萬+", "次潛水"], ["1千+", "人帶過"]].map(([n, l]) => (
                <div key={l} style={{ flex: 1, minWidth: 0, textAlign: "center", background: C.navy, color: "#fff", borderRadius: 10, padding: "11px 4px" }}>
                  <div style={{ fontSize: 19, fontWeight: 900, color: "#5fe0cf", lineHeight: 1.1 }}>{n}</div>
                  <div style={{ fontSize: 11, opacity: .85, marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 學員評價（橫向滑動）*/}
      <Section title="學員怎麼說" sub="Reviews" moreHref="/comment">
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 0 2px", WebkitOverflowScrolling: "touch" }}>
          {BUILTIN_REVIEWS.slice(0, 5).map((r, i) => (
            <div key={i} style={{ flexShrink: 0, width: 250, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 15px" }}>
              <div style={{ color: "#f5a623", fontSize: 13, marginBottom: 6 }}>★★★★★</div>
              {r.title ? <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 6 }}>{r.title}</div> : null}
              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: C.sub, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.text}</p>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mist }}>— {r.name}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 東北角潛點（精簡清單）*/}
      <Section title="東北角潛點" sub="Dive Sites" moreHref="/northsea-diving">
        <div style={{ display: "grid", gap: 8 }}>
          {SPOTS.map((s) => (
            <Link key={s.slug} href={`/dive/${s.slug}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px", textDecoration: "none", color: C.ink }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14.5, color: C.navy }}>{s.zh}</div>
                <div style={{ fontSize: 11.5, color: C.mist }}>{s.tags[0]}</div>
              </div>
              <span style={{ color: C.teal, fontSize: 18 }}>›</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* FAQ（原生 details，零 JS）*/}
      <Section title="常見問題" sub="FAQ" moreHref="/faq">
        <div style={{ display: "grid", gap: 8 }}>
          {FAQ[0].items.slice(0, 4).map((qa) => (
            <details key={qa.q} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px" }}>
              <summary style={{ fontWeight: 700, fontSize: 13.5, color: C.navy, cursor: "pointer", listStyle: "none" }}>{qa.q}</summary>
              <div style={{ fontSize: 12.5, lineHeight: 1.7, color: C.sub, marginTop: 8 }}>{typeof qa.a === "string" ? qa.a : qa.a}</div>
            </details>
          ))}
        </div>
      </Section>

      {/* Footer */}
      <footer style={{ background: C.navy, color: "#cdd9e3", padding: "22px 18px 26px", marginTop: 18 }}>
        <div style={{ fontWeight: 800, color: "#fff", fontSize: 15, marginBottom: 6 }}>東北角海王子潛水</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: "0 0 14px", color: "#9bb6cc" }}>萊萊鶯歌石潛水基地・教練汪汪帶你安心探索水下世界。</p>
        <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
          <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><YtIcon s={30} /></a>
          <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><IgIcon s={30} uid="mft" /></a>
          <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><FbIcon s={30} /></a>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 12 }}>
          {[["/course", "課程"], ["/pricing", "費用"], ["/northsea-diving", "潛點"], ["/comment", "評價"], ["/faq", "FAQ"], ["/safety", "安全"], ["/haiwangzi", "關於汪汪"]].map(([h, t]) => (
            <a key={h} href={h} style={{ color: "#9bb6cc", textDecoration: "none" }}>{t}</a>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: .45, marginTop: 16, letterSpacing: .5 }}>© {new Date().getFullYear()} 東北角海王子 · v{APP_VERSION}</div>
      </footer>

      {/* 底部固定預約列（App 感）*/}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "rgba(255,255,255,.96)", borderTop: `1px solid ${C.line}`, padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto", display: "flex", gap: 10, boxSizing: "border-box" }}>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ flex: 1, background: "#06c755", color: "#fff", textAlign: "center", padding: "13px", borderRadius: 12, fontWeight: 800, fontSize: 15.5, textDecoration: "none", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
          <LineIcon s={19} />LINE 立即預約
        </a>
      </div>
    </div>
  );
}

function Section({ id, title, sub, moreHref, children }: { id?: string; title: string; sub: string; moreHref?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ padding: "18px 16px 4px", scrollMarginTop: 60 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10.5, letterSpacing: 2, color: "#9aabae", fontWeight: 700, textTransform: "uppercase" }}>{sub}</div>
          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#0A2342", margin: "2px 0 0" }}>{title}</h2>
        </div>
        {moreHref ? <Link href={moreHref} style={{ fontSize: 12.5, color: "#0a8f86", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>更多 ›</Link> : null}
      </div>
      {children}
    </section>
  );
}
