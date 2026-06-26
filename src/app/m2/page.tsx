"use client";
// v685：第二版手機 UI（m2）—— 完全獨立的新「皮」，不 import 任何現有 /admin /liff /pclogin 程式。
//   流程：密碼閘（msi@22178368）→ 三角色模擬 → 會員 5 分頁 / 教練點名 / IT 管理。
//   目前為 UAT 靜態版（假資料）；之後再接既有 API（/api/trips、/api/tours、/api/me…）。
import { useState } from "react";
import {
  Home, MessageCircle, Waves, Receipt, User, Lock, ArrowLeft, Bell, ShoppingCart,
  ChevronRight, ChevronLeft, Filter, Sailboat, Plane, SlidersHorizontal, School,
  UserCircle, ShieldCheck, LifeBuoy,
} from "lucide-react";
// v686：首頁 = 手機版官網內容 —— 沿用官網首頁同一份資料常數（純資料檔，只讀，不影響既有頁面）
import { COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LINE_BOOK_URL, FbIcon, YtIcon, IgIcon, YT_CHANNEL, IG_URL, FB_URL } from "@/app/_home/data";

const SPOT_IMG: Record<string, string> = {
  "bg-reeffish": "/home/src-04.webp", "bg-coraldiver": "/home/src-02.webp", "bg-blue": "/home/src-08.webp",
  "bg-macro": "/home/src-09.webp", "bg-coral": "/home/src-05.webp", "bg-boat": "/home/src-06.webp",
};

const C = {
  navy: "#0A2342", page: "#F4F6F8", card: "#FFFFFF", line: "rgba(10,35,66,.08)",
  ink: "#16202E", mute: "#7C8A99",
  accBg: "#E6F1FB", accFg: "#185FA5", okBg: "#E1F5EE", okFg: "#0F6E56",
  warnBg: "#FAEEDA", warnFg: "#854F0B", dangBg: "#FAECE7", dangFg: "#993C1D",
  proBg: "#EEEDFE", proFg: "#3C3489", coral: "#D85A30",
};

type Role = "member" | "coach" | "admin";
type Screen = "login" | "roles" | "app";
type Tab = "home" | "msg" | "dive" | "orders" | "me";

function Badge({ t, k }: { t: string; k: "ok" | "full" | "wait" | "warn" }) {
  const m = { ok: [C.okBg, C.okFg], full: [C.dangBg, C.dangFg], wait: [C.accBg, C.accFg], warn: [C.warnBg, C.warnFg] }[k];
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: m[0], color: m[1] }}>{t}</span>;
}

const DIVE_CATS: Array<{ c: string; name: string; sub: string; Icon: typeof Home; col: string }> = [
  { c: "daily", name: "一日潛水", sub: "龍洞 / 鼻頭 當日場次", Icon: Sailboat, col: C.accFg },
  { c: "tour", name: "旅遊潛水", sub: "蘭嶼 / 綠島 / 海外潛旅", Icon: Plane, col: C.okFg },
  { c: "custom", name: "客製潛水", sub: "包船 / 私人教練 / 揪團", Icon: SlidersHorizontal, col: C.warnFg },
  { c: "course", name: "潛水課程", sub: "OW / AOW / 進階考證", Icon: School, col: C.proFg },
];

