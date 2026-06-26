"use client";
// v685：第二版手機 UI（m2）—— 完全獨立的新「皮」，不 import 任何現有 /admin /liff /pclogin 程式。
//   流程：密碼閘（msi@22178368）→ 三角色模擬 → 會員 5 分頁 / 教練點名 / IT 管理。
//   目前為 UAT 靜態版（假資料）；之後再接既有 API（/api/trips、/api/tours、/api/me…）。
import { useState, useEffect, useMemo } from "react";
import {
  Home, MessageCircle, Waves, Receipt, User, Lock, ArrowLeft, Bell, ShoppingCart,
  ChevronRight, Sailboat, Plane, SlidersHorizontal, School,
  UserCircle, ShieldCheck, LifeBuoy, Plus, X, Check, Anchor, Moon,
} from "lucide-react";
// v686：首頁 = 手機版官網內容 —— 沿用官網首頁同一份資料常數（純資料檔，只讀，不影響既有頁面）
import { COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LINE_BOOK_URL, FbIcon, YtIcon, IgIcon, YT_CHANNEL, IG_URL, FB_URL } from "@/app/_home/data";
// v691：潛水四類完整下單系統移植自 LIFF —— 沿用既有元件 + 公開/會員 API（不新增後端）
import { SignaturePad } from "@/components/ui/SignaturePad";
import { PolicyText } from "@/components/ui/PolicyText";
import { formatPhoneTW } from "@/lib/phone";
import { isBookingClosed } from "@/lib/utils";
// v692：訂單=完整複製 LIFF 我的預約；個人=各項可點進子頁（沿用純函式 helper）
import { deriveBookingDisplay } from "@/lib/booking-status";
import { computePaymentDeadline, activityStartFromTaipei } from "@/lib/payment-deadline";

const SPOT_IMG: Record<string, string> = {
  "bg-reeffish": "/home/src-04.webp", "bg-coraldiver": "/home/src-02.webp", "bg-blue": "/home/src-08.webp",
  "bg-macro": "/home/src-09.webp", "bg-coral": "/home/src-05.webp", "bg-boat": "/home/src-06.webp",
};

// v686b：潛水分頁接真實場次（公開 API /api/trips、/api/tours）
const DEST_ZH: Record<string, string> = { northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "海外" };
const tw = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const m2Today = () => tw(new Date());
const m2Plus = (days: number) => tw(new Date(Date.now() + days * 86400000));
const mdShort = (iso: string) => { const p = iso.slice(5, 10).split("-"); return `${+p[0]}/${+p[1]}`; };
function availBadge(a: number | null) {
  if (a === null) return <Badge t="可預約" k="ok" />;
  if (a <= 0) return <><Badge t="已額滿" k="full" /><Badge t="候補" k="wait" /></>;
  if (a <= 3) return <Badge t={`剩 ${a} 位`} k="warn" />;
  return <Badge t="有空位" k="ok" />;
}
interface M2Trip { id: string; date: string; startTime: string; isNightDive: boolean; tankCount: number; available: number | null; sites: Array<{ name: string }> }
interface M2Tour { id: string; title: string; destination: string; dateStart: string; dateEnd: string; deposit: number; available: number | null; subtitle: string | null }

const C = {
  navy: "#0A2342", page: "#F4F6F8", card: "#FFFFFF", line: "rgba(10,35,66,.08)",
  ink: "#16202E", mute: "#7C8A99",
  accBg: "#E6F1FB", accFg: "#185FA5", okBg: "#E1F5EE", okFg: "#0F6E56",
  warnBg: "#FAEEDA", warnFg: "#854F0B", dangBg: "#FAECE7", dangFg: "#993C1D",
  proBg: "#EEEDFE", proFg: "#3C3489", coral: "#D85A30",
};

type Role = "member" | "coach" | "admin";
type Screen = "login" | "app";
type Tab = "home" | "msg" | "dive" | "orders" | "me";
type MeData = { lineUserId: string; realName: string | null; displayName: string; email: string | null; phone: string | null; cert: string | null; certNumber: string | null; birthday?: string | null; creditBalance: number; haiwangziLogCount?: number; logCount?: number | null; vipLevel?: number; roles?: string[]; role?: string; emailVerifiedAt?: string | null; emergencyContact?: { name: string; phone: string; relationship: string } | null; stats?: { totalBookings: number; completed: number; unreadNotifications?: number } };

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

function Sess({ time, title, sub, tags, who, onClick }: { time: string; title: string; sub: string; tags: React.ReactNode; who?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 2px", borderBottom: `0.5px solid ${C.line}`, cursor: onClick ? "pointer" : "default" }}>
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
function LRow({ Icon, label, right, onClick }: { Icon: typeof Home; label: string; right?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, background: "none", border: "none", borderBottomWidth: "0.5px", textAlign: "left", color: C.ink, cursor: onClick ? "pointer" : "default" }}>
      <Icon size={19} color={C.mute} />
      <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
      {right && <span style={{ fontSize: 13, color: C.mute }}>{right}</span>}
      <ChevronRight size={16} color={C.mute} />
    </button>
  );
}
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, border: "none", background: "none", color: C.ink, padding: "0 0 12px" }}><ArrowLeft size={17} color={C.accFg} />{title}</button>;
}

// ===================== 下單系統（v691，移植自 LIFF 一日潛水 / 旅遊潛水）=====================
type GearT = "BCD" | "regulator" | "wetsuit" | "fins" | "mask" | "computer" | "full_set";
const GEAR_DEF: Array<{ t: GearT; label: string; price: number }> = [
  { t: "BCD", label: "BCD", price: 350 }, { t: "regulator", label: "調節器", price: 350 },
  { t: "wetsuit", label: "防寒衣", price: 150 }, { t: "fins", label: "蛙鞋", price: 100 },
  { t: "mask", label: "面鏡", price: 100 }, { t: "computer", label: "潛水電腦錶", price: 100 },
  { t: "full_set", label: "整套優惠", price: 1000 },
];
const M2_CERTS = ["OW", "AOW", "DM", "Instructor"] as const;
type Cert = (typeof M2_CERTS)[number];
interface TripFull { id: string; date: string; startTime: string; isNightDive: boolean; isScooter: boolean; tankCount: number; capacity: number | null; booked: number; available: number | null; pricing: { baseTrip: number; extraTank: number; nightDive: number; scooterRental: number }; sites: Array<{ id: string; name: string; description: string }>; coaches: Array<{ id: string; realName: string }>; activityNote?: string | null }
interface TourFull { id: string; title: string; destination: string; dateStart: string; dateEnd: string; basePrice: number; deposit: number; finalDeadline: string | null; depositDueDays?: number; capacity: number; booked: number; available: number; includes: string[]; excludes: string[]; addons: Array<{ id: string; label: string; priceDelta: number }>; sites: Array<{ id: string; name: string; description: string }>; activityNote?: string | null }
interface Companion2 { id?: string; name: string; phone: string; cert: Cert | null; certNumber: string; logCount: number; relationship: string }
interface MeFull { realName: string | null; phone: string | null; email: string | null; cert: Cert | null; certNumber: string | null; logCount: number | null; creditBalance: number; vipLevel: number; gearDiscountPct?: number; tankPromo?: { active: boolean; discount: number; reason: string }; staffTank?: { active: boolean; price: number }; emergencyContact: { name: string; phone: string; relationship: string } | null; companions?: Companion2[] }

const INP: React.CSSProperties = { width: "100%", height: 40, border: `1px solid ${C.line}`, borderRadius: 9, padding: "0 11px", fontSize: 14, boxSizing: "border-box", background: "#fff", color: C.ink };
const SELP: React.CSSProperties = { ...INP, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%237C8A99' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" };
function Lab({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 12, color: C.mute, marginBottom: 4 }}>{children}</div>; }
function BCard({ title, children, sub }: { title?: string; children: React.ReactNode; sub?: string }) {
  return <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 11 }}>{title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: sub ? 2 : 9 }}>{title}</div>}{sub && <div style={{ fontSize: 11, color: C.mute, marginBottom: 9 }}>{sub}</div>}{children}</div>;
}
function Stp({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  const btn = (d: number, dis: boolean) => <button onClick={() => onChange(Math.min(max, Math.max(min, value + d)))} disabled={dis} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", fontSize: 18, color: dis ? C.line : C.ink, opacity: dis ? 0.5 : 1 }}>{d < 0 ? "−" : "＋"}</button>;
  return <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{btn(-1, value <= min)}<span style={{ minWidth: 30, textAlign: "center", fontSize: 17, fontWeight: 600 }}>{value}{suffix && <span style={{ fontSize: 11, marginLeft: 1 }}>{suffix}</span>}</span>{btn(1, value >= max)}</div>;
}

// 政策同意 + 手寫簽名（兩政策需先「查看」才能勾，皆勾才開放簽名）。onChange 回報 {ok, signatureDataUrl}
function AgreeBlock({ cancellationPolicy, safetyPolicy, onChange }: { cancellationPolicy: string; safetyPolicy: string; onChange: (s: { ok: boolean; signatureDataUrl: string | null }) => void }) {
  const [cv, setCv] = useState(false); const [sv, setSv] = useState(false);
  const [cr, setCr] = useState(false); const [sr, setSr] = useState(false);
  const [modal, setModal] = useState<null | "c" | "s">(null);
  const [sig, setSig] = useState<string | null>(null); const [ink, setInk] = useState(false);
  useEffect(() => { onChange({ ok: cr && sr && ink, signatureDataUrl: ink ? sig : null }); }, [cr, sr, ink, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (kind: "c" | "s", label: string, viewed: boolean, read: boolean, setViewed: (b: boolean) => void, setRead: (b: boolean) => void) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1.5px solid ${read ? C.okFg : C.line}`, background: read ? C.okBg : "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
      <button onClick={() => { if (!viewed) { setModal(kind); setViewed(true); } else setRead(!read); }} style={{ flex: 1, display: "flex", alignItems: "center", gap: 9, border: "none", background: "none", textAlign: "left", padding: 0, opacity: viewed ? 1 : 0.7 }}>
        <span style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${read ? C.okFg : C.mute}`, background: read ? C.okFg : "transparent", display: "grid", placeItems: "center", flex: "none" }}>{read && <Check size={12} color="#fff" />}</span>
        <span style={{ fontSize: 13 }}>我已閱讀並同意《{label}》{!viewed && <span style={{ fontSize: 10, color: C.coral, marginLeft: 3 }}>（請先查看）</span>}</span>
      </button>
      <button onClick={() => { setModal(kind); setViewed(true); }} style={{ fontSize: 11, border: `1px solid ${C.accFg}`, color: C.accFg, background: "none", borderRadius: 999, padding: "4px 11px" }}>查看 ›</button>
    </div>
  );
  return (
    <BCard title="📋 同意聲明（必填）">
      {row("c", "取消政策", cv, cr, setCv, setCr)}
      {row("s", "安全政策", sv, sr, setSv, setSr)}
      <div style={{ opacity: cr && sr ? 1 : 0.4, pointerEvents: cr && sr ? "auto" : "none", border: `1.5px dashed ${ink ? C.okFg : C.line}`, borderRadius: 10, padding: 10, marginTop: 2 }}>
        <Lab>✍️ 請於下方手寫簽名（法律有效電子簽署）</Lab>
        <SignaturePad height={150} onChange={(d, has) => { setSig(has ? d : null); setInk(has); }} />
      </div>
      {cr && sr && ink && <div style={{ marginTop: 9, borderLeft: "4px solid #06C755", background: "rgba(6,199,85,.08)", borderRadius: 8, padding: "9px 12px", fontSize: 12 }}><b style={{ color: "#06C755" }}>✅ 完成預約即視同同意以上內容</b></div>}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "82vh", display: "flex", flexDirection: "column", padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{modal === "c" ? "📋 取消政策" : "🛡️ 安全政策"}</div>
            <div style={{ flex: 1, overflowY: "auto", marginBottom: 12 }}><PolicyText>{(modal === "c" ? cancellationPolicy : safetyPolicy) || "（管理員尚未設定政策內容）"}</PolicyText></div>
            <button onClick={() => { if (modal === "c") { setCv(true); setCr(true); } else { setSv(true); setSr(true); } setModal(null); }} style={{ width: "100%", height: 44, background: C.okFg, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600 }}>我已閱讀，關閉並同意</button>
          </div>
        </div>
      )}
    </BCard>
  );
}

