"use client";
// v685：第二版手機 UI（m2）—— 完全獨立的新「皮」，不 import 任何現有 /admin /liff /pclogin 程式。
//   流程：密碼閘（msi@22178368）→ 三角色模擬 → 會員 5 分頁 / 教練點名 / IT 管理。
//   目前為 UAT 靜態版（假資料）；之後再接既有 API（/api/trips、/api/tours、/api/me…）。
import { useState, useEffect } from "react";
import {
  Home, MessageCircle, Waves, Receipt, User, Lock, ArrowLeft, Bell, ShoppingCart,
  ChevronRight, Sailboat, Plane, SlidersHorizontal, School,
  UserCircle, ShieldCheck, LifeBuoy,
} from "lucide-react";
// v686：首頁 = 手機版官網內容 —— 沿用官網首頁同一份資料常數（純資料檔，只讀，不影響既有頁面）
import { COURSES, SPOTS, BUILTIN_REVIEWS, FAQ, LINE_BOOK_URL, FbIcon, YtIcon, IgIcon, YT_CHANNEL, IG_URL, FB_URL } from "@/app/_home/data";

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
        <DiveList cat={cat} me={me} onBooked={() => { setCat(null); setTab("orders"); }} />
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
  if (tab === "orders") return <OrdersTab />;
  return <MeTab me={me} isAdmin={isAdmin} setRole={setRole} />;
}

const ORDER_DONE = new Set(["completed", "no_show", "cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"]);
const ST_ZH: Record<string, string> = { pending: "待付款", awaiting_verify: "待確認匯款", confirmed: "已確認", deposit_paid: "已付訂金", fully_paid: "已付清", completed: "活動結束", no_show: "未到場", cancelled_by_user: "已取消", cancelled_by_weather: "天氣取消", cancelled_unpaid: "訂單不成立" };
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

interface MyBk { id: string; type: string; payLinkToken?: string | null; status: string; paymentStatus: string; totalAmount: number; depositAmount?: number; paidAmount: number; participants: number; createdAt: string; ref: { date?: string; startTime?: string; sites?: string[]; title?: string; dateStart?: string; dateEnd?: string; finalDeadline?: string | null } | null }
function OrdersTab() {
  const [bookings, setBookings] = useState<MyBk[] | null>(null);
  const [seg, setSeg] = useState<"up" | "done">("up");
  useEffect(() => { fetch("/api/bookings/my", { credentials: "include", cache: "no-store" }).then((r) => r.json()).then((d) => setBookings(d.bookings ?? [])).catch(() => setBookings([])); }, []);
  if (bookings === null) return <div style={{ color: C.mute, fontSize: 13, padding: "20px 0", textAlign: "center" }}>載入中…</div>;
  const list = bookings.filter((b) => seg === "done" ? ORDER_DONE.has(b.status) : !ORDER_DONE.has(b.status));
  const segBtn = (k: "up" | "done", l: string) => <button onClick={() => setSeg(k)} style={{ fontSize: 12, padding: "6px 13px", borderRadius: 999, border: "none", background: seg === k ? C.navy : C.page, color: seg === k ? "#fff" : C.mute }}>{l}</button>;
  return (
    <>
      <div style={{ display: "flex", gap: 7, marginBottom: 11 }}>{segBtn("up", "即將進行")}{segBtn("done", "已結束")}</div>
      {list.length === 0 && <div style={{ color: C.mute, fontSize: 13, padding: "30px 0", textAlign: "center" }}>{seg === "up" ? "目前沒有進行中的訂單" : "沒有已結束的訂單"}</div>}
      {list.map((b) => {
        const title = b.type === "daily" ? `日潛 ${b.ref?.date ?? ""} ${b.ref?.startTime ?? ""}` : (b.ref?.title ?? "潛旅");
        const sub = b.type === "daily" ? (b.ref?.sites?.join("、") ?? "") : `${b.ref?.dateStart ?? ""}~${b.ref?.dateEnd ?? ""}`;
        const unpaid = b.totalAmount - b.paidAmount;
        const cancelled = b.status.startsWith("cancelled") || b.status === "no_show";
        const canPay = ["pending", "awaiting_verify", "confirmed"].includes(b.status) && unpaid > 0;
        return (
          <div key={b.id} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 10, opacity: cancelled ? 0.7 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{ntd(b.totalAmount)}</div>
            </div>
            <div style={{ fontSize: 12, color: C.mute, margin: "2px 0 7px" }}>{sub} · {b.participants} 人</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Badge t={ST_ZH[b.status] ?? b.status} k={cancelled ? "full" : b.status === "fully_paid" || b.status === "completed" ? "ok" : "wait"} />
                {b.type === "tour" && b.paidAmount > 0 && unpaid > 0 && <span style={{ fontSize: 11, color: C.coral }}>尾款 {ntd(unpaid)}{b.ref?.finalDeadline ? `（截止 ${b.ref.finalDeadline}）` : ""}</span>}
              </div>
              {canPay && <a href={b.payLinkToken ? `/pay/${b.id}?t=${encodeURIComponent(b.payLinkToken)}` : `/pay/${b.id}`} style={{ background: C.coral, color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, textDecoration: "none" }}>前往付款</a>}
            </div>
          </div>
        );
      })}
    </>
  );
}