function Sess({ time, title, sub, tags, who }: { time: string; title: string; sub: string; tags: React.ReactNode; who?: string }) {
  return (
    <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 2px", borderBottom: `0.5px solid ${C.line}` }}>
      <div style={{ width: 50, flex: "none", fontSize: 14, fontWeight: 500 }}>{time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12, color: C.mute, margin: "1px 0 6px" }}>{sub}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{tags}</div>
      </div>
      {who && (
        <div style={{ textAlign: "center", flex: "none", width: 40 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.accBg, margin: "0 auto" }} />
          <div style={{ fontSize: 10, color: C.mute, marginTop: 2 }}>{who}</div>
        </div>
      )}
      <ChevronRight size={16} color={C.mute} style={{ alignSelf: "center" }} />
    </div>
  );
}
const Sect = ({ t }: { t: string }) => <div style={{ fontSize: 13, fontWeight: 500, color: C.mute, margin: "16px 0 6px" }}>{t}</div>;
function LRow({ Icon, label, right }: { Icon: typeof Home; label: string; right?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}` }}>
      <Icon size={19} color={C.mute} />
      <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
      {right && <span style={{ fontSize: 13, color: C.mute }}>{right}</span>}
      <ChevronRight size={16} color={C.mute} />
    </div>
  );
}

export default function M2Page() {
  const [screen, setScreen] = useState<Screen>("login");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [tab, setTab] = useState<Tab>("home");
  const [cat, setCat] = useState<string | null>(null);

  const go = () => { if (pw === "msi@22178368") { setErr(""); setScreen("roles"); } else setErr("密碼錯誤"); };
  const pick = (r: Role) => { setRole(r); setTab("home"); setCat(null); setScreen("app"); };

  const frame = (inner: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: C.page, display: "flex", justifyContent: "center", fontFamily: "'Noto Sans TC',system-ui,sans-serif", color: C.ink }}>
      <div style={{ width: "100%", maxWidth: 430, background: C.card, minHeight: "100vh", display: "flex", flexDirection: "column" }}>{inner}</div>
    </div>
  );

  if (screen === "login") return frame(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.accBg, color: C.accFg, display: "grid", placeItems: "center" }}><Lock size={28} /></div>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 500 }}>海王子潛水 · m2</div><div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>第二版手機介面（測試）</div></div>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="輸入管理密碼"
        style={{ width: "100%", height: 44, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15 }} />
      <button onClick={go} style={{ width: "100%", height: 44, background: C.accFg, color: "#fff", border: "none", borderRadius: 10, fontSize: 15 }}>進入</button>
      <div style={{ fontSize: 12, color: C.dangFg, minHeight: 16 }}>{err}</div>
    </div>
  );

  if (screen === "roles") return frame(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "30px 22px", gap: 13 }}>
      <div style={{ textAlign: "center", marginBottom: 4 }}><div style={{ fontSize: 18, fontWeight: 500 }}>選擇身分（模擬）</div><div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>測試用，正式版依登入角色自動帶入</div></div>
      {([["member", "會員", "首頁 · 訊息 · 潛水 · 訂單 · 個人", User, C.accBg, C.accFg],
        ["coach", "教練 / 助教", "今日場次 · 到場點名", LifeBuoy, C.okBg, C.okFg],
        ["admin", "IT / 老闆", "結帳 · 訂單 · 會員 · 設定", ShieldCheck, C.proBg, C.proFg]] as const).map(([r, name, sub, Icon, bg, fg]) => (
        <button key={r} onClick={() => pick(r as Role)} style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: 14, borderRadius: 12, border: `0.5px solid ${C.line}`, background: C.card }}>
          <span style={{ width: 40, height: 40, borderRadius: 11, background: bg, color: fg, display: "grid", placeItems: "center" }}><Icon size={20} /></span>
          <span><span style={{ fontSize: 15, fontWeight: 500, display: "block" }}>{name}</span><span style={{ fontSize: 12, color: C.mute }}>{sub}</span></span>
        </button>
      ))}
    </div>
  );

  const title = role === "coach" ? "今日場次 · 點名" : role === "admin" ? "管理後台" : { home: "海王子潛水", msg: "訊息", dive: "潛水", orders: "我的訂單", me: "個人" }[tab];

  return frame(
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `0.5px solid ${C.line}` }}>
        <button onClick={() => setScreen("roles")} aria-label="切換身分" style={{ border: "none", background: "none", color: C.mute }}><ArrowLeft size={19} /></button>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
        <span style={{ display: "flex", gap: 12, color: C.mute }}><Bell size={18} /><ShoppingCart size={18} /></span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "13px 14px" }}>
        {role === "member" && <Member tab={tab} cat={cat} setTab={setTab} setCat={setCat} />}
        {role === "coach" && <Coach />}
        {role === "admin" && <Admin />}
      </div>

      {role === "member" && (
        <nav style={{ display: "flex", borderTop: `0.5px solid ${C.line}`, padding: "5px 2px 6px" }}>
          {([["home", "首頁", Home], ["msg", "訊息", MessageCircle], ["dive", "潛水", Waves], ["orders", "訂單", Receipt], ["me", "個人", UserCircle]] as const).map(([k, l, Icon]) => {
            const on = k === tab;
            return (
              <button key={k} onClick={() => { setTab(k as Tab); setCat(null); }} style={{ flex: 1, border: "none", background: "none", textAlign: "center", fontSize: 10, color: on ? C.accFg : C.mute }}>
                <Icon size={21} style={{ display: "block", margin: "0 auto 1px" }} />{l}
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}

function Member({ tab, cat, setTab, setCat }: { tab: Tab; cat: string | null; setTab: (t: Tab) => void; setCat: (c: string | null) => void }) {
  if (tab === "dive" && cat) {
    const meta = DIVE_CATS.find((d) => d.c === cat)!;
    return (
      <>
        <button onClick={() => setCat(null)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, border: "none", background: "none", color: C.accFg, padding: "0 0 8px" }}><ArrowLeft size={15} />{meta.name}</button>
        {(cat === "daily" || cat === "tour") && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `0.5px solid ${C.line}`, fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><ChevronLeft size={15} color={C.mute} />六月 2026<ChevronRight size={15} color={C.mute} /></span>
            <span style={{ color: C.accFg, display: "flex", alignItems: "center", gap: 4 }}><Filter size={14} />篩選</span>
          </div>
        )}
        <DiveList cat={cat} />
      </>
    );
  }
  if (tab === "home") return <HomeIntro goDive={() => { setTab("dive"); setCat(null); }} />;
  if (tab === "msg") return (
    <>
      <Sect t="通知" />
      <div style={{ background: C.okBg, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: C.okFg, marginBottom: 8 }}>活動提醒：6/27 鶯歌石場次，請提早 15 分鐘到場換裝</div>
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 13, fontWeight: 500 }}>預約成功</div><div style={{ fontSize: 12, color: C.mute }}>您的日潛預約已確認 · 6/25</div></div>
      <Sect t="客服" />
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 12, color: C.mute, marginBottom: 8 }}>有問題？直接傳訊息給客服</div>
        <div style={{ display: "flex", gap: 8 }}><input placeholder="輸入訊息…" style={{ flex: 1, height: 34, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 10px" }} /><button style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px" }}>送出</button></div>
      </div>
    </>
  );
  if (tab === "dive") return (
    <>
      <div style={{ fontSize: 15, fontWeight: 500, margin: "2px 0 10px" }}>選擇潛水類型</div>
      {DIVE_CATS.map(({ c, name, sub, Icon, col }) => (
        <button key={c} onClick={() => setCat(c)} style={{ display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", padding: 15, borderRadius: 12, border: `0.5px solid ${C.line}`, background: C.card, marginBottom: 10 }}>
          <span style={{ width: 42, height: 42, borderRadius: 11, background: C.page, display: "grid", placeItems: "center", color: col }}><Icon size={22} /></span>
          <span style={{ flex: 1 }}><span style={{ fontSize: 15, fontWeight: 500, display: "block" }}>{name}</span><span style={{ fontSize: 12, color: C.mute }}>{sub}</span></span>
          <ChevronRight size={18} color={C.mute} />
        </button>
      ))}
    </>
  );
  if (tab === "orders") return (
    <>
      <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>
        <span style={{ fontSize: 12, padding: "6px 13px", borderRadius: 999, background: C.navy, color: "#fff" }}>即將進行</span>
        <span style={{ fontSize: 12, padding: "6px 13px", borderRadius: 999, background: C.page, color: C.mute }}>已結束</span>
      </div>
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontSize: 14, fontWeight: 500 }}>日潛 6/27 08:00</div><div style={{ fontSize: 14, fontWeight: 500 }}>NT$ 1,875</div></div>
        <div style={{ fontSize: 12, color: C.mute, margin: "2px 0 7px" }}>鶯歌石＋石城 · 1 人</div>
        <div style={{ display: "flex", gap: 6 }}><Badge t="已確認" k="ok" /><Badge t="已付清" k="wait" /></div>
      </div>
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontSize: 14, fontWeight: 500 }}>綠島三天兩夜</div><div style={{ fontSize: 14, fontWeight: 500 }}>NT$ 29,000</div></div>
        <div style={{ fontSize: 12, color: C.mute, margin: "2px 0 7px" }}>10/02~10/04 · 2 人</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontSize: 11, color: C.okFg }}>已付訂金 14,000</div><div style={{ fontSize: 12, color: C.coral, fontWeight: 500 }}>尾款 15,000（截止 9/15）</div></div>
          <button style={{ background: C.coral, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13 }}>前往付款</button>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.accBg, margin: "0 auto" }} />
        <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8 }}>王小明</div>
        <div style={{ fontSize: 12, color: C.mute }}>neowu62@gmail.com</div>
      </div>
      <div style={{ display: "flex", background: C.page, borderRadius: 12, padding: "12px 0", textAlign: "center", marginBottom: 6 }}>
        {[["38", "海王子潛次"], ["300", "抵用金"], ["2", "進行中"], ["LV2", "會員"]].map(([a, b]) => (
          <div key={b} style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 500 }}>{a}</div><div style={{ fontSize: 11, color: C.mute }}>{b}</div></div>
        ))}
      </div>
      <Sect t="帳戶" /><LRow Icon={User} label="個人資訊" /><LRow Icon={ShieldCheck} label="證照 / 潛伴" /><LRow Icon={Receipt} label="抵用金" right="300" />
      <Sect t="紀錄" /><LRow Icon={Home} label="預約紀錄" right="38" /><LRow Icon={Waves} label="潛水紀錄" /><LRow Icon={ArrowLeft} label="登出" />
    </>
  );
}

function HomeIntro({ goDive }: { goDive: () => void }) {
  const lineBtn = (label: string, big?: boolean) => (
    <a href={LINE_BOOK_URL} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", background: "#06C755", color: "#fff", borderRadius: 999, padding: big ? "13px 0" : "11px 0", fontWeight: 500, fontSize: big ? 15 : 14, textDecoration: "none" }}>{label}</a>
  );
  return (
    <div style={{ margin: "-13px -14px 0" }}>
      <div style={{ background: "linear-gradient(180deg,#0b4f86,#031a32)", padding: "18px 16px 20px", color: "#fff" }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#7fbfb6" }}>LAILAI YINGGE ROCK · NORTHEAST COAST</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2, margin: "6px 0 8px" }}>潛入大海<br />看見<span style={{ color: "#5fe0cf" }}>另一個世界</span></h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "#d6e6ef", margin: "0 0 12px" }}>剛入門也沒關係——有汪汪教練在身邊，每一潛都安心。</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/home/src-hero.webp" alt="汪汪教練帶你安心潛水" loading="lazy" style={{ width: "100%", borderRadius: 14, display: "block", marginBottom: 12 }} />
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
            <a href={IG_URL} target="_blank" rel="noreferrer" aria-label="Instagram"><IgIcon s={38} uid="m2ig" /></a>
          </div>
          <div style={{ display: "flex" }}>{lineBtn("LINE 預約・諮詢汪汪教練", true)}</div>
          <div style={{ fontSize: 11, color: C.mute, marginTop: 12 }}>東北角海王子潛水 · 萊萊鶯歌石潛水基地</div>
        </div>
      </div>
    </div>
  );
}

function DiveList({ cat }: { cat: string }) {
  if (cat === "daily") return (<>
    <Sess time="08:00" title="日潛 · 鶯歌石＋石城" sub="3 潛 · 龍洞出發" tags={<><Badge t="有空位" k="ok" /><span style={{ fontSize: 11, color: C.mute }}>剩 6</span></>} who="汪汪" />
    <Sess time="08:00" title="日潛 · 82.8 氣導花園" sub="3 潛 · 進階" tags={<Badge t="剩 1 位" k="warn" />} who="Lemon" />
    <Sess time="16:00" title="夜潛 · 深澳" sub="2 潛 · 需 AOW" tags={<><Badge t="已額滿" k="full" /><Badge t="候補" k="wait" /></>} who="Una" />
  </>);
  if (cat === "tour") return (<>
    <Sess time="9/25" title="蘭嶼四天三夜潛旅" sub="中秋團 · 4天3夜" tags={<><Badge t="報名中" k="ok" /><span style={{ fontSize: 11, color: C.mute }}>訂金 8,000</span></>} who="汪汪" />
    <Sess time="10/02" title="綠島三天兩夜" sub="水攝團" tags={<Badge t="剩 8 位" k="warn" />} who="Una" />
    <Sess time="12/09" title="媽媽島六天五夜" sub="虎鯊+長尾鯊" tags={<Badge t="報名中" k="ok" />} who="Lemon" />
  </>);
  if (cat === "custom") return (
    <div style={{ background: C.page, borderRadius: 12, padding: 16, textAlign: "center" }}>
      <MessageCircle size={26} color={C.warnFg} />
      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>告訴我們你想怎麼潛</div>
      <div style={{ fontSize: 12, color: C.mute, margin: "4px 0 12px" }}>包船 / 私人教練 / 指定潛點 / 揪團開團</div>
      <button style={{ background: C.accFg, color: "#fff", border: "none", borderRadius: 999, padding: "9px 22px", fontSize: 13 }}>送出客製需求</button>
    </div>
  );
  return (<>
    <Sess time="課程" title="Open Water 初級開放水域" sub="4 天 · 含證照" tags={<Badge t="開課中" k="ok" />} who="汪汪" />
    <Sess time="課程" title="Advanced AOW 進階" sub="深潛 / 導航" tags={<Badge t="可預約" k="ok" />} who="Una" />
    <Sess time="課程" title="Rescue 救援潛水員" sub="進階考證" tags={<Badge t="需洽詢" k="wait" />} who="Lemon" />
  </>);
}

function Coach() {
  const AR = ({ n, s, u }: { n: string; s: string; u?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderTop: `0.5px solid ${C.line}` }}>
      <div><span style={{ fontSize: 13 }}>{n}</span> <span style={{ fontSize: 11, color: u ? C.warnFg : C.mute }}>{s}</span></div>
      <div style={{ display: "flex", gap: 6 }}><button style={{ fontSize: 11, padding: "4px 12px", borderRadius: 999, border: "none", background: C.okFg, color: "#fff" }}>到場</button><button style={{ fontSize: 11, padding: "4px 9px", borderRadius: 999, border: `0.5px solid ${C.line}`, background: C.card }}>未到</button></div>
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
        <div style={{ flex: 1, background: C.page, borderRadius: 10, padding: 11 }}><div style={{ fontSize: 12, color: C.mute }}>今日場次</div><div style={{ fontSize: 22, fontWeight: 500 }}>2</div></div>
        <div style={{ flex: 1, background: C.page, borderRadius: 10, padding: 11 }}><div style={{ fontSize: 12, color: C.mute }}>待點名</div><div style={{ fontSize: 22, fontWeight: 500, color: C.accFg }}>7</div></div>
      </div>
      <Sect t="到場點名" />
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>08:00 鶯歌石＋石城 · 5 人</div>
        <AR n="王小明" s="1 人 · 付清" /><AR n="陳大文" s="2 人 · 付清" /><AR n="Lisa" s="1 人 · 未付清" u />
      </div>
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>16:00 深澳夜潛 · 2 人</div>
        <AR n="Neo" s="1 人 · 付清" /><AR n="Amy" s="1 人 · 付清" />
      </div>
    </>
  );
}

function Admin() {
  const tiles: Array<[typeof Home, string, string, string]> = [
    [ShieldCheck, "到場點名", "今日 7 待點", C.okFg], [Receipt, "老闆結帳", "待確認 2 · 待匯款 1", C.accFg],
    [Receipt, "訂單管理", "未來場次 9", C.ink], [User, "會員管理", "查詢 / 抵用金", C.ink],
    [Waves, "潛水旅行", "團況 3", C.ink], [Lock, "系統設定", "IT / 老闆", C.proFg],
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 11 }}>
        {tiles.map(([Icon, t, s, col]) => (
          <div key={t} style={{ background: C.card, border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 12 }}>
            <Icon size={22} color={col} /><div style={{ fontSize: 13, fontWeight: 500, marginTop: 5 }}>{t}</div><div style={{ fontSize: 11, color: C.mute }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.page, borderRadius: 10, padding: "11px 13px" }}>
        <div style={{ fontSize: 12, color: C.mute, marginBottom: 3 }}>今日營運</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>訪客 4</span><span>新訂單 3</span><span>待回客服 1</span></div>
      </div>
    </>
  );
}
