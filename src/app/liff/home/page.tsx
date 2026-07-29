"use client";
// v953：LIFF 首頁改精簡版 —— 與網頁 /mobile 一致：① 主視覺(含小教練縮圖) ② 影片跑馬燈 ③ 潛點清單牆 + 看完整介紹。
//   預約走底部導覽「潛水預約」；完整內容(課程/潛點/潛旅/評價/FAQ) → /full。
import Link from "next/link";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import FeaturedVideos from "@/app/_home/FeaturedVideos";
import HomePlaylists from "@/app/_home/HomePlaylists";

export default function LiffHomePage() {
  return (
    <LiffShell title="首頁" backHref="/liff/home" bottomNav={<BottomNav />}>
      <div style={{ background: "#02152a", color: "#fff", fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>
        {/* ① 主視覺文字 + 小教練縮圖 */}
        <section style={{ position: "relative", overflow: "hidden", background: "linear-gradient(180deg,#0b4f86 0%,#04294c 60%,#02152a 100%)", padding: "18px 16px 20px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/src-08.webp" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.45 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(4,40,75,.4),rgba(2,21,42,.9))" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.6, color: "#9fd9d2", marginBottom: 8, fontWeight: 600 }}>LAILAI YINGGE ROCK · NORTHEAST COAST</div>
                <h1 style={{ margin: 0, fontSize: 25, fontWeight: 900, lineHeight: 1.16, whiteSpace: "nowrap", textShadow: "0 6px 24px rgba(0,0,0,.5)" }}>
                  潛入大海<br />看見<span style={{ color: "#66d8f6" }}>另一個世界</span>
                </h1>
              </div>
              <div style={{ flex: "none", width: 132, alignSelf: "stretch", minHeight: 128, position: "relative", borderRadius: 15, overflow: "hidden", border: "1px solid rgba(102,216,246,.4)", boxShadow: "0 12px 30px -12px rgba(2,21,42,.8)", background: "#0a3050" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/home/src-hero-diver.webp" alt="海王子教練 汪汪" loading="eager" fetchPriority="high" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 18%" }} />
                <span style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(2,21,42,.8)", border: "1px solid rgba(102,216,246,.35)", color: "#bcd9ec", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>汪汪</span>
              </div>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.7, color: "#bcd9ec", fontWeight: 300 }}>
              剛入門、還在摸索都沒關係<br />——有海王子教練「汪汪」在身邊，每一潛都安心。
            </p>
          </div>
        </section>

        {/* ② 影片跑馬燈 */}
        <div style={{ background: "#0A2342", padding: "16px 0 6px" }}>
          <FeaturedVideos />
        </div>

        {/* ③ 潛點主題播放清單牆 */}
        <HomePlaylists />

        {/* 看完整介紹 → /full */}
        <div style={{ padding: "24px 16px 30px", textAlign: "center" }}>
          <Link href="/full" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(102,216,246,.12)", border: "1px solid rgba(102,216,246,.45)", color: "#cfeef9", textDecoration: "none", fontWeight: 800, fontSize: 14, padding: "13px 24px", borderRadius: 999 }}>
            看完整介紹（課程・潛點・潛旅・評價）→
          </Link>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "#7f9db0" }}>預約請點下方「潛水預約」；完整內容都在這裡</p>
        </div>
      </div>
    </LiffShell>
  );
}