function MeTab({ me, isAdmin, setRole }: { me: MeData | null; isAdmin: boolean; setRole: (r: Role) => void }) {
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
      <LRow Icon={User} label="個人資訊" right={me?.phone ?? ""} />
      <LRow Icon={School} label="證照 / 潛伴" right={me?.cert ?? "未填"} />
      <LRow Icon={Bell} label="通知偏好" />
      <Sect t="紀錄" />
      <LRow Icon={Receipt} label="預約紀錄" right={String(me?.stats?.completed ?? 0)} />
      <LRow Icon={Waves} label="潛水紀錄" right={`${me?.haiwangziLogCount ?? 0} 潛`} />
      <LRow Icon={SlidersHorizontal} label="抵用金明細" right={ntd(me?.creditBalance ?? 0)} />
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

function ApiList({ cat, me, onBooked }: { cat: "daily" | "tour"; me: MeData | null; onBooked: () => void }) {
  const [items, setItems] = useState<Array<M2Trip | M2Tour> | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<M2Trip | M2Tour | null>(null);
  useEffect(() => {
    let alive = true; setItems(null); setErr(false); setSel(null);
    const url = cat === "daily" ? `/api/trips?from=${m2Today()}&to=${m2Plus(60)}` : "/api/tours";
    fetch(url, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive) setItems(cat === "daily" ? (d.trips ?? []) : (d.tours ?? [])); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [cat]);
  if (sel) return <BookSheet kind={cat} item={sel} me={me} onBack={() => setSel(null)} onBooked={onBooked} />;
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

function BookSheet({ kind, item, me, onBack, onBooked }: { kind: "daily" | "tour"; item: M2Trip | M2Tour; me: MeData | null; onBack: () => void; onBooked: () => void }) {
  const [pax, setPax] = useState(1);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const t = item as M2Trip, tr = item as M2Tour;
  const title = kind === "daily" ? `${t.isNightDive ? "夜潛" : "日潛"} · ${t.sites.map((s) => s.name).join("＋") || "東北角"}` : tr.title;
  const sub = kind === "daily" ? `${t.date} ${t.startTime} · ${t.tankCount} 潛` : `${DEST_ZH[tr.destination] ?? tr.destination} · ${tr.dateStart}~${tr.dateEnd}`;
  const noEmail = me ? !me.emailVerifiedAt : false;
  async function submit() {
    if (kind === "daily" && !agree) { setErr("請先勾選同意活動同意聲明"); return; }
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const url = kind === "daily" ? "/api/bookings/daily" : "/api/bookings/tour";
      const body = kind === "daily"
        ? { tripId: t.id, participants: pax, agreedToTerms: true, ...(me?.cert ? { cert: me.cert } : {}), ...(me?.certNumber ? { certNumber: me.certNumber } : {}) }
        : { tourId: tr.id, participants: pax, emergencyContact: me?.emergencyContact ?? { name: me?.realName ?? me?.displayName ?? "", phone: me?.phone ?? "", relationship: "本人" }, ...(me?.cert ? { cert: me.cert } : {}) };
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "預約失敗，請稍後再試"); return; }
      onBooked();
    } catch { setErr("連線失敗，請重試"); } finally { setBusy(false); }
  }
  return (
    <div>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, border: "none", background: "none", color: C.accFg, padding: "0 0 10px" }}><ArrowLeft size={15} />返回</button>
      <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.mute, margin: "3px 0 7px" }}>{sub}</div>
        {availBadge(kind === "daily" ? t.available : tr.available)}
      </div>
      <Sect t="預約人數" />
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "4px 0 8px" }}>
        <button onClick={() => setPax((p) => Math.max(1, p - 1))} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, fontSize: 18 }}>−</button>
        <span style={{ fontSize: 18, fontWeight: 500, minWidth: 22, textAlign: "center" }}>{pax}</span>
        <button onClick={() => setPax((p) => Math.min(10, p + 1))} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.line}`, background: C.card, fontSize: 18 }}>＋</button>
        <span style={{ fontSize: 12, color: C.mute }}>人</span>
      </div>
      {kind === "daily" && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 0", fontSize: 13, lineHeight: 1.5 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
          <span>我已閱讀並同意潛水活動同意聲明與安全須知</span>
        </label>
      )}
      {noEmail && <div style={{ background: C.warnBg, color: C.warnFg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginTop: 4 }}>⚠ 此帳號尚未完成 Email 驗證，可能無法下單。請先至會員中心驗證。</div>}
      {err && <div style={{ background: C.dangBg, color: C.dangFg, borderRadius: 8, padding: "8px 12px", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ width: "100%", marginTop: 14, height: 46, background: C.coral, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 500, opacity: busy ? 0.6 : 1 }}>{busy ? "送出中…" : "送出預約"}</button>
      <div style={{ fontSize: 11.5, color: C.mute, textAlign: "center", marginTop: 8, lineHeight: 1.6 }}>送出後可在「訂單」分頁查看並前往付款{kind === "tour" ? "（潛旅採訂金 + 尾款）" : ""}。</div>
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

function DiveList({ cat, me, onBooked }: { cat: string; me: MeData | null; onBooked: () => void }) {
  if (cat === "daily" || cat === "tour") return <ApiList cat={cat} me={me} onBooked={onBooked} />;
  if (cat === "custom") return <CustomRequest />;
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
