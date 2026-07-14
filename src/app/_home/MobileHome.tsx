import Image from "next/image";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
import {
  LINE_BOOK_URL, YT_CHANNEL, IG_URL, FB_URL,
  COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LineIcon, FbIcon, YtIcon, IgIcon,
} from "./data";
import { localBusinessJsonLd } from "@/lib/business-info";
import { MantaTridentMark } from "@/components/brand/MantaTrident";

// v549：手機潛點 2×4 格用的縮圖（沿用既有 WebP，對應 home.css 的 bg-* 圖）
const SPOT_IMG: Record<string, string> = {
  "bg-reeffish": "/home/src-04.webp",
  "bg-coraldiver": "/home/src-02.webp",
  "bg-blue": "/home/src-08.webp",
  "bg-macro": "/home/src-09.webp",
  "bg-coral": "/home/src-05.webp",
  "bg-boat": "/home/src-06.webp",
};

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
      <header style={{ position: "sticky", top: 0, zIndex: 20, background: C.navy, color: "#fff", display: "flex", alignItems: "center", gap: 9, padding: "9px 16px" }}>
        <MantaTridentMark size={30} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <span style={{ fontWeight: 800, fontSize: 14.5 }}>東北角海王子潛水</span>
          <span style={{ fontSize: 9.5, color: "#7fbfb6", letterSpacing: 1 }}>萊萊鶯歌石 · 安心潛水</span>
        </div>
      </header>

      {/* Hero（精簡）*/}
      <section style={{ position: "relative", color: "#fff", overflow: "hidden" }}>
        <Image src="/home/src-hero-diver.webp" alt="東北角海王子潛水教練 汪汪" width={640} height={1137} priority sizes="(max-width:520px) 100vw, 520px" style={{ width: "100%", height: "40vh", maxHeight: 360, minHeight: 230, objectFit: "cover", objectPosition: "center 26%", display: "block" }} />
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
      <div style={{ paddingTop: 14 }}>
        <Scroller gap={8} padX={16}>
          {[
            { t: "體驗潛水", h: "/course" }, { t: "考證 OW/AOW", h: "/course" },
            { t: "東北角潛點", h: "/northsea-diving" }, { t: "費用", h: "/pricing" },
            { t: "學員評價", h: "/comment" }, { t: "常見問題", h: "/faq" },
          ].map((c) => (
            <Link key={c.t} href={c.h} style={{ flexShrink: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 700, color: C.navy, textDecoration: "none" }}>{c.t}</Link>
          ))}
        </Scroller>
      </div>

      {/* 第一次潛水 4 步 */}
      <Section id="start" title="第一次潛水，這樣開始" sub="First Dive" icon="🐠">
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
      <Section title="潛水課程" sub="Courses" icon="🎓" moreHref="/course">
        <Scroller gap={12}>
          {COURSES.map((c) => (
            <div key={c.title} style={{ flexShrink: 0, width: 230, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 15px", display: "flex", flexDirection: "column" }}>
              <span style={{ alignSelf: "flex-start", background: C.navy, color: "#7fe3d3", fontSize: 10.5, fontWeight: 800, letterSpacing: .5, padding: "3px 9px", borderRadius: 999, marginBottom: 9 }}>{c.badge}</span>
              <div style={{ fontWeight: 900, fontSize: 16, color: C.navy, lineHeight: 1.3, marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 19, fontWeight: 900, color: c.price.startsWith("NT$") ? C.navy : C.teal, marginBottom: 2 }}>{c.price}</div>
              <div style={{ fontSize: 11.5, color: C.mist }}>{c.includes}</div>
            </div>
          ))}
        </Scroller>
      </Section>

      {/* 關於汪汪 + 數據 */}
      <Section title="嗨，我是汪汪" sub="About" icon="🔱">
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          <Image src="/home/src-about.webp" alt="汪汪教練" width={520} height={300} loading="lazy" sizes="(max-width:520px) 100vw, 520px" style={{ width: "100%", height: "auto", display: "block" }} />
          <div style={{ padding: "13px 15px" }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: C.ink, margin: "0 0 12px" }}>潛水最重要的不是裝備多好，而是帶你下水的人夠不夠專業、細心。我最在意的就是兩個字——「安心」。</p>
            {/* A：成就列 — 一整條橫幅、分隔線（App 感）*/}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", background: C.navy, borderRadius: 12, padding: "13px 6px", color: "#fff" }}>
              {[["10+", "年教學"], ["1萬+", "次潛水"], ["1千+", "人帶過"]].map(([n, l], i) => (
                <div key={l} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && <span style={{ width: 1, height: 30, background: "rgba(255,255,255,.18)", marginRight: 6 }} />}
                  <div style={{ textAlign: "center", padding: "0 8px" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#5fe0cf", lineHeight: 1.1 }}>{n}</div>
                    <div style={{ fontSize: 10.5, opacity: .85, marginTop: 2 }}>{l}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* 學員評價（橫向滑動）*/}
      <Section title="學員怎麼說" sub="Reviews" icon="💬" moreHref="/comment">
        <Scroller gap={12}>
          {BUILTIN_REVIEWS.slice(0, 5).map((r, i) => (
            <div key={i} style={{ flexShrink: 0, width: 250, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 15px" }}>
              <div style={{ color: "#f5a623", fontSize: 13, marginBottom: 6 }}>★★★★★</div>
              {r.title ? <div style={{ fontWeight: 800, fontSize: 14, color: C.navy, marginBottom: 6 }}>{r.title}</div> : null}
              <p style={{ fontSize: 12.5, lineHeight: 1.65, color: C.sub, margin: "0 0 8px", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.text}</p>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.mist }}>— {r.name}</div>
            </div>
          ))}
        </Scroller>
      </Section>

      {/* 東北角潛點（2×4 八格：小圖 + 名稱；第 8 格看全部）*/}
      <Section title="東北角潛點" sub="Dive Sites" icon="🗺️" moreHref="/northsea-diving">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {SPOTS.map((s) => (
            <Link key={s.slug} href={`/dive/${s.slug}`} style={{ position: "relative", display: "block", aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
              <Image src={SPOT_IMG[s.bg] ?? "/home/src-08.webp"} alt={s.zh} fill sizes="(max-width:520px) 48vw, 240px" style={{ objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(2,21,42,.05) 35%, rgba(2,21,42,.8) 100%)" }} />
              <div style={{ position: "absolute", left: 10, right: 10, bottom: 8, color: "#fff" }}>
                <div style={{ fontWeight: 800, fontSize: 14, textShadow: "0 1px 3px rgba(0,0,0,.55)" }}>{s.zh}</div>
                <div style={{ fontSize: 10.5, color: "#dbeeea", textShadow: "0 1px 2px rgba(0,0,0,.55)" }}>{s.tags[0]}</div>
              </div>
            </Link>
          ))}
          <Link href="/northsea-diving" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: "4 / 3", borderRadius: 12, background: C.navy, color: "#fff", textDecoration: "none", gap: 5 }}>
            <span style={{ fontSize: 22 }}>🗺️</span>
            <span style={{ fontWeight: 800, fontSize: 13 }}>看全部潛點 ›</span>
          </Link>
        </div>
      </Section>

      {/* FAQ（原生 details，零 JS）*/}
      <Section title="常見問題" sub="FAQ" icon="❓" moreHref="/faq">
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
          {[["/schedule", "本月場次"], ["/course", "課程"], ["/pricing", "費用"], ["/rewards", "會員優惠"], ["/northsea-diving", "潛點"], ["/comment", "評價"], ["/faq", "FAQ"], ["/safety", "安全"], ["/haiwangzi", "關於汪汪"]].map(([h, t]) => (
            <a key={h} href={h} style={{ color: "#9bb6cc", textDecoration: "none" }}>{t}</a>
          ))}
        </div>
        <div style={{ fontSize: 10, opacity: .45, marginTop: 16, letterSpacing: .5 }}>© {new Date().getFullYear()} 東北角海王子 · v{APP_VERSION}</div>
      </footer>

      {/* 底部固定列（App 感）：場次 + 詢問 + LINE 預約。三鈕皆 flex+minWidth:0 → 任何寬度都不溢出 */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: "rgba(255,255,255,.96)", borderTop: `1px solid ${C.line}`, padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", maxWidth: 520, margin: "0 auto", display: "flex", gap: 8, boxSizing: "border-box" }}>
        <a href="/schedule" style={{ flex: "1 1 0", minWidth: 0, background: "#fff", border: `1.5px solid ${C.teal}`, color: C.teal, textAlign: "center", padding: "12px 6px", borderRadius: 12, fontWeight: 800, fontSize: 13.5, textDecoration: "none", whiteSpace: "nowrap" }}>🗓 場次</a>
        <Link href="/contact" style={{ flex: "1 1 0", minWidth: 0, background: "#fff", border: `1.5px solid ${C.navy}`, color: C.navy, textAlign: "center", padding: "12px 6px", borderRadius: 12, fontWeight: 800, fontSize: 13.5, textDecoration: "none", whiteSpace: "nowrap" }}>✉️ 詢問</Link>
        <a href={LINE_BOOK_URL} target="_blank" rel="noopener" style={{ flex: "1.7 1 0", minWidth: 0, background: "#06c755", color: "#fff", textAlign: "center", padding: "13px 6px", borderRadius: 12, fontWeight: 800, fontSize: 14.5, textDecoration: "none", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
          <LineIcon s={18} />LINE 預約
        </a>
      </div>
    </div>
  );
}

function Section({ id, title, sub, icon, moreHref, children }: { id?: string; title: string; sub: string; icon?: string; moreHref?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ padding: "18px 16px 4px", scrollMarginTop: 60 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        {/* C：左側品牌色直線 + 小圖示，辨識度更高 */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 4, height: 30, borderRadius: 2, background: C.teal, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 2, color: "#9aabae", fontWeight: 700, textTransform: "uppercase" }}>{sub}</div>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: C.navy, margin: "1px 0 0" }}>{icon ? <span style={{ marginRight: 5 }}>{icon}</span> : null}{title}</h2>
          </div>
        </div>
        {moreHref ? <Link href={moreHref} style={{ fontSize: 12.5, color: "#0a8f86", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>更多 ›</Link> : null}
      </div>
      {children}
    </section>
  );
}

// D：橫向滑動容器 — 右緣漸層淡出 + 箭頭，暗示「往右還有更多」
function Scroller({ children, gap = 12, padX = 0 }: { children: React.ReactNode; gap?: number; padX?: number }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap, overflowX: "auto", padding: `2px ${padX}px`, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>{children}</div>
      <div aria-hidden style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 36, background: `linear-gradient(90deg, rgba(243,247,250,0), ${C.bg})`, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <span style={{ color: C.teal, fontSize: 18, fontWeight: 900, marginRight: 2 }}>›</span>
      </div>
    </div>
  );
}