export default function M2Page() {
  const [screen, setScreen] = useState<Screen>("login");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<Role>("member");
  const [tab, setTab] = useState<Tab>("home");
  const [cat, setCat] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/m2/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }), credentials: "include" });
      if (!r.ok) { setErr("密碼錯誤"); return; }
      setRole("member"); setTab("home"); setCat(null); setScreen("app");
    } catch { setErr("連線失敗，請重試"); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (screen !== "app") return;
    let alive = true;
    fetch("/api/me", { credentials: "include", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setMe(d); }).catch(() => {});
    return () => { alive = false; };
  }, [screen]);
  const isAdmin = !!me && ((me.roles ?? [me.role ?? ""]).some((r) => ["admin", "boss", "it", "coach", "assistant"].includes(r)));

  const frame = (inner: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: C.page, display: "flex", justifyContent: "center", fontFamily: "'Noto Sans TC',system-ui,sans-serif", color: C.ink }}>
      <div style={{ width: "100%", maxWidth: 430, background: C.card, height: "100dvh", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>{inner}</div>
    </div>
  );

  if (screen === "login") return frame(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 26px", gap: 14 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: C.accBg, color: C.accFg, display: "grid", placeItems: "center" }}><Lock size={28} /></div>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 19, fontWeight: 500 }}>海王子潛水 · m2</div><div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>第二版手機介面（測試）</div></div>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} placeholder="輸入密碼"
        style={{ width: "100%", height: 44, textAlign: "center", border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 15 }} />
      <button onClick={go} disabled={busy} style={{ width: "100%", height: 44, background: C.accFg, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, opacity: busy ? 0.6 : 1 }}>{busy ? "登入中…" : "進入"}</button>
      <div style={{ fontSize: 12, color: C.dangFg, minHeight: 16 }}>{err}</div>
    </div>
  );

  const title = role === "coach" ? "今日場次 · 點名" : role === "admin" ? "管理後台" : { home: "海王子潛水", msg: "訊息", dive: "潛水", orders: "我的訂單", me: "個人" }[tab];
  const backToMember = () => { setRole("member"); setTab("me"); setCat(null); };

  return frame(
    <>
      <div style={{ display: "flex", flex: "none", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `0.5px solid ${C.line}` }}>
        {role !== "member"
          ? <button onClick={backToMember} aria-label="返回會員" style={{ border: "none", background: "none", color: C.mute }}><ArrowLeft size={19} /></button>
          : <span style={{ width: 19 }} />}
        <span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span>
        <span style={{ display: "flex", gap: 12, color: C.mute }}><Bell size={18} /><ShoppingCart size={18} /></span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "13px 14px" }}>
        {role === "member" && <Member tab={tab} cat={cat} setTab={setTab} setCat={setCat} me={me} isAdmin={isAdmin} setRole={setRole} />}
        {role === "coach" && <Coach />}
        {role === "admin" && <Admin />}
      </div>

      {role === "member" && (
        <nav style={{ display: "flex", flex: "none", borderTop: `0.5px solid ${C.line}`, background: C.card, padding: "5px 2px calc(6px + env(safe-area-inset-bottom))" }}>
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

function Member({ tab, cat, setTab, setCat, me, isAdmin, setRole }: { tab: Tab; cat: string | null; setTab: (t: Tab) => void; setCat: (c: string | null) => void; me: MeData | null; isAdmin: boolean; setRole: (r: Role) => void }) {
  if (tab === "dive" && cat) {
    const meta = DIVE_CATS.find((d) => d.c === cat)!;
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <button onClick={() => setCat(null)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, border: "none", background: "none", color: C.accFg, padding: 0 }}><ArrowLeft size={15} />{meta.name}</button>
          {(cat === "daily" || cat === "tour") && <span style={{ fontSize: 12, color: C.mute }}>點場次即可預約</span>}
        </div>
        <DiveList cat={cat} onBooked={() => { setCat(null); setTab("orders"); }} />
      </>
    );
  }
  if (tab === "home") return <HomeIntro goDive={() => { setTab("dive"); setCat(null); }} />;
  if (tab === "msg") return <MsgTab />;
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
  if (tab === "orders") return <OrdersTab setTab={setTab} goCustom={() => { setTab("dive"); setCat("custom"); }} />;
  return <MeTab me={me} isAdmin={isAdmin} setRole={setRole} setTab={setTab} />;
}

const ntd = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;

