"use client";
// v697：LIFF 首頁 = 手機版官網介紹(移植自 m2 HomeIntro,沿用 _home/data;不動 m2)
import { useRouter } from "next/navigation";
import { LiffShell } from "@/components/shell/LiffShell";
import { BottomNav } from "@/components/shell/BottomNav";
import { C, Sect, SPOT_IMG } from "@/components/liff/mobileShared";
import { COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LINE_BOOK_URL, FbIcon, YtIcon, IgIcon, YT_CHANNEL, IG_URL, FB_URL } from "@/app/_home/data";

export default function LiffHomePage() {
  const router = useRouter();
  const goDive = () => router.push("/liff/booking");
  const lineBtn = (label: string, big?: boolean) => (
    <a href={LINE_BOOK_URL} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#06C755", color: "#fff", borderRadius: 999, padding: big ? "13px 0" : "11px 0", fontWeight: 500, fontSize: big ? 15 : 14, textDecoration: "none" }}>{label}</a>
  );
  return (
    <LiffShell title="首頁" backHref="/liff/home" bottomNav={<BottomNav />}>
      <div style={{ color: C.ink, fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>
        <div style={{ background: "linear-gradient(180deg,#0b4f86,#031a32)", padding: "18px 16px 20px", color: "#fff" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: "#7fbfb6" }}>LAILAI YINGGE ROCK · NORTHEAST COAST</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: "6px 0 8px" }}>潛入大海<br />看見<span style={{ color: "#5fe0cf" }}>另一個世界</span></h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#d6e6ef", margin: "0 0 12px" }}>剛入門也沒關係——有汪汪教練在身邊，每一潛都安心。</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/src-hero-diver.webp" alt="汪汪教練帶你安心潛水" loading="lazy" style={{ width: "100%", borderRadius: 14, display: "block", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8 }}>
            {lineBtn("LINE 立即預約")}
            <button onClick={goDive} style={{ flex: 1, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", borderRadius: 999, padding: "11px 0", fontSize: 14 }}>看場次</button>
          </div>
        </div>

        <div style={{ padding: "8px 14px 0" }}>
          <Sect t="潛水課程 · Courses" />
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, margin: "0 -2px" }}>
            {COURSES.map((c) => (
              <div key={c.title} style={{ flex: "none", width: 218, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, background: C.card }}>
                <div style={{ fontSize: 10.5, color: C.accFg, letterSpacing: .5 }}>{c.badge}</div>
                <div style={{ fontSize: 14, fontWeight: 500, margin: "5px 0 3px", lineHeight: 1.3 }}>{c.title}</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: C.coral }}>{c.price}</div>
                <div style={{ fontSize: 11.5, color: C.mute, margin: "3px 0 10px", lineHeight: 1.5 }}>{c.includes}</div>
                {lineBtn("LINE 報名")}
              </div>
            ))}
          </div>

          <Sect t="關於汪汪 · About" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/src-about.webp" alt="教練汪汪" loading="lazy" style={{ width: "100%", borderRadius: 12, display: "block", marginBottom: 10 }} />
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: C.ink, margin: "0 0 12px" }}>潛水最重要的不是裝備多好，而是帶你下水的人夠不夠專業、細心。我最在意的就是兩個字——「安心」。</p>
          <div style={{ display: "flex", background: C.navy, borderRadius: 12, padding: "13px 0", color: "#fff", textAlign: "center" }}>
            {[["10+", "年教學"], ["1萬+", "次潛水"], ["1千+", "人帶過"]].map(([n, l]) => (
              <div key={l} style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 500, color: "#5fe0cf" }}>{n}</div><div style={{ fontSize: 11, opacity: .85 }}>{l}</div></div>
            ))}
          </div>

          <Sect t="學員怎麼說 · Reviews" />
          {BUILTIN_REVIEWS.slice(0, 3).map((r) => (
            <div key={r.title} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 9 }}>
              <div style={{ color: "#ffba00", fontSize: 12, letterSpacing: 1 }}>★★★★★</div>
              <div style={{ fontSize: 14, fontWeight: 500, margin: "3px 0 2px" }}>{r.title}</div>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.text}</div>
              <div style={{ fontSize: 11.5, color: C.mute, marginTop: 6 }}>— {r.name}{r.activity ? ` · ${r.activity}` : ""}</div>
            </div>
          ))}

          <Sect t="東北角潛點 · Dive Sites" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {SPOTS.map((s) => (
              <div key={s.slug} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, overflow: "hidden", background: C.card }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={SPOT_IMG[s.bg] ?? "/home/src-08.webp"} alt={s.zh} loading="lazy" style={{ width: "100%", height: 78, objectFit: "cover", display: "block" }} />
                <div style={{ padding: "8px 10px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{s.zh}</span>
                    <span style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 999, background: C.accBg, color: C.accFg }}>{s.level}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: C.mute, marginTop: 1 }}>{s.tags[0]}</div>
                </div>
              </div>
            ))}
          </div>

          <Sect t="常見問題 · FAQ" />
          {FAQ[0].items.slice(0, 4).map((qa) => (
            <details key={qa.q} style={{ borderBottom: `0.5px solid ${C.line}`, padding: "10px 2px" }}>
              <summary style={{ fontSize: 13.5, fontWeight: 500, cursor: "pointer", listStyle: "none" }}>{qa.q}</summary>
              <p style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.7, margin: "7px 0 0" }}>{qa.a}</p>
            </details>
          ))}

          <div style={{ textAlign: "center", padding: "18px 0 8px" }}>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 14 }}>
              <a href={FB_URL} target="_blank" rel="noreferrer" aria-label="Facebook"><FbIcon s={38} /></a>
              <a href={YT_CHANNEL} target="_blank" rel="noreferrer" aria-label="YouTube"><YtIcon s={38} /></a>
              <a href={IG_URL} target="_blank" rel="noreferrer" aria-label="Instagram"><IgIcon s={38} uid="liffhomeig" /></a>
            </div>
            <div style={{ display: "flex" }}>{lineBtn("LINE 預約・諮詢汪汪教練", true)}</div>
            <div style={{ fontSize: 11, color: C.mute, marginTop: 12 }}>東北角海王子潛水 · 萊萊鶯歌石潛水基地</div>
          </div>
        </div>
      </div>
    </LiffShell>
  );
}
