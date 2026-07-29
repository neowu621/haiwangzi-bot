import Image from "next/image";
import Link from "next/link";
import { APP_VERSION } from "@/lib/version";
import { YT_CHANNEL, IG_URL, FB_URL, FbIcon, YtIcon, IgIcon } from "./data";
import { localBusinessJsonLd } from "@/lib/business-info";
import { MantaTridentMark } from "@/components/brand/MantaTrident";
import FeaturedVideos from "./FeaturedVideos";
import HomePlaylists from "./HomePlaylists";

// v950：手機首頁「精簡版」——只保留三塊：① 主視覺文字(含小教練縮圖) ② 影片跑馬燈 ③ 潛點主題清單牆。
//   其餘(課程/潛點/潛旅/評價/FAQ/預約按鈕/底部固定列)全部移除；想看完整內容 → 底部「看完整介紹」連到 /full(DesktopHome)。
//   純 server 渲染。

const C = { abyss: "#02152a", navy: "#0A2342", teal: "#1ed4c2", glow: "#66d8f6", soft: "#bcd9ec" };

export default function MobileHome() {
  return (
    <div style={{ background: C.abyss, color: "#fff", fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif", width: "100%", maxWidth: 520, margin: "0 auto", minHeight: "100vh", overflowX: "hidden", boxSizing: "border-box" }}>
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

      {/* ① 主視覺文字（含小教練縮圖）*/}
      <section style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0b4f86 0%,#04294c 60%,#02152a 100%)", padding: "20px 16px 22px" }}>
        <Image src="/home/src-08.webp" alt="" fill sizes="(max-width:520px) 100vw, 520px" priority style={{ objectFit: "cover", opacity: 0.5, zIndex: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,40,75,.4),rgba(2,21,42,.9))", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 1.6, color: "#9fd9d2", marginBottom: 8, fontWeight: 600 }}>LAILAI YINGGE ROCK · NORTHEAST COAST</div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
            <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 28, fontWeight: 900, lineHeight: 1.16, whiteSpace: "nowrap", textShadow: "0 6px 24px rgba(0,0,0,.5)" }}>
              潛入大海<br />看見<span style={{ color: C.glow }}>另一個世界</span>
            </h1>
            <div style={{ flex: "none", width: 112, alignSelf: "stretch", position: "relative", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(102,216,246,.4)", boxShadow: "0 12px 30px -12px rgba(2,21,42,.8)", background: "#0a3050" }}>
              <Image src="/home/src-hero-diver.webp" alt="海王子教練 汪汪" fill sizes="120px" priority style={{ objectFit: "cover", objectPosition: "center 20%" }} />
              <span style={{ position: "absolute", bottom: 7, left: "50%", transform: "translateX(-50%)", background: "rgba(2,21,42,.8)", border: "1px solid rgba(102,216,246,.35)", color: C.soft, fontSize: 9, fontWeight: 800, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>汪汪</span>
            </div>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.7, color: C.soft, fontWeight: 300 }}>
            剛入門、還在摸索都沒關係<br />——有海王子教練「汪汪」在身邊，每一潛都安心。
          </p>
        </div>
      </section>

      {/* ② 影片跑馬燈（深色底延續 hero）*/}
      <div style={{ background: C.navy, padding: "16px 0 20px" }}>
        <FeaturedVideos />
      </div>

      {/* ③ 潛點主題播放清單牆 */}
      <HomePlaylists />

      {/* 看完整介紹 → /full（桌機版排版，含課程/潛點/潛旅/評價/FAQ/預約）*/}
      <div style={{ padding: "26px 16px 8px", textAlign: "center" }}>
        <Link href="/full" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(102,216,246,.12)", border: "1px solid rgba(102,216,246,.45)", color: "#cfeef9", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "13px 24px", borderRadius: 999 }}>
          看完整介紹（課程・潛點・潛旅・評價・預約）→
        </Link>
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "#7f9db0" }}>想深入了解、線上預約，都在完整版首頁</p>
      </div>

      {/* 極簡 Footer */}
      <footer style={{ background: C.navy, color: "#9bb6cc", padding: "22px 18px 30px", marginTop: 24 }}>
        <div style={{ fontWeight: 800, color: "#fff", fontSize: 15, marginBottom: 6 }}>東北角海王子潛水</div>
        <p style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 14px" }}>萊萊鶯歌石潛水基地・教練汪汪帶你安心探索水下世界。</p>
        <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <a href={YT_CHANNEL} target="_blank" rel="noopener" aria-label="YouTube"><YtIcon s={28} /></a>
          <a href={IG_URL} target="_blank" rel="noopener" aria-label="Instagram"><IgIcon s={28} uid="mft" /></a>
          <a href={FB_URL} target="_blank" rel="noopener" aria-label="Facebook"><FbIcon s={28} /></a>
        </div>
        <Link href="/full" style={{ color: C.glow, fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>看完整首頁 ›</Link>
        <div style={{ fontSize: 10, opacity: .45, marginTop: 14, letterSpacing: .5 }}>© {new Date().getFullYear()} 東北角海王子 · v{APP_VERSION}</div>
      </footer>
    </div>
  );
}