interface Notif { id: string; title: string; body: string; createdAt: string; isRead: boolean }
interface Convo { who: "me" | "cs"; body: string; createdAt: string }
function MsgTab() {
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const [convo, setConvo] = useState<Convo[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const loadConvo = () => fetch("/api/me/contact", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setConvo(d.messages ?? [])).catch(() => {});
  useEffect(() => {
    fetch("/api/me/notifications?limit=30", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setNotifs(d.items ?? [])).catch(() => setNotifs([]));
    loadConvo();
  }, []);
  async function send() {
    if (!msg.trim() || sending) return;
    setSending(true);
    try { await fetch("/api/me/contact", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: msg }) }); setMsg(""); loadConvo(); } catch { /* ignore */ } finally { setSending(false); }
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Sect t="通知" />
        {notifs === null && <div style={{ color: C.mute, fontSize: 13, padding: "10px 0" }}>載入中…</div>}
        {notifs?.length === 0 && <div style={{ color: C.mute, fontSize: 13, padding: "24px 0", textAlign: "center" }}>目前沒有通知</div>}
        {notifs?.map((n) => (
          <div key={n.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: n.isRead ? C.card : "#f0fbfa" }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
            <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.6, marginTop: 3, whiteSpace: "pre-wrap" }}>{n.body}</div>
            <div style={{ fontSize: 11, color: C.mute, marginTop: 5 }}>{new Date(n.createdAt).toLocaleString("zh-TW")}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: "none", borderTop: `0.5px solid ${C.line}`, background: C.card, paddingTop: 10, marginTop: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: C.navy, marginBottom: 6 }}>有問題？傳訊息給客服</div>
        {convo.length > 0 && (
          <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {convo.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%", padding: "6px 10px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.who === "me" ? C.navy : C.page, color: m.who === "me" ? "#fff" : C.ink }}>{m.who === "cs" ? `客服：${m.body}` : m.body}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="輸入訊息…" style={{ flex: 1, height: 36, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 10px", fontSize: 14 }} />
          <button onClick={send} disabled={sending || !msg.trim()} style={{ background: C.navy, color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", opacity: sending || !msg.trim() ? 0.5 : 1 }}>送出</button>
        </div>
      </div>
    </div>
  );
}

interface MyGear { itemType: GearT; price: number; qty?: number }
interface MyProof { id: string; type: "deposit" | "final" | "refund"; amount: number; verifiedAt: string | null; url: string | null; thumb?: string | null }
interface MyRef { date?: string; startTime?: string; sites?: string[]; tankCount?: number; title?: string; dateStart?: string; dateEnd?: string; activityNote?: string | null }
interface MyBk { id: string; type: "daily" | "tour"; payLinkToken?: string | null; status: string; paymentStatus: string; totalAmount: number; depositAmount: number; paidAmount: number; participants: number; rentalGear: MyGear[]; notes?: string | null; createdAt: string; signatureUrl?: string | null; signedAt?: string | null; agreedToTermsAt?: string | null; paymentProofs: MyProof[]; ref: MyRef | null }
interface Wish { id: string; type: string; preferredDate: string; diveSiteIds: string[]; otherSites: string | null; participants: number; status: string; lastActivityAt: string; convertedTripId: string | null; convertedTourId: string | null }
const GEAR_LBL = (t: GearT) => GEAR_DEF.find((g) => g.t === t)?.label ?? t;
const CANCELLED = new Set(["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"]);
const ENDED = new Set(["completed", "no_show"]);
function vchip(variant: string): [string, string] {
  return ({ default: [C.okBg, C.okFg], muted: [C.page, C.mute], coral: [C.dangBg, C.dangFg], gold: [C.warnBg, C.warnFg] } as Record<string, [string, string]>)[variant] ?? [C.page, C.mute];
}
function isUpcomingBk(b: MyBk) {
  if (CANCELLED.has(b.status) || ENDED.has(b.status) || !b.ref) return false;
  const d = b.ref.date ?? b.ref.dateStart; return d ? new Date(d) >= new Date(new Date().toDateString()) : false;
}

function OrdersTab({ setTab, goCustom }: { setTab: (t: Tab) => void; goCustom: () => void }) {
  const [bookings, setBookings] = useState<MyBk[] | null>(null);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [seg, setSeg] = useState<"up" | "wishes" | "done" | "cancelled">("up");
  const [pol, setPol] = useState<{ cancellation: string; safety: string }>({ cancellation: "", safety: "" });
  const [agreeBk, setAgreeBk] = useState<MyBk | null>(null);
  const load = () => { fetch("/api/bookings/my", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setBookings(d.bookings ?? [])).catch(() => setBookings([])); };
  useEffect(() => { load(); fetch("/api/dive-wishes", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setWishes(d.wishes ?? [])).catch(() => {}); fetch("/api/config").then((r) => r.json()).then((c) => setPol({ cancellation: c.cancellationPolicy ?? "", safety: c.safetyPolicy ?? "" })).catch(() => {}); }, []);
  async function cancelBk(b: MyBk) {
    const msg = b.paidAmount > 0 ? `確定取消這筆訂單？\n已付 NT$ ${b.paidAmount.toLocaleString()}，取消後需另外申請退款。` : "確定取消這筆訂單？\n尚未付款，取消後訂單不成立。";
    if (!window.confirm(msg)) return;
    try { await fetch(`/api/bookings/${b.id}`, { method: "DELETE", credentials: "include" }); load(); } catch { window.alert("取消失敗，請稍後再試"); }
  }
  if (bookings === null) return <div style={{ color: C.mute, fontSize: 13, padding: "20px 0", textAlign: "center" }}>載入中…</div>;
  const up: MyBk[] = [], done: MyBk[] = [], cancelled: MyBk[] = [];
  for (const b of bookings) { if (CANCELLED.has(b.status)) cancelled.push(b); else if (ENDED.has(b.status) || !isUpcomingBk(b)) done.push(b); else up.push(b); }
  const wishActive = wishes.filter((w) => w.status !== "cancelled").length;
  const segBtn = (k: typeof seg, l: string, n?: number) => <button onClick={() => setSeg(k)} style={{ flex: 1, fontSize: 11.5, padding: "7px 4px", borderRadius: 8, border: "none", background: seg === k ? C.navy : C.page, color: seg === k ? "#fff" : C.mute, whiteSpace: "nowrap" }}>{l}{n != null ? ` ${n}` : ""}</button>;
  return (
    <>
      <button onClick={() => setTab("msg")} style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", background: C.card, marginBottom: 11 }}>
        <Bell size={16} color={C.coral} /><span style={{ flex: 1, textAlign: "left", fontSize: 13.5, fontWeight: 500 }}>通知中心</span><ChevronRight size={16} color={C.mute} />
      </button>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>{segBtn("up", "即將前往", up.length)}{segBtn("wishes", "📝 願望", wishActive)}{segBtn("done", "已結束", done.length)}{segBtn("cancelled", "已取消", cancelled.length)}</div>

      {seg === "wishes" ? (
        <>
          <div style={{ background: C.okBg, color: C.okFg, borderRadius: 9, padding: "9px 12px", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>💡 找不到喜歡的場次？告訴汪汪你想潛的日期、潛點、人數，老闆會回覆討論並開專屬場次。</div>
          <button onClick={goCustom} style={{ width: "100%", height: 44, background: C.accFg, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, marginBottom: 11 }}>📝 提出新需求 / 願望單</button>
          {wishes.length === 0 && <div style={{ color: C.mute, fontSize: 13, padding: "24px 0", textAlign: "center" }}>還沒有願望單</div>}
          {wishes.map((w) => {
            const tl: Record<string, string> = { boat: "🚤 船潛", shore: "🏖 岸潛", night: "🌙 夜潛", tour: "✈️ 潛水團" };
            const sm: Record<string, [string, string]> = { pending: ["🟡 待回覆", "gold"], discussing: ["💬 討論中", "gold"], converted: ["🟢 場次已開", "default"], cancelled: ["⚪ 已取消", "muted"] };
            const [sl, sv] = sm[w.status] ?? [w.status, "muted"]; const [bg, fg] = vchip(sv);
            return (
              <div key={w.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 12, marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: bg, color: fg }}>{sl}</span><span style={{ fontSize: 13.5, fontWeight: 600 }}>{tl[w.type] ?? w.type}</span></div>
                  <span style={{ fontSize: 10, color: C.mute }}>{new Date(w.lastActivityAt).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" })}</span>
                </div>
                <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.6 }}>📅 {w.preferredDate.slice(0, 10)} · 👥 ×{w.participants}<br />📍 {[...w.diveSiteIds, w.otherSites ?? ""].filter(Boolean).join("、") || "—"}</div>
                {w.status === "converted" && (w.convertedTripId || w.convertedTourId) && <div style={{ fontSize: 11.5, color: C.okFg, fontWeight: 600, marginTop: 6 }}>🎉 已開場次，到「潛水」分頁預約</div>}
              </div>
            );
          })}
        </>
      ) : (() => {
        const list = seg === "up" ? up : seg === "done" ? done : cancelled;
        if (list.length === 0) return <div style={{ color: C.mute, fontSize: 13, padding: "30px 0", textAlign: "center" }}>{seg === "up" ? "目前沒有即將前往的訂單" : seg === "done" ? "還沒有完成紀錄" : "沒有已取消的訂單"}</div>;
        return list.map((b) => <OrderCard key={b.id} b={b} onCancel={() => cancelBk(b)} onAgreement={() => setAgreeBk(b)} setTab={setTab} />);
      })()}

      {agreeBk && <AgreementModal bk={agreeBk} pol={pol} onClose={() => setAgreeBk(null)} />}
    </>
  );
}

function OrderCard({ b, onCancel, onAgreement, setTab }: { b: MyBk; onCancel: () => void; onAgreement: () => void; setTab: (t: Tab) => void }) {
  const isDaily = b.type === "daily"; const ref = b.ref;
  const d = deriveBookingDisplay({ status: b.status as Parameters<typeof deriveBookingDisplay>[0]["status"], paymentStatus: b.paymentStatus as Parameters<typeof deriveBookingDisplay>[0]["paymentStatus"], createdAt: b.createdAt, activityDate: ref?.date ?? ref?.dateStart ?? null });
  const [cbg, cfg] = vchip(d.variant);
  const needsPay = b.paymentStatus !== "fully_paid" && b.paymentStatus !== "refunded" && b.totalAmount > 0;
  const upcoming = isUpcomingBk(b);
  const cancellable = upcoming && !ENDED.has(b.status) && !b.status.startsWith("cancelled") && b.paymentStatus !== "refunded" && b.paymentStatus !== "refunding";
  const unpaid = b.totalAmount - b.paidAmount;
  const deadline = (() => { if (!needsPay || b.paymentStatus !== "pending") return null; const start = ref?.date ? activityStartFromTaipei(ref.date, ref.startTime ?? null) : ref?.dateStart ? activityStartFromTaipei(ref.dateStart, null) : null; return computePaymentDeadline(b.createdAt, start); })();
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null;
  const progress = b.totalAmount > 0 ? Math.min(100, Math.round((b.paidAmount / b.totalAmount) * 100)) : 0;
  const payHref = b.payLinkToken ? `/pay/${b.id}?t=${encodeURIComponent(b.payLinkToken)}` : `/pay/${b.id}`;
  async function refund() { if (!window.confirm("要申請退款嗎？將送出退款申請給客服，客服會在「訊息」與你聯繫。")) return; try { await fetch("/api/me/contact", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: `【退款申請】訂單 ${b.id}（已付 NT$ ${b.paidAmount.toLocaleString()}）` }) }); window.alert("已送出退款申請，請到「訊息」分頁查看回覆。"); setTab("msg"); } catch { window.alert("送出失敗，請稍後再試"); } }
  return (
    <div style={{ border: `0.5px solid ${C.line}`, borderLeft: b.type === "tour" ? `3px solid ${C.coral}` : `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        {isDaily ? <Receipt size={15} /> : <Plane size={15} />}
        <span style={{ fontSize: 14, fontWeight: 700 }}>{isDaily ? "日潛" : "旅遊潛水"}</span>
        <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: C.page, color: C.mute }}>×{b.participants} 人</span>
        {isDaily && ref?.tankCount ? <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: C.page, color: C.mute }}>×{b.participants * ref.tankCount} 支</span> : null}
      </div>
      {ref?.date && <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", fontSize: 13, marginTop: 5 }}>{ref.sites?.length ? <span style={{ fontSize: 12, color: C.mute }}>📍 {ref.sites.join(" · ")}</span> : null}<span style={{ fontWeight: 700 }}>{ref.date} {ref.startTime}</span></div>}
      {ref?.title && <div style={{ marginTop: 5 }}><div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{ref.title}</div><div style={{ fontSize: 12, color: C.mute, marginTop: 1 }}>📅 {ref.dateStart} → {ref.dateEnd}</div></div>}
      {ref?.activityNote && <div style={{ background: "#eafaf3", color: "#0a7d4f", borderRadius: 8, padding: "7px 10px", fontSize: 12, marginTop: 7 }}>📣 活動提醒：{ref.activityNote}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: cbg, color: cfg }}>{d.label}</span>
        {cancellable && <button onClick={onCancel} style={{ fontSize: 11, border: `1px solid ${C.coral}`, color: C.coral, background: "none", borderRadius: 7, padding: "4px 9px" }}>✕ 取消訂單</button>}
        <button onClick={onAgreement} style={{ marginLeft: "auto", fontSize: 11, color: C.navy, background: "none", border: "none", textDecoration: "underline" }}>📜 同意聲明</button>
      </div>

      {b.rentalGear.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>{b.rentalGear.map((g) => <span key={g.itemType} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: C.page, color: C.mute }}>{GEAR_LBL(g.itemType)}{(g.qty ?? 1) > 1 ? ` ×${g.qty}` : ""}</span>)}</div>}

      {b.type === "tour" && b.totalAmount > 0 && (
        <div style={{ marginTop: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 4 }}><span style={{ color: C.mute }}>付款進度</span><span style={{ fontWeight: 600 }}>{b.paidAmount.toLocaleString()} / {b.totalAmount.toLocaleString()}</span></div>
          <div style={{ height: 6, borderRadius: 999, background: C.page, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress}%`, background: C.okFg }} /></div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>{[["預約", true], ["訂金", b.paidAmount >= b.depositAmount], ["尾款", b.paymentStatus === "fully_paid"], ["出發", b.status === "completed"]].map(([l, ok], i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}><div style={{ width: 20, height: 20, borderRadius: "50%", margin: "0 auto 2px", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, background: ok ? C.okFg : C.page, color: ok ? "#fff" : C.mute }}>{ok ? <Check size={12} /> : i + 1}</div><span style={{ fontSize: 10, color: C.mute }}>{l}</span></div>
          ))}</div>
          {b.paidAmount > 0 && unpaid > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 8 }}><span style={{ color: "#0a7d4f", fontWeight: 500 }}>已付訂金 NT$ {b.paidAmount.toLocaleString()}</span><span style={{ color: C.coral, fontWeight: 700 }}>尾款 NT$ {unpaid.toLocaleString()}</span></div>}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `0.5px solid ${C.line}`, marginTop: 11, paddingTop: 11 }}>
        {needsPay ? (
          <>
            <a href={payHref} style={{ background: C.coral, color: "#fff", borderRadius: 999, padding: "8px 15px", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}>付款方式選擇</a>
            {deadline && daysLeft !== null && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 7, background: daysLeft <= 3 ? C.dangBg : C.warnBg, color: daysLeft <= 3 ? C.dangFg : C.warnFg }}>⏰ {deadline.toLocaleDateString("zh-TW", { month: "long", day: "numeric" })} 前付清{daysLeft > 0 ? `（剩 ${daysLeft} 天）` : "（已逾期）"}</span>}
          </>
        ) : <span style={{ fontSize: 10.5, color: C.mute }}>總金額</span>}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>{needsPay && <div style={{ fontSize: 10, color: C.mute }}>應付金額</div>}<div style={{ fontSize: 15, fontWeight: 700, color: C.coral }}>NT$ {b.totalAmount.toLocaleString()}</div></div>
        {(b.paymentStatus === "fully_paid" || b.paymentStatus === "deposit_paid") && <button onClick={refund} style={{ fontSize: 11, border: `1px solid ${C.coral}`, color: C.coral, background: "none", borderRadius: 999, padding: "6px 11px", width: "100%", marginTop: 2 }}>💸 申請退款</button>}
      </div>

      {b.paymentProofs.length > 0 && (
        <div style={{ borderTop: `0.5px solid ${C.line}`, marginTop: 10, paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: C.mute, marginBottom: 5 }}>我上傳的轉帳截圖（{b.paymentProofs.length} 張）</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{b.paymentProofs.map((p) => (
            <div key={p.id} style={{ position: "relative", width: 50, height: 50, borderRadius: 8, overflow: "hidden", border: `0.5px solid ${C.line}`, background: C.page }}>
              {(p.thumb ?? p.url) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.thumb ?? p.url ?? ""} alt={p.type} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 9, color: C.mute }}>無預覽</div>}
              {p.verifiedAt && <div style={{ position: "absolute", right: 0, bottom: 0, width: 15, height: 15, background: C.okFg, display: "grid", placeItems: "center", borderTopLeftRadius: 6 }}><Check size={10} color="#fff" /></div>}
            </div>
          ))}</div>
        </div>
      )}
    </div>
  );
}

function AgreementModal({ bk, pol, onClose }: { bk: MyBk; pol: { cancellation: string; safety: string }; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "88vh", overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><span style={{ fontSize: 15, fontWeight: 600 }}>同意聲明</span><button onClick={onClose} style={{ border: "none", background: "none", color: C.mute }}><X size={20} /></button></div>
        <div style={{ fontSize: 12, color: C.mute, marginBottom: 4 }}>您的簽名</div>
        {bk.signatureUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={bk.signatureUrl} alt="簽名" style={{ width: "100%", borderRadius: 8, border: `0.5px solid ${C.line}`, background: "#fff" }} /> : <div style={{ border: `1px dashed ${C.line}`, borderRadius: 8, padding: 16, textAlign: "center", fontSize: 12, color: C.mute }}>此訂單無簽名紀錄（可能為較早版本建立）</div>}
        <div style={{ fontSize: 11, color: C.mute, margin: "6px 0 14px" }}>簽署時間：{bk.signedAt ? new Date(bk.signedAt).toLocaleString("zh-TW") : bk.agreedToTermsAt ? new Date(bk.agreedToTermsAt).toLocaleString("zh-TW") : "—"}</div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📜 取消政策</div>
        <div style={{ background: C.page, borderRadius: 8, padding: 11, marginBottom: 14 }}><PolicyText>{pol.cancellation || "（尚未設定取消政策）"}</PolicyText></div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🛟 潛水安全注意事項</div>
        <div style={{ background: C.page, borderRadius: 8, padding: 11 }}><PolicyText>{pol.safety || "（尚未設定安全政策）"}</PolicyText></div>
      </div>
    </div>
  );
}

type MeView = null | "info" | "certs" | "notif" | "logs" | "credits";
function MeTab({ me, isAdmin, setRole, setTab }: { me: MeData | null; isAdmin: boolean; setRole: (r: Role) => void; setTab: (t: Tab) => void }) {
  const [view, setView] = useState<MeView>(null);
  if (view === "credits") return <CreditsView onBack={() => setView(null)} />;
  if (view && view !== "logs") return <ProfileView view={view} onBack={() => setView(null)} />;
  if (view === "logs") return <LogsView me={me} onBack={() => setView(null)} />;
  const name = me?.realName ?? me?.displayName ?? "會員";
  const stats: Array<[string, string]> = [
    [String(me?.haiwangziLogCount ?? 0), "海王子潛次"],
    [String(me?.creditBalance ?? 0), "抵用金"],
    [String(me?.stats?.totalBookings ?? 0), "進行中"],
    [me?.vipLevel ? `LV${me.vipLevel}` : "會員", "等級"],
  ];
  async function logout() { try { await fetch("/api/m2/session", { method: "DELETE", credentials: "include" }); } catch { /* ignore */ } window.location.reload(); }
  return (
    <>
      <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.accBg, color: C.accFg, display: "grid", placeItems: "center", margin: "0 auto" }}><User size={30} /></div>
        <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8 }}>{name}</div>
        <div style={{ fontSize: 12, color: C.mute }}>{me?.email ?? ""}</div>
      </div>
      <div style={{ display: "flex", background: C.page, borderRadius: 12, padding: "12px 0", textAlign: "center", marginBottom: 6 }}>
        {stats.map(([a, b]) => <div key={b} style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 500 }}>{a}</div><div style={{ fontSize: 11, color: C.mute }}>{b}</div></div>)}
      </div>
      <Sect t="帳戶" />
      <LRow Icon={User} label="個人資訊" right={me?.phone ?? ""} onClick={() => setView("info")} />
      <LRow Icon={School} label="證照 / 潛伴" right={me?.cert ?? "未填"} onClick={() => setView("certs")} />
      <LRow Icon={Bell} label="通知偏好" onClick={() => setView("notif")} />
      <Sect t="紀錄" />
      <LRow Icon={Receipt} label="預約紀錄" right={String(me?.stats?.completed ?? 0)} onClick={() => setTab("orders")} />
      <LRow Icon={Waves} label="潛水紀錄" right={`${me?.haiwangziLogCount ?? 0} 潛`} onClick={() => setView("logs")} />
      <LRow Icon={SlidersHorizontal} label="抵用金明細" right={ntd(me?.creditBalance ?? 0)} onClick={() => setView("credits")} />
      {isAdmin && (<>
        <Sect t="管理" />
        <button onClick={() => setRole("coach")} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", borderBottom: `0.5px solid ${C.line}`, background: "none", textAlign: "left" }}>
          <LifeBuoy size={19} color={C.okFg} /><span style={{ flex: 1, fontSize: 14 }}>教練到場點名</span><ChevronRight size={16} color={C.mute} />
        </button>
        <button onClick={() => setRole("admin")} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", borderBottom: `0.5px solid ${C.line}`, background: "none", textAlign: "left" }}>
          <ShieldCheck size={19} color={C.proFg} /><span style={{ flex: 1, fontSize: 14 }}>後台管理</span><ChevronRight size={16} color={C.mute} />
        </button>
      </>)}
      <Sect t="其他" />
      <button onClick={logout} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", background: "none", textAlign: "left", color: C.dangFg }}>
        <ArrowLeft size={19} /><span style={{ flex: 1, fontSize: 14 }}>登出</span>
      </button>
    </>
  );
}

// 個人資訊 / 證照·潛伴 / 通知偏好 —— 皆 PATCH /api/me（沿用 LIFF profile 欄位）
interface ProfileMe { realName: string | null; phone: string | null; email: string | null; emailVerifiedAt: string | null; notifyByLine: boolean; notifyByEmail: boolean; cert: Cert | null; certNumber: string | null; logCount: number | null; birthday: string | null; emergencyContact: { name: string; phone: string; relationship: string } | null; companions: Companion2[] }
function ProfileView({ view, onBack }: { view: "info" | "certs" | "notif"; onBack: () => void }) {
  const [m, setM] = useState<ProfileMe | null>(null);
  const [saved, setSaved] = useState(0); const [saving, setSaving] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  useEffect(() => { fetch("/api/me", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((u) => setM({ realName: u.realName, phone: u.phone ? formatPhoneTW(u.phone) : "", email: u.email ?? "", emailVerifiedAt: u.emailVerifiedAt ?? null, notifyByLine: u.notifyByLine ?? true, notifyByEmail: u.notifyByEmail ?? true, cert: u.cert ?? null, certNumber: u.certNumber ?? "", logCount: u.logCount ?? 0, birthday: u.birthday ? String(u.birthday).slice(0, 10) : "", emergencyContact: u.emergencyContact ?? null, companions: u.companions ?? [] })).catch(() => {}); }, []);
  function up(p: Partial<ProfileMe>) { setM((s) => s ? { ...s, ...p } : s); }
  async function save(extra?: Partial<{ companions: Companion2[] }>) {
    if (!m) return; setSaving(true);
    try {
      await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({
        realName: m.realName || null, phone: m.phone || null, email: m.email?.trim() || null, notifyByLine: m.notifyByLine, notifyByEmail: m.notifyByEmail, cert: m.cert || null, certNumber: m.certNumber || null, logCount: Number(m.logCount) || 0, birthday: m.birthday || null, emergencyContact: m.emergencyContact?.name && m.emergencyContact?.phone ? m.emergencyContact : null, ...(extra?.companions ? { companions: extra.companions.filter((c) => c.name.trim().length >= 1) } : {}),
      }) });
      setSaved(Date.now());
    } catch { window.alert("儲存失敗，請稍後再試"); } finally { setSaving(false); }
  }
  async function sendVerify() { setVerifyMsg(""); try { const r = await fetch("/api/me/send-verify-email", { method: "POST", credentials: "include" }); const d = await r.json().catch(() => ({})); setVerifyMsg(r.ok ? "✓ 驗證信已寄出，請至信箱點擊連結" : (d.error || "寄送失敗")); } catch { setVerifyMsg("寄送失敗，請稍後再試"); } }
  const title = view === "info" ? "個人資訊" : view === "certs" ? "證照 / 潛伴" : "通知偏好";
  if (!m) return <><SubHeader title={title} onBack={onBack} /><div style={{ color: C.mute, fontSize: 13, padding: "20px 0", textAlign: "center" }}>載入中…</div></>;
  const saveBtn = (extra?: Partial<{ companions: Companion2[] }>) => <button onClick={() => save(extra)} disabled={saving} style={{ width: "100%", height: 46, background: C.accFg, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, marginTop: 14, opacity: saving ? 0.6 : 1 }}>{saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存"}</button>;
  return (
    <>
      <SubHeader title={title} onBack={onBack} />
      {view === "info" && (
        <BCard>
          <Lab>姓名</Lab><input value={m.realName ?? ""} onChange={(e) => up({ realName: e.target.value })} placeholder="本名" style={INP} />
          <div style={{ marginTop: 10 }}><Lab>手機</Lab><input value={m.phone ?? ""} onChange={(e) => up({ phone: formatPhoneTW(e.target.value) })} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={INP} /></div>
          <div style={{ marginTop: 10 }}><Lab>Email（收預約確認 / 行前通知 / 發票）</Lab><input value={m.email ?? ""} onChange={(e) => up({ email: e.target.value })} inputMode="email" placeholder="you@example.com" style={INP} />
            <div style={{ marginTop: 6 }}>{m.emailVerifiedAt ? <span style={{ fontSize: 11.5, color: C.okFg }}>✓ Email 已驗證</span> : <button onClick={sendVerify} style={{ fontSize: 11.5, border: `1px solid ${C.accFg}`, color: C.accFg, background: "none", borderRadius: 999, padding: "4px 12px" }}>發送驗證信 🎁 完成首潛得 100 元獎勵</button>}{verifyMsg && <div style={{ fontSize: 11.5, color: C.okFg, marginTop: 5 }}>{verifyMsg}</div>}</div>
          </div>
          <div style={{ marginTop: 10 }}><Lab>生日（生日當月發放抵用金 🎂・填寫後不可自行修改）</Lab><input type="date" value={m.birthday ?? ""} disabled={!!m.birthday} onChange={(e) => up({ birthday: e.target.value })} style={{ ...INP, opacity: m.birthday ? 0.6 : 1 }} /></div>
          <div style={{ fontSize: 12.5, fontWeight: 600, margin: "14px 0 6px" }}>緊急聯絡人</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input value={m.emergencyContact?.name ?? ""} onChange={(e) => up({ emergencyContact: { name: e.target.value, phone: m.emergencyContact?.phone ?? "", relationship: m.emergencyContact?.relationship ?? "" } })} placeholder="姓名" style={INP} />
            <input value={m.emergencyContact?.relationship ?? ""} onChange={(e) => up({ emergencyContact: { name: m.emergencyContact?.name ?? "", phone: m.emergencyContact?.phone ?? "", relationship: e.target.value } })} placeholder="關係" style={INP} />
          </div>
          <input value={m.emergencyContact?.phone ?? ""} onChange={(e) => up({ emergencyContact: { name: m.emergencyContact?.name ?? "", phone: formatPhoneTW(e.target.value), relationship: m.emergencyContact?.relationship ?? "" } })} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={{ ...INP, marginTop: 8 }} />
          {saveBtn()}
        </BCard>
      )}
      {view === "certs" && (
        <>
          <BCard title="我的證照">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div><Lab>證照等級</Lab><select value={m.cert ?? ""} onChange={(e) => up({ cert: (e.target.value || null) as Cert | null })} style={SELP}><option value="">未填</option>{M2_CERTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
              <div><Lab>累計潛水支數</Lab><input value={m.logCount ?? 0} onChange={(e) => up({ logCount: Number(e.target.value.replace(/\D/g, "")) || 0 })} inputMode="numeric" style={{ ...INP, textAlign: "center" }} /></div>
            </div>
            <div style={{ marginTop: 8 }}><Lab>證照編號</Lab><input value={m.certNumber ?? ""} onChange={(e) => up({ certNumber: e.target.value })} placeholder="證照卡上的號碼" style={INP} /></div>
          </BCard>
          <BCard title={`常用潛伴（${m.companions.length}）`} sub="下單時可一鍵帶入">
            {m.companions.map((c, i) => (
              <div key={c.id ?? i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>潛伴 #{i + 1}</span><button onClick={() => { if (window.confirm("確定刪除這位潛伴？")) up({ companions: m.companions.filter((_, j) => j !== i) }); }} style={{ fontSize: 11, color: C.coral, background: "none", border: "none" }}>刪除</button></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <input value={c.name} onChange={(e) => up({ companions: m.companions.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="姓名 *" style={INP} />
                  <input value={c.phone} onChange={(e) => up({ companions: m.companions.map((x, j) => j === i ? { ...x, phone: formatPhoneTW(e.target.value) } : x) })} inputMode="numeric" maxLength={11} placeholder="手機" style={INP} />
                  <select value={c.cert ?? ""} onChange={(e) => up({ companions: m.companions.map((x, j) => j === i ? { ...x, cert: (e.target.value || null) as Cert | null } : x) })} style={SELP}><option value="">證照</option>{M2_CERTS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}</select>
                  <input value={c.relationship} onChange={(e) => up({ companions: m.companions.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x) })} placeholder="關係" style={INP} />
                </div>
              </div>
            ))}
            <button onClick={() => up({ companions: [...m.companions, { id: undefined, name: "", phone: "", cert: null, certNumber: "", logCount: 0, relationship: "" }] })} style={{ width: "100%", border: `1px dashed ${C.line}`, background: "none", color: C.accFg, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>＋ 新增潛伴</button>
          </BCard>
          {saveBtn({ companions: m.companions })}
        </>
      )}
      {view === "notif" && (
        <BCard title="通知偏好" sub="選擇用哪些管道接收預約確認、行前提醒與重要通知">
          {([["notifyByLine", "LINE 通知", "透過官方帳號推播（最即時）"], ["notifyByEmail", "Email 通知", "寄到你的信箱（需先驗證 Email）"]] as const).map(([k, t, s]) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `0.5px solid ${C.line}` }}>
              <span style={{ flex: 1 }}><span style={{ fontSize: 14, display: "block" }}>{t}</span><span style={{ fontSize: 11.5, color: C.mute }}>{s}</span></span>
              <input type="checkbox" checked={m[k]} onChange={(e) => up({ [k]: e.target.checked } as Partial<ProfileMe>)} style={{ width: 20, height: 20 }} />
            </label>
          ))}
          {saveBtn()}
        </BCard>
      )}
    </>
  );
}

// 潛水紀錄（海王子累積氣瓶數 / 個人累計潛次）
function LogsView({ me, onBack }: { me: MeData | null; onBack: () => void }) {
  return (
    <>
      <SubHeader title="潛水紀錄" onBack={onBack} />
      <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
        <div style={{ flex: 1, background: C.page, borderRadius: 12, padding: 14, textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 700, color: C.accFg }}>{me?.haiwangziLogCount ?? 0}</div><div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>海王子累積氣瓶</div></div>
        <div style={{ flex: 1, background: C.page, borderRadius: 12, padding: 14, textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 700, color: C.okFg }}>{me?.stats?.completed ?? 0}</div><div style={{ fontSize: 11.5, color: C.mute, marginTop: 2 }}>已完成活動</div></div>
      </div>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.8, background: C.page, borderRadius: 10, padding: "12px 14px" }}>「海王子累積氣瓶」是你在海王子完成的潛水支數,會累積成 VIP 等級與獎勵。每次與汪汪教練下水並完成到場點名後,系統會自動累計。</div>
    </>
  );
}

// 抵用金明細（/api/me/credits）
interface CreditTx2 { id: string; amount: number; reason: string; note?: string | null; refCode?: string | null; balanceAfter?: number; createdAt: string }
const CREDIT_REASON: Record<string, [string, string]> = { birthday: ["🎂", "生日抵用金"], vip_upgrade: ["✨", "升等獎勵"], refund: ["🔄", "退費補償"], used: ["💸", "訂單折抵"], admin_adjust: ["🛠", "管理員調整"], first_order_reward: ["🎉", "首單獎勵"], signup_reward: ["🎁", "註冊禮金"], vip_overflow: ["🏆", "VIP 滿級回饋"] };
function CreditsView({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<{ balance: number; totalIn: number; totalOut: number; txs: CreditTx2[] } | null>(null);
  useEffect(() => { fetch("/api/me/credits", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setData({ balance: d.balance ?? 0, totalIn: d.totalIn ?? 0, totalOut: d.totalOut ?? 0, txs: d.txs ?? [] })).catch(() => setData({ balance: 0, totalIn: 0, totalOut: 0, txs: [] })); }, []);
  return (
    <>
      <SubHeader title="抵用金明細" onBack={onBack} />
      {!data ? <div style={{ color: C.mute, fontSize: 13, padding: "20px 0", textAlign: "center" }}>載入中…</div> : (<>
        <div style={{ background: C.dangBg, borderRadius: 12, padding: "14px 0", textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: C.mute }}>目前餘額</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.coral }}>NT$ {data.balance.toLocaleString()}</div>
          <div style={{ display: "flex", gap: 9, padding: "10px 14px 0" }}>
            <div style={{ flex: 1, background: "rgba(255,255,255,.7)", borderRadius: 8, padding: "6px 0" }}><div style={{ fontSize: 10, color: C.mute }}>累計收入</div><div style={{ fontSize: 13, fontWeight: 700, color: C.okFg }}>+{data.totalIn.toLocaleString()}</div></div>
            <div style={{ flex: 1, background: "rgba(255,255,255,.7)", borderRadius: 8, padding: "6px 0" }}><div style={{ fontSize: 10, color: C.mute }}>累計支出</div><div style={{ fontSize: 13, fontWeight: 700, color: C.coral }}>-{data.totalOut.toLocaleString()}</div></div>
          </div>
        </div>
        {data.txs.length === 0 ? <div style={{ color: C.mute, fontSize: 13, padding: "24px 0", textAlign: "center", lineHeight: 1.7 }}>尚無紀錄。<br />生日當天或會員升等時系統會自動發放抵用金。</div>
          : data.txs.map((t) => { const [emoji, label] = CREDIT_REASON[t.reason] ?? ["·", t.reason]; const pos = t.amount >= 0; const main = t.reason === "admin_adjust" && t.note ? t.note : label;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `0.5px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{main}{t.refCode && <span style={{ fontSize: 9.5, fontFamily: "monospace", background: C.okBg, color: C.okFg, borderRadius: 5, padding: "1px 5px", marginLeft: 5 }}>{t.refCode}</span>}</div><div style={{ fontSize: 10.5, color: C.mute }}>{new Date(t.createdAt).toLocaleString("zh-TW")}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 700, color: pos ? C.okFg : C.coral }}>{pos ? "+" : ""}{t.amount.toLocaleString()}</div>{t.balanceAfter != null && <div style={{ fontSize: 10, color: C.mute }}>餘 {t.balanceAfter.toLocaleString()}</div>}</div>
              </div>
            );
          })}
      </>)}
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

function ApiList({ cat, onBooked }: { cat: "daily" | "tour"; onBooked: () => void }) {
  const [items, setItems] = useState<Array<M2Trip | M2Tour> | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<M2Trip | M2Tour | null>(null);
  useEffect(() => {
    let alive = true; setItems(null); setErr(false); setSel(null);
    const url = cat === "daily" ? `/api/trips?from=${m2Today()}&to=${m2Plus(60)}` : "/api/tours";
    fetch(url).then((r) => r.json()).then((d) => { if (alive) setItems(cat === "daily" ? (d.trips ?? []) : (d.tours ?? [])); }).catch(() => { if (alive) setErr(true); }); // v693：公開資料走快取(後端版本號失效),不再強制 no-store
    return () => { alive = false; };
  }, [cat]);
  if (sel) return cat === "daily"
    ? <DailyBook item={sel as M2Trip} onBack={() => setSel(null)} onBooked={onBooked} />
    : <TourBook item={sel as M2Tour} onBack={() => setSel(null)} onBooked={onBooked} />;
  const note = (t: string) => <div style={{ padding: "30px 0", textAlign: "center", color: C.mute, fontSize: 13 }}>{t}</div>;
  if (err) return note("載入失敗，請稍後再試");
  if (items === null) return note("載入中…");
  if (items.length === 0) return note(cat === "daily" ? "目前沒有開放的日潛場次" : "目前沒有開放的潛旅");
  return (
    <>
      {items.map((it) => cat === "daily"
        ? ((t) => <Sess key={t.id} onClick={() => setSel(t)} time={t.startTime} title={`${t.isNightDive ? "夜潛" : "日潛"} · ${t.sites.map((s) => s.name).join("＋") || "東北角"}`} sub={`${mdShort(t.date)} · ${t.tankCount} 潛`} tags={availBadge(t.available)} />)(it as M2Trip)
        : ((t) => <Sess key={t.id} onClick={() => setSel(t)} time={mdShort(t.dateStart)} title={t.title} sub={`${DEST_ZH[t.destination] ?? t.destination} · ${mdShort(t.dateStart)}~${mdShort(t.dateEnd)}`} tags={<>{availBadge(t.available)}{t.deposit ? <span style={{ fontSize: 11, color: C.mute }}>訂金 {t.deposit.toLocaleString()}</span> : null}</>} />)(it as M2Tour))}
    </>
  );
}

// 共用：載入會員/政策資料的 hook
function useBookingData() {
  const [me, setMe] = useState<MeFull | null>(null);
  const [pol, setPol] = useState<{ cancellation: string; safety: string }>({ cancellation: "", safety: "" });
  useEffect(() => {
    fetch("/api/me", { credentials: "include", cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => d && setMe(d)).catch(() => {});
    fetch("/api/config").then((r) => r.json()).then((c) => setPol({ cancellation: c.cancellationPolicy ?? "", safety: c.safetyPolicy ?? "" })).catch(() => {});
  }, []);
  return { me, pol };
}
function BackBar({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, border: "none", background: "none", color: C.accFg, padding: "0 0 10px" }}><ArrowLeft size={15} />返回</button>;
}
function SubmitBar({ total, deposit, busy, disabled, label, onClick, err }: { total: number; deposit?: number; busy: boolean; disabled: boolean; label: string; onClick: () => void; err: string }) {
  return (
    <div style={{ position: "sticky", bottom: 0, background: C.card, borderTop: `0.5px solid ${C.line}`, padding: "11px 0 4px", marginTop: 6 }}>
      {err && <div style={{ background: C.dangBg, color: C.dangFg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginBottom: 9 }}>{err}</div>}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.mute }}>總金額</div>
          <div style={{ fontSize: 23, fontWeight: 700, color: C.coral }}>NT$ {total.toLocaleString()}</div>
          {deposit != null && <div style={{ fontSize: 11, color: C.mute }}>訂金 NT$ {deposit.toLocaleString()}</div>}
        </div>
        <button onClick={onClick} disabled={busy || disabled} style={{ flex: "none", height: 46, padding: "0 22px", background: busy || disabled ? C.mute : C.coral, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, opacity: busy || disabled ? 0.6 : 1 }}>{busy ? "送出中…" : label}</button>
      </div>
    </div>
  );
}

// 一日潛水：完整下單（人數 / 潛次 / 裝備 / 個人資料 / 緊急聯絡人 / 潛伴 / 抵用金 / 優惠代碼 / 政策簽名）
function DailyBook({ item, onBack, onBooked }: { item: M2Trip; onBack: () => void; onBooked: () => void }) {
  const { me, pol } = useBookingData();
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [pax, setPax] = useState(1);
  const [tank, setTank] = useState(item.tankCount);
  const [gearQty, setGearQty] = useState<Record<string, number>>({});
  const [gearOpen, setGearOpen] = useState(false);
  const [realName, setRealName] = useState(""); const [phone, setPhone] = useState("");
  const [cert, setCert] = useState<Cert | "">(""); const [certNo, setCertNo] = useState(""); const [logc, setLogc] = useState("");
  const [eName, setEName] = useState(""); const [ePhone, setEPhone] = useState(""); const [eRel, setERel] = useState("");
  const [notes, setNotes] = useState("");
  const [companions, setCompanions] = useState<Companion2[]>([]);
  const [creditUsed, setCreditUsed] = useState(0);
  const [promoIn, setPromoIn] = useState(""); const [promo, setPromo] = useState<{ code: string; discount: number; label: string } | null>(null); const [promoMsg, setPromoMsg] = useState("");
  const [agree, setAgree] = useState<{ ok: boolean; signatureDataUrl: string | null }>({ ok: false, signatureDataUrl: null });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => { fetch(`/api/trips/${item.id}`).then((r) => r.json()).then((t) => { setTrip(t); setTank(t.tankCount); }).catch(() => {}); }, [item.id]); // v693：公開資料走快取
  useEffect(() => { if (!me) return; if (me.realName) setRealName(me.realName); if (me.phone) setPhone(formatPhoneTW(me.phone)); if (me.cert) setCert(me.cert); if (me.certNumber) setCertNo(me.certNumber); if (me.logCount != null) setLogc(String(me.logCount)); if (me.emergencyContact) { setEName(me.emergencyContact.name); setEPhone(formatPhoneTW(me.emergencyContact.phone)); setERel(me.emergencyContact.relationship); } }, [me]);
  useEffect(() => { setCompanions((prev) => { const want = Math.max(0, pax - 1); const next = prev.slice(0, want); while (next.length < want) next.push({ name: "", phone: "", cert: null, certNumber: "", logCount: 0, relationship: "" }); return next; }); }, [pax]);

  const credit = me?.creditBalance ?? 0;
  const gearPct = me?.gearDiscountPct ?? 100;
  const staff = me?.staffTank ?? { active: false, price: 0 };
  const tankPromo = me?.tankPromo ?? { active: false, discount: 0, reason: "" };
  const gearList = useMemo(() => GEAR_DEF.map((g) => ({ ...g, qty: gearQty[g.t] ?? 0 })).filter((g) => g.qty > 0), [gearQty]);
  const gearTotal = gearList.reduce((s, g) => s + g.price * g.qty, 0);
  const gearDisc = gearPct < 100 ? Math.round((gearTotal * gearPct) / 100) : gearTotal;
  const extraTank = trip?.pricing.extraTank ?? 0;
  const tankCut = (!staff.active && tankPromo.active) ? Math.min(tankPromo.discount, extraTank) : 0;
  const effTank = staff.active ? Math.max(0, Math.min(staff.price, extraTank)) : Math.max(0, extraTank - tankCut);
  const dives = effTank * tank * pax;
  const baseTrip = trip?.pricing.baseTrip ?? 0;
  const total = dives + baseTrip + gearDisc;
  const codeDisc = (!staff.active && promo && promo.discount > tankCut * tank * pax) ? promo.discount : 0;
  const afterCode = Math.max(0, total - codeDisc);
  const payable = Math.max(0, afterCode - Math.min(creditUsed, credit, afterCode));
  const closed = trip ? isBookingClosed(trip.date, trip.startTime) : false;
  const compOk = companions.every((c) => c.name.trim().length >= 2 && c.cert);
  const canSubmit = !!trip && !closed && agree.ok && realName.trim().length >= 2 && phone.trim().length >= 8 && eName.trim().length >= 2 && ePhone.trim().length >= 8 && cert !== "" && certNo.trim().length >= 1 && logc.trim().length >= 1 && compOk;

  async function applyPromo() {
    const code = promoIn.trim().toUpperCase(); if (!code) return; setPromoMsg("");
    try {
      const r = await fetch("/api/promo/validate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ code, type: "daily", orderAmount: total + tankCut * tank * pax, totalTanks: tank * pax }) }).then((x) => x.json());
      if (!r.ok) { setPromo(null); setPromoMsg(r.reason ?? "優惠代碼無效"); }
      else { setPromo({ code: r.code, discount: r.discount ?? 0, label: r.label ?? "" }); setPromoMsg((r.discount ?? 0) > tankCut * tank * pax ? "" : "目前已有更優的氣瓶折扣，此代碼不會額外折抵"); }
    } catch { setPromoMsg("驗證失敗"); }
  }
  async function submit() {
    if (!trip || !canSubmit || busy) { if (!agree.ok) setErr("請先閱讀並同意政策、完成簽名"); return; }
    setBusy(true); setErr("");
    try {
      const participantDetails = [{ name: realName, phone, cert: cert || null, certNumber: certNo.trim(), logCount: logc ? Number(logc) : 0, relationship: "", isSelf: true }, ...companions.map((c) => ({ name: c.name, phone: c.phone, cert: c.cert, certNumber: c.certNumber, logCount: c.logCount, relationship: c.relationship, isSelf: false }))];
      const body = { tripId: trip.id, participants: pax, tankCount: tank, rentalGear: gearList.map((g) => ({ itemType: g.t, price: g.price, qty: g.qty })), notes: notes || undefined, creditUsed: Math.min(creditUsed, credit, afterCode), promoCode: promo?.code, agreedToTerms: true as const, signatureDataUrl: agree.signatureDataUrl ?? undefined, realName, phone, cert: cert || undefined, certNumber: certNo.trim() || undefined, logCount: logc ? Number(logc) : undefined, emergencyContact: { name: eName, phone: ePhone, relationship: eRel || "其他" }, participantDetails };
      const r = await fetch("/api/bookings/daily", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "預約失敗，請稍後再試"); return; }
      onBooked();
    } catch { setErr("連線失敗，請重試"); } finally { setBusy(false); }
  }
  if (!trip) return <><BackBar onBack={onBack} /><div style={{ padding: "30px 0", textAlign: "center", color: C.mute, fontSize: 13 }}>載入場次中…</div></>;
  const title = `${trip.isNightDive ? "夜潛" : "日潛"} · ${trip.sites.map((s) => s.name).join("＋") || "東北角"}`;
  return (
    <div>
      <BackBar onBack={onBack} />
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 11, background: trip.isNightDive ? "linear-gradient(135deg,#3730a3,#1e1b4b)" : C.card, color: trip.isNightDive ? "#fff" : C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600 }}><Anchor size={15} style={{ opacity: .7 }} />{trip.sites.map((s) => s.name).join(" · ") || "東北角"}{trip.isNightDive && <Moon size={13} />}</div>
        <div style={{ fontSize: 12, opacity: trip.isNightDive ? .9 : 1, color: trip.isNightDive ? "#c7d2fe" : C.mute, marginTop: 3 }}>{trip.date}（{["日", "一", "二", "三", "四", "五", "六"][new Date(trip.date).getDay()]}）{trip.startTime} · 最多 {trip.tankCount} 潛{trip.coaches.length ? ` · 教練 ${trip.coaches.map((c) => c.realName).join("、")}` : ""}</div>
        <div style={{ marginTop: 7 }}>{availBadge(trip.available)}</div>
      </div>
      {trip.activityNote && <div style={{ background: "#eafaf3", color: "#0a7d4f", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, marginBottom: 11 }}>📣 活動提醒：{trip.activityNote}</div>}

      <BCard title="預約內容">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 9 }}><span style={{ fontSize: 13 }}>人數</span><Stp value={pax} min={1} max={trip.available ?? 99} onChange={setPax} suffix="人" /></div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `0.5px solid ${C.line}`, paddingTop: 9 }}>
          <div><div style={{ fontSize: 13 }}>潛次</div><div style={{ fontSize: 10.5, color: C.mute }}>每支 NT$ {extraTank.toLocaleString()}（含空氣瓶）</div></div>
          <Stp value={tank} min={1} max={trip.tankCount} onChange={setTank} suffix="潛" />
        </div>
        <div style={{ borderTop: `0.5px solid ${C.line}`, paddingTop: 9, marginTop: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13 }}>租賃裝備</span><button onClick={() => setGearOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, border: `1px solid ${C.line}`, background: "#fff", borderRadius: 8, padding: "5px 11px" }}><Plus size={13} />{gearList.length ? "編輯" : "需要租裝備"}</button></div>
          {gearList.length > 0 ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{gearList.map((g) => <span key={g.t} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.okBg, color: C.okFg, borderRadius: 999, padding: "3px 9px", fontSize: 11.5 }}>{g.label}{g.qty > 1 ? `×${g.qty}` : ""} +{(g.price * g.qty).toLocaleString()}<button onClick={() => setGearQty((s) => ({ ...s, [g.t]: 0 }))} style={{ border: "none", background: "none", padding: 0, color: C.okFg, display: "inline-flex" }}><X size={12} /></button></span>)}</div>
            : <div style={{ fontSize: 11, color: C.mute, marginTop: 5 }}>未選 — 自備裝備不需要點</div>}
          {gearPct < 100 && <div style={{ fontSize: 11, color: C.okFg, marginTop: 6 }}>🎖 VIP{me?.vipLevel} 裝備租借 {Math.round(100 - gearPct)}% off（自動折，只折裝備）</div>}
        </div>
      </BCard>

      <BCard title="個人資料" sub="必填，方便教練掌握你的經驗">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Lab>姓名 *</Lab><input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="本名" style={INP} /></div>
          <div><Lab>手機 *</Lab><input value={phone} onChange={(e) => setPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={INP} /></div>
          <div><Lab>證照等級 *</Lab><select value={cert} onChange={(e) => setCert(e.target.value as Cert | "")} style={SELP}><option value="">請選擇</option>{M2_CERTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><Lab>累計潛水支數 *</Lab><input value={logc} onChange={(e) => setLogc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="新手填 0" style={{ ...INP, textAlign: "center" }} /></div>
        </div>
        <div style={{ marginTop: 8 }}><Lab>證照號碼 *</Lab><input value={certNo} onChange={(e) => setCertNo(e.target.value)} placeholder="證照卡上的號碼" style={INP} /></div>
      </BCard>

      <BCard title="緊急聯絡人" sub="必填">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="姓名 *" style={INP} />
          <input value={eRel} onChange={(e) => setERel(e.target.value)} placeholder="關係 *" style={INP} />
        </div>
        <input value={ePhone} onChange={(e) => setEPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678 *" style={{ ...INP, marginTop: 8 }} />
      </BCard>

      {companions.length > 0 && (
        <BCard title={`潛伴資料（${companions.length} 位）`} sub="同行潛伴姓名與證照（必填）">
          {companions.map((c, i) => (
            <div key={i} style={{ border: `1px dashed ${c.name.trim().length >= 2 && c.cert ? C.okFg : C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>潛伴 #{i + 2}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input value={c.name} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="姓名 *" style={INP} />
                <input value={c.phone} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, phone: formatPhoneTW(e.target.value) } : x))} inputMode="numeric" maxLength={11} placeholder="手機" style={INP} />
                <select value={c.cert ?? ""} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, cert: (e.target.value || null) as Cert | null } : x))} style={SELP}><option value="">證照 *</option>{M2_CERTS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}</select>
                <input value={c.relationship} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} placeholder="關係" style={INP} />
              </div>
            </div>
          ))}
        </BCard>
      )}

      <BCard title="📝 備註 / 特殊需求（教練可見）" sub="選填。耳壓不適 / 過敏 / 用藥等">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="例：右耳曾耳壓不適、對蝦過敏…" style={{ ...INP, height: "auto", padding: 10, lineHeight: 1.6, resize: "vertical" }} />
      </BCard>

      <BCard title="付款與抵用金">
        <div style={{ background: C.okBg, color: C.okFg, borderRadius: 9, padding: "9px 12px", fontSize: 12, marginBottom: 10 }}>💳 下單後到「訂單」分頁選付款方式（轉帳 / LINE Pay / 其他）並上傳截圖。</div>
        {!staff.active && (
          <div style={{ marginBottom: 10 }}>
            <Lab>🎏 優惠代碼</Lab>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={promoIn} onChange={(e) => setPromoIn(e.target.value.toUpperCase())} placeholder="輸入優惠代碼" style={{ ...INP, fontFamily: "monospace" }} />
              <button onClick={applyPromo} disabled={!promoIn.trim()} style={{ flex: "none", background: C.navy, color: "#fff", border: "none", borderRadius: 9, padding: "0 16px", fontSize: 13, opacity: promoIn.trim() ? 1 : 0.5 }}>套用</button>
            </div>
            {promo && codeDisc > 0 && <div style={{ fontSize: 11.5, color: C.okFg, marginTop: 6 }}>✓ {promo.label}：折 NT$ {codeDisc.toLocaleString()}</div>}
            {promoMsg && <div style={{ fontSize: 11.5, color: C.coral, marginTop: 6 }}>{promoMsg}</div>}
          </div>
        )}
        {credit > 0 ? (
          <div style={{ border: `1.5px solid ${C.coral}`, borderRadius: 10, padding: 11, background: C.dangBg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 12 }}>🎁 抵用金折抵（餘額 NT$ {credit.toLocaleString()}）</span>
              <button onClick={() => setCreditUsed(Math.min(credit, afterCode))} style={{ fontSize: 10.5, background: C.coral, color: "#fff", border: "none", borderRadius: 999, padding: "3px 10px" }}>全部用</button>
            </div>
            <input type="number" min={0} max={Math.min(credit, afterCode)} value={creditUsed || ""} onChange={(e) => setCreditUsed(Math.min(Math.max(0, Number(e.target.value) || 0), credit, afterCode))} placeholder="NT$ 0" style={{ ...INP, textAlign: "center", fontWeight: 600 }} />
          </div>
        ) : <div style={{ fontSize: 11, color: C.mute }}>🎁 目前無抵用金（生日禮金 / VIP 升等 / 早鳥回饋會自動入帳）</div>}
        <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: C.navy, marginTop: 9 }}>應付 NT$ {payable.toLocaleString()}</div>
      </BCard>

      <AgreeBlock cancellationPolicy={pol.cancellation} safetyPolicy={pol.safety} onChange={setAgree} />

      <BCard>
        <div style={{ fontSize: 12, color: C.mute, lineHeight: 1.9 }}>
          {baseTrip > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>基本費（整單）</span><span>NT$ {baseTrip.toLocaleString()}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>潛水 {effTank.toLocaleString()} × {tank} 支 × {pax} 人</span><span>NT$ {dives.toLocaleString()}</span></div>
          {gearTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>裝備</span><span>+ NT$ {gearDisc.toLocaleString()}</span></div>}
          {codeDisc > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: C.okFg }}><span>優惠代碼</span><span>− NT$ {codeDisc.toLocaleString()}</span></div>}
          {creditUsed > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: C.coral }}><span>抵用金折抵</span><span>− NT$ {Math.min(creditUsed, credit, afterCode).toLocaleString()}</span></div>}
        </div>
      </BCard>

      {closed && <div style={{ background: C.dangBg, color: C.dangFg, borderRadius: 9, padding: "9px 12px", fontSize: 12, marginBottom: 9 }}>⛔ 此場次已於開始前 2 小時截止預約。可改用「客製潛水」提出需求。</div>}
      <SubmitBar total={payable} busy={busy} disabled={!canSubmit} label={closed ? "已截止" : "確認預約"} onClick={submit} err={err} />

      <Dialog open={gearOpen} onClose={() => setGearOpen(false)} title="租賃裝備">
        <div style={{ fontSize: 11, color: C.mute, marginBottom: 8 }}>按 ＋ 加數量。2 人各租 1 件 BCD → BCD 數量 2。{gearPct < 100 && ` VIP${me?.vipLevel} 享 ${Math.round(100 - gearPct)}% off。`}</div>
        {GEAR_DEF.map((g) => { const q = gearQty[g.t] ?? 0; return (
          <div key={g.t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${q > 0 ? C.okFg : C.line}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
            <div><div style={{ fontSize: 13, fontWeight: 500 }}>{g.label}</div><div style={{ fontSize: 10.5, color: C.mute }}>+{g.price} / 件{q > 0 ? ` · 小計 ${(g.price * q).toLocaleString()}` : ""}</div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setGearQty((s) => ({ ...s, [g.t]: Math.max(0, (s[g.t] ?? 0) - 1) }))} disabled={q <= 0} style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${C.line}`, background: "#fff", opacity: q <= 0 ? 0.3 : 1 }}>−</button>
              <span style={{ width: 18, textAlign: "center", fontWeight: 600 }}>{q}</span>
              <button onClick={() => setGearQty((s) => ({ ...s, [g.t]: Math.min(20, (s[g.t] ?? 0) + 1) }))} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: C.okFg, color: "#fff" }}>＋</button>
            </div>
          </div>
        ); })}
        <button onClick={() => setGearOpen(false)} style={{ width: "100%", height: 44, background: C.navy, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, marginTop: 4 }}>完成（+ NT$ {gearTotal.toLocaleString()}）</button>
      </Dialog>
    </div>
  );
}

// 旅遊潛水：完整報名（人數 / 加購 / 報名資料 / 緊急聯絡人 / 抵用金 / 政策簽名 / 訂金）
function TourBook({ item, onBack, onBooked }: { item: M2Tour; onBack: () => void; onBooked: () => void }) {
  const { me, pol } = useBookingData();
  const [tour, setTour] = useState<TourFull | null>(null);
  const [pax, setPax] = useState(1);
  const [addons, setAddons] = useState<Record<string, boolean>>({});
  const [realName, setRealName] = useState(""); const [phone, setPhone] = useState("");
  const [cert, setCert] = useState<Cert | "">(""); const [certNo, setCertNo] = useState(""); const [logc, setLogc] = useState("");
  const [eName, setEName] = useState(""); const [ePhone, setEPhone] = useState(""); const [eRel, setERel] = useState("");
  const [notes, setNotes] = useState("");
  const [creditUsed, setCreditUsed] = useState(0);
  const [agree, setAgree] = useState<{ ok: boolean; signatureDataUrl: string | null }>({ ok: false, signatureDataUrl: null });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => { fetch(`/api/tours/${item.id}`).then((r) => r.json()).then(setTour).catch(() => {}); }, [item.id]); // v693：公開資料走快取
  useEffect(() => { if (!me) return; if (me.realName) setRealName(me.realName); if (me.phone) setPhone(formatPhoneTW(me.phone)); if (me.cert) setCert(me.cert); if (me.certNumber) setCertNo(me.certNumber); if (me.logCount != null) setLogc(String(me.logCount)); if (me.emergencyContact) { setEName(me.emergencyContact.name); setEPhone(formatPhoneTW(me.emergencyContact.phone)); setERel(me.emergencyContact.relationship); } }, [me]);

  const credit = me?.creditBalance ?? 0;
  const addonSum = useMemo(() => tour ? tour.addons.filter((a) => addons[a.id]).reduce((s, a) => s + a.priceDelta, 0) : 0, [tour, addons]);
  const total = tour ? (tour.basePrice + addonSum) * pax : 0;
  const deposit = tour ? tour.deposit * pax : 0;
  const payable = Math.max(0, total - Math.min(creditUsed, credit, total));
  const canSubmit = !!tour && agree.ok && realName.trim().length >= 2 && phone.trim().length >= 8 && eName.trim().length >= 2 && ePhone.trim().length >= 8 && cert !== "" && certNo.trim().length >= 1 && logc.trim().length >= 1;

  async function submit() {
    if (!tour || !canSubmit || busy) { if (!agree.ok) setErr("請先閱讀並同意政策、完成簽名"); return; }
    setBusy(true); setErr("");
    try {
      const body = { tourId: tour.id, participants: pax, selectedAddons: Object.keys(addons).filter((k) => addons[k]), notes: notes || undefined, creditUsed: Math.min(creditUsed, credit, total), agreedToTerms: true as const, signatureDataUrl: agree.signatureDataUrl ?? undefined, realName, phone, cert: cert || undefined, certNumber: certNo.trim() || undefined, logCount: logc ? Number(logc) : undefined, emergencyContact: { name: eName, phone: ePhone, relationship: eRel || "其他" } };
      const r = await fetch("/api/bookings/tour", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "報名失敗，請稍後再試"); return; }
      onBooked();
    } catch { setErr("連線失敗，請重試"); } finally { setBusy(false); }
  }
  if (!tour) return <><BackBar onBack={onBack} /><div style={{ padding: "30px 0", textAlign: "center", color: C.mute, fontSize: 13 }}>載入潛旅中…</div></>;
  return (
    <div>
      <BackBar onBack={onBack} />
      <div style={{ borderRadius: 12, padding: 14, marginBottom: 11, background: "linear-gradient(135deg,#0b4f86,#031a32)", color: "#fff" }}>
        <div style={{ fontSize: 11, opacity: .85 }}>{tour.dateStart} → {tour.dateEnd}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{tour.title}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 9, fontSize: 12 }}>
          <span>起跳 <b>{tour.basePrice.toLocaleString()}</b></span><span>訂金 <b>{tour.deposit.toLocaleString()}</b></span><span>剩 <b>{tour.available}/{tour.capacity}</b></span>
        </div>
      </div>
      {tour.activityNote && <div style={{ background: "#eafaf3", color: "#0a7d4f", borderRadius: 9, padding: "9px 12px", fontSize: 12.5, marginBottom: 11 }}>📣 活動提醒：{tour.activityNote}</div>}
      <div style={{ background: C.dangBg, color: C.dangFg, borderRadius: 9, padding: "9px 12px", fontSize: 12, marginBottom: 11 }}>💰 訂金請於下訂後 {tour.depositDueDays ?? 7} 天內繳清以保留名額；尾款請於出發前 30 天繳清{tour.finalDeadline ? `（${tour.finalDeadline.slice(0, 10)} 前）` : ""}。</div>

      {(tour.includes.length > 0 || tour.excludes.length > 0) && (
        <BCard title="含 / 不含">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, fontSize: 12 }}>
            <div style={{ background: C.okBg, borderRadius: 9, padding: 10 }}><div style={{ fontWeight: 600, marginBottom: 4 }}>含</div>{tour.includes.map((i, k) => <div key={k} style={{ display: "flex", gap: 4, marginBottom: 2 }}><Check size={12} color={C.okFg} style={{ flex: "none", marginTop: 2 }} />{i}</div>)}</div>
            <div style={{ background: C.page, borderRadius: 9, padding: 10 }}><div style={{ fontWeight: 600, marginBottom: 4 }}>不含</div>{tour.excludes.map((i, k) => <div key={k} style={{ display: "flex", gap: 4, marginBottom: 2 }}><X size={12} color={C.mute} style={{ flex: "none", marginTop: 2 }} />{i}</div>)}</div>
          </div>
        </BCard>
      )}
      {tour.addons.length > 0 && (
        <BCard title="加購">
          {tour.addons.map((a) => <button key={a.id} onClick={() => setAddons((s) => ({ ...s, [a.id]: !s[a.id] }))} style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", border: `1.5px solid ${addons[a.id] ? C.okFg : C.line}`, background: addons[a.id] ? C.okBg : "#fff", borderRadius: 10, padding: "10px 12px", marginBottom: 7, fontSize: 13 }}><span>{a.label}</span><span style={{ color: C.mute }}>{a.priceDelta >= 0 ? "+" : ""}{a.priceDelta.toLocaleString()}</span></button>)}
        </BCard>
      )}

      <BCard title="報名資料" sub="必填">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10 }}><span style={{ fontSize: 13 }}>人數</span><Stp value={pax} min={1} max={tour.available || 1} onChange={setPax} suffix="人" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Lab>姓名 *</Lab><input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="本名（與證照一致）" style={INP} /></div>
          <div><Lab>手機 *</Lab><input value={phone} onChange={(e) => setPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={INP} /></div>
          <div><Lab>證照等級 *</Lab><select value={cert} onChange={(e) => setCert(e.target.value as Cert | "")} style={SELP}><option value="">請選擇</option>{M2_CERTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><Lab>累計潛水支數 *</Lab><input value={logc} onChange={(e) => setLogc(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="新手填 0" style={{ ...INP, textAlign: "center" }} /></div>
        </div>
        <div style={{ marginTop: 8 }}><Lab>證照號碼 *</Lab><input value={certNo} onChange={(e) => setCertNo(e.target.value)} placeholder="證照卡上的號碼" style={INP} /></div>
        <div style={{ fontSize: 12.5, fontWeight: 600, margin: "12px 0 6px" }}>緊急聯絡人 *</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="姓名" style={INP} />
          <input value={eRel} onChange={(e) => setERel(e.target.value)} placeholder="關係" style={INP} />
        </div>
        <input value={ePhone} onChange={(e) => setEPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={{ ...INP, marginTop: 8 }} />
      </BCard>

      <BCard title="📝 備註 / 特殊需求" sub="選填。飲食 / 房型偏好 / 同行者">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="例：素食、想住雙人房、與 OOO 同房…" style={{ ...INP, height: "auto", padding: 10, lineHeight: 1.6, resize: "vertical" }} />
      </BCard>

      <BCard title="付款與抵用金">
        <div style={{ background: C.okBg, color: C.okFg, borderRadius: 9, padding: "9px 12px", fontSize: 12, marginBottom: 10 }}>💳 下單後到「訂單」分頁選付款方式並上傳截圖（潛旅採訂金 + 尾款）。</div>
        {credit > 0 ? (
          <div style={{ border: `1.5px solid ${C.coral}`, borderRadius: 10, padding: 11, background: C.dangBg }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontSize: 12 }}>🎁 抵用金折抵（餘額 NT$ {credit.toLocaleString()}）</span>
              <button onClick={() => setCreditUsed(Math.min(credit, total))} style={{ fontSize: 10.5, background: C.coral, color: "#fff", border: "none", borderRadius: 999, padding: "3px 10px" }}>全部用</button>
            </div>
            <input type="number" min={0} max={Math.min(credit, total)} value={creditUsed || ""} onChange={(e) => setCreditUsed(Math.min(Math.max(0, Number(e.target.value) || 0), credit, total))} placeholder="NT$ 0" style={{ ...INP, textAlign: "center", fontWeight: 600 }} />
          </div>
        ) : <div style={{ fontSize: 11, color: C.mute }}>🎁 目前無抵用金可折抵</div>}
      </BCard>

      <AgreeBlock cancellationPolicy={pol.cancellation} safetyPolicy={pol.safety} onChange={setAgree} />

      <SubmitBar total={payable} deposit={deposit} busy={busy} disabled={!canSubmit} label="送出報名" onClick={submit} err={err} />
    </div>
  );
}

// 簡易底部彈窗（裝備選擇用）
function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: "16px 16px 0 0", maxHeight: "82vh", overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span><button onClick={onClose} style={{ border: "none", background: "none", color: C.mute }}><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

function CustomRequest() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await fetch("/api/me/contact", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ message: `【客製潛水需求】${text}` }) }); setDone(true); } catch { /* ignore */ } finally { setBusy(false); }
  }
  if (done) return <div style={{ textAlign: "center", padding: "30px 10px" }}><div style={{ fontSize: 38 }}>✅</div><div style={{ fontSize: 15, fontWeight: 500, marginTop: 6 }}>需求已送出！</div><div style={{ fontSize: 12.5, color: C.mute, marginTop: 6 }}>客服會在「訊息」分頁與你聯繫安排。</div></div>;
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>告訴我們你想怎麼潛</div>
      <div style={{ fontSize: 12, color: C.mute, marginBottom: 10 }}>包船 / 私人教練 / 指定潛點 / 揪團開團，留下需求即可。</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="例：想揪 7 月中包船去基隆嶼，4 人，都有 OW…" style={{ width: "100%", minHeight: 110, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, fontSize: 14, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box" }} />
      <button onClick={send} disabled={busy || !text.trim()} style={{ width: "100%", marginTop: 12, height: 44, background: C.accFg, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, opacity: busy || !text.trim() ? 0.5 : 1 }}>{busy ? "送出中…" : "送出客製需求"}</button>
    </div>
  );
}

function DiveList({ cat, onBooked }: { cat: string; onBooked: () => void }) {
  if (cat === "daily" || cat === "tour") return <ApiList cat={cat} onBooked={onBooked} />;
  if (cat === "custom") return <CustomRequest />;
  return <CourseList />;
}

// 潛水課程：沿用官網 COURSES（體驗 / OW / AOW / Fun Dive），LINE 報名 + 諮詢
function CourseList() {
  return (
    <>
      <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.7, margin: "2px 0 12px" }}>從免證照體驗，到 OW / AOW 考證、持證後 Fun Dive 練功——汪汪教練依你的狀況調整節奏，課程時間可彈性安排。</div>
      {COURSES.map((c) => {
        const ask = !c.price.startsWith("NT$");
        return (
          <div key={c.title} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 11 }}>
            <div style={{ fontSize: 10.5, color: C.accFg, letterSpacing: .5 }}>{c.badge}</div>
            <div style={{ fontSize: 15, fontWeight: 600, margin: "5px 0 4px", lineHeight: 1.3 }}>{c.title}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: ask ? C.okFg : C.coral }}>{c.price}</div>
            <div style={{ fontSize: 12, color: C.mute, margin: "5px 0 12px", lineHeight: 1.6 }}>{c.includes}</div>
            <a href={LINE_BOOK_URL} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", background: "#06C755", color: "#fff", borderRadius: 999, padding: "11px 0", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>LINE 報名・諮詢汪汪教練</a>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: C.mute, textAlign: "center", lineHeight: 1.7, padding: "4px 0 10px" }}>課程採一對一 / 小團，依你的程度客製安排。<br />點上方 LINE 與汪汪教練確認開課時間。</div>
    </>
  );
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
