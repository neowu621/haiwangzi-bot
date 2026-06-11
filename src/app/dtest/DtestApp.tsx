"use client";
/**
 * v481：瀏覽器（桌面）會員下單介面 — 入口 /dtest
 *
 * 認證：瀏覽器 LINE Login（web OAuth）→ httpOnly cookie session（hwz_member）。
 *   與手機 LIFF 同一個 Provider → 同一個會員（同 lineUserId）。
 *   所有 API 用 credentials:"include"，伺服器端 authFromRequest 會讀 cookie。
 *
 * 重用既有後端：/api/me、/api/trips、/api/tours、/api/tours/[id]、
 *   /api/bookings/daily、/api/bookings/tour、/api/bookings/my、/api/site-config、
 *   /api/me/send-verify-email。下單後導向公開付款頁 /pay/[id]?t=token。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { APP_VERSION } from "@/lib/version";

// ─── 型別 ──────────────────────────────────────────────────────────
interface Member {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  email: string | null;
  emailVerifiedAt: string | null;
  cert: string | null;
  certNumber: string | null;
  logCount: number | null;
  vipLevel: number;
  gearDiscountPct: number;
  tankPromo?: { active: boolean; discount: number; reason?: string };
  creditBalance: number;
  emergencyContact: { name: string; phone: string; relationship: string } | null;
  stats: { totalBookings: number; completed: number };
}
interface Trip {
  id: string;
  date: string;
  startTime: string;
  isNightDive: boolean;
  isScooter: boolean;
  tankCount: number;
  capacity: number | null;
  booked: number;
  available: number | null;
  pricing: { baseTrip: number; extraTank: number; nightDive: number; scooterRental: number };
  sites: { id: string; name: string }[];
  status: string;
}
interface Tour {
  id: string;
  title: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  basePrice: number;
  deposit: number;
  capacity: number | null;
  booked: number;
  available: number | null;
  subtitle: string | null;
  durationLabel: string | null;
  beginnerFriendly: boolean | null;
  tanksCount: number | null;
}
interface TourDetail extends Tour {
  description?: string | null;
  includes?: string[];
  excludes?: string[];
  addons?: { id: string; label: string; price: number }[];
  diveSites?: { id: string; name: string }[];
}
interface MyBooking {
  id: string;
  type: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  participants: number;
  createdAt: string;
  ref: {
    date?: string;
    startTime?: string;
    sites?: string[];
    title?: string;
    dateStart?: string;
    dateEnd?: string;
  } | null;
}

// ─── 樣式常數 ──────────────────────────────────────────────────────
const C = {
  deep: "#0A2342",
  surface: "#1B3A5C",
  phosphor: "#00D9CB",
  coral: "#FF7B5A",
  pearl: "#eef3f6",
  ink: "#1A2330",
  mute: "#5A6B7D",
  line: "#dfe7ee",
};
const GEAR: { type: string; label: string; defPrice: number }[] = [
  { type: "BCD", label: "浮力背心 BCD", defPrice: 200 },
  { type: "regulator", label: "調節器", defPrice: 200 },
  { type: "wetsuit", label: "防寒衣", defPrice: 300 },
  { type: "fins", label: "蛙鞋", defPrice: 100 },
  { type: "mask", label: "面鏡", defPrice: 100 },
  { type: "computer", label: "電腦錶", defPrice: 300 },
  { type: "full_set", label: "整套裝備", defPrice: 800 },
];

// ─── fetch helper（帶 cookie）──────────────────────────────────────
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const e = new Error(json?.message || json?.error || `HTTP ${res.status}`) as Error & {
      status?: number;
      code?: string;
    };
    e.status = res.status;
    e.code = json?.error;
    throw e;
  }
  return json as T;
}

function ntd(n: number) {
  return `NT$ ${Number(n || 0).toLocaleString()}`;
}

type View =
  | { name: "browse" }
  | { name: "bookDaily"; trip: Trip }
  | { name: "bookTour"; tourId: string }
  | { name: "orders" }
  | { name: "profile" };

export function DtestApp() {
  const [member, setMember] = useState<Member | null>(null);
  const [authState, setAuthState] = useState<"loading" | "in" | "out">("loading");
  const [view, setView] = useState<View>({ name: "browse" });
  const [loginError, setLoginError] = useState<string | null>(null);

  const reloadMe = useCallback(async () => {
    try {
      const m = await api<Member>("/api/me");
      setMember(m);
      setAuthState("in");
    } catch {
      setAuthState("out");
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const err = url.searchParams.get("login_error");
    if (err) {
      setLoginError(err);
      url.searchParams.delete("login_error");
      window.history.replaceState({}, "", url.toString());
    }
    reloadMe();
  }, [reloadMe]);

  // 未登入 → 獨立全螢幕登入頁（海洋漸層 + Email 使用說明 + 同意條款）
  if (authState === "out") {
    return <LoginScreen error={loginError} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: C.pearl, color: C.ink, fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif" }}>
      <TopBar member={member} authState={authState} view={view} setView={setView} />
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 64px" }}>
        {authState === "loading" && <Loading />}
        {authState === "in" && member && (
          <>
            {!member.emailVerifiedAt && <EmailVerifyBanner member={member} onSent={reloadMe} />}
            {view.name === "browse" && (
              <Browse
                onBookDaily={(trip) => setView({ name: "bookDaily", trip })}
                onBookTour={(tourId) => setView({ name: "bookTour", tourId })}
              />
            )}
            {view.name === "bookDaily" && (
              <DailyBookingForm trip={view.trip} member={member} onBack={() => setView({ name: "browse" })} />
            )}
            {view.name === "bookTour" && (
              <TourBookingForm tourId={view.tourId} member={member} onBack={() => setView({ name: "browse" })} />
            )}
            {view.name === "orders" && <MyOrders />}
            {view.name === "profile" && <ProfilePanel member={member} onSaved={reloadMe} />}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

// ─── 頂部導覽 ──────────────────────────────────────────────────────
function TopBar({ member, authState, view, setView }: {
  member: Member | null; authState: string; view: View; setView: (v: View) => void;
}) {
  const navItem = (name: View["name"], label: string) => (
    <button
      onClick={() => setView({ name } as View)}
      style={{
        background: "none", border: "none", cursor: "pointer",
        color: view.name === name ? C.phosphor : "#cdd9e3",
        fontWeight: view.name === name ? 800 : 600, fontSize: 14, padding: "6px 4px",
        borderBottom: view.name === name ? `2px solid ${C.phosphor}` : "2px solid transparent",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
  return (
    <header style={{ background: C.deep, color: "#fff", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 12px rgba(10,35,66,.25)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", gap: 22 }}>
        <a href="/" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontSize: 20 }}>🌊</span>
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>東北角海王子潛水</span>
        </a>
        {authState === "in" && (
          <nav style={{ display: "flex", gap: 18, marginLeft: 14 }}>
            {navItem("browse", "預約")}
            {navItem("orders", "我的訂單")}
            {navItem("profile", "會員中心")}
          </nav>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {authState === "in" && member ? (
            <>
              <span style={{ fontSize: 13, color: "#cdd9e3" }}>
                {member.realName ?? member.displayName}
                {member.creditBalance > 0 && <span style={{ color: C.phosphor, marginLeft: 8 }}>💳 {ntd(member.creditBalance)}</span>}
              </span>
              <a href="/api/auth/line/logout" style={{ fontSize: 12.5, color: "#9fb3c4", textDecoration: "none", border: "1px solid #2e4a66", borderRadius: 8, padding: "5px 11px" }}>
                登出
              </a>
            </>
          ) : authState === "out" ? (
            <a href="/api/auth/line/login?next=/dtest" style={{ fontSize: 13, fontWeight: 800, color: C.deep, background: "#06C755", borderRadius: 9, padding: "8px 16px", textDecoration: "none" }}>
              LINE 登入
            </a>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "80px 0", color: C.mute }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${C.line}`, borderTopColor: C.deep, borderRadius: "50%", animation: "dspin .8s linear infinite" }} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>載入中…</div>
      <style>{`@keyframes dspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ─── 登入頁（全螢幕海洋漸層 + Email 使用說明 + 同意條款）──────────────
function LoginScreen({ error }: { error: string | null }) {
  const [agreed, setAgreed] = useState(false);
  const errMsg: Record<string, string> = {
    line_login_not_configured: "LINE 登入尚未設定完成（請聯絡管理員）",
    state_mismatch: "登入逾時或來源不符，請重新登入",
    token_exchange_failed: "與 LINE 交換憑證失敗，請重試",
    id_token_invalid: "LINE 身分驗證失敗，請重試",
    access_denied: "你取消了授權",
  };
  const LOGIN_URL = "/api/auth/line/login?next=/dtest";

  const emailUses = [
    "寄送課程預約確認與報名結果通知",
    "開課提醒、課程時間異動或取消通知",
    "潛點活動、揪團出團等重要資訊通知",
    "會員帳號安全與重要服務通知",
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 18px",
      background: `radial-gradient(120% 90% at 28% 18%, #1d5a6b 0%, #103a4d 42%, #0a2733 100%)`,
      fontFamily: "'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 26, padding: "clamp(28px,5vw,46px)", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        {/* 品牌 */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
          <div style={{ width: 56, height: 56, borderRadius: 15, background: `linear-gradient(150deg,${C.phosphor},${C.surface})`, display: "grid", placeItems: "center", flex: "none", boxShadow: "0 6px 16px rgba(10,35,66,.18)" }}>
            <TridentIcon />
          </div>
          <div>
            <div style={{ fontSize: 21, fontWeight: 800, color: C.deep, lineHeight: 1.2 }}>東北角海王子潛水</div>
            <div style={{ fontSize: 11.5, letterSpacing: 3, color: "#0a8f86", fontWeight: 700, marginTop: 2 }}>SEA PRINCE DIVING</div>
          </div>
        </div>

        <h1 style={{ fontSize: 27, fontWeight: 800, color: C.deep, margin: "0 0 10px" }}>加入海王子會員</h1>
        <p style={{ fontSize: 14.5, color: C.mute, lineHeight: 1.75, margin: "0 0 22px" }}>
          使用 LINE 帳號完成註冊，即可預約課程、查詢報名狀態，並接收開課與潛點活動通知。
        </p>

        {error && (
          <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 11, padding: "11px 15px", fontSize: 13.5, marginBottom: 18 }}>
            {errMsg[error] ?? `登入失敗：${error}`}
          </div>
        )}

        {/* Email 使用說明卡 */}
        <div style={{ border: `1px solid #cfe6e3`, borderLeft: `4px solid ${C.phosphor}`, background: "#f5fbfa", borderRadius: 14, padding: "18px 20px", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: "#0a6b63", marginBottom: 10 }}>
            <span>✉️</span> 關於電子郵件地址的使用
          </div>
          <p style={{ fontSize: 13.5, color: "#3d5560", lineHeight: 1.7, margin: "0 0 12px" }}>
            為提供完整的會員與課程服務，我們會在您註冊時，向您取得電子郵件地址，用途包括：
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
            {emailUses.map((u) => (
              <div key={u} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: C.ink }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: C.phosphor, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 900, flex: "none" }}>✓</span>
                {u}
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px dashed #bcd9d4", paddingTop: 12 }}>
            <p style={{ fontSize: 12.5, color: "#7c9296", lineHeight: 1.7, margin: 0 }}>
              我們僅將電子郵件用於上述用途，不會提供給第三方，亦不會用於未經您同意的行銷訊息。您可隨時於會員設定中調整通知偏好。
            </p>
          </div>
        </div>

        {/* 同意條款 */}
        <label style={{ display: "flex", gap: 11, alignItems: "flex-start", fontSize: 13.5, color: C.ink, lineHeight: 1.7, cursor: "pointer", marginBottom: 18 }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: C.phosphor, flex: "none" }} />
          <span>
            我已閱讀並同意海王子潛水的
            <a href="/privacy" target="_blank" rel="noopener" style={{ color: "#0a8f86", fontWeight: 700 }}>《隱私權政策》</a>
            與
            <a href="/terms" target="_blank" rel="noopener" style={{ color: "#0a8f86", fontWeight: 700 }}>《服務條款》</a>
            ，並同意提供電子郵件地址作為前述會員服務之用。
          </span>
        </label>

        {/* LINE 註冊／登入按鈕（需先勾選同意） */}
        <a
          href={agreed ? LOGIN_URL : undefined}
          onClick={(e) => { if (!agreed) e.preventDefault(); }}
          aria-disabled={!agreed}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 11,
            background: agreed ? "linear-gradient(180deg,#07d160,#06b54e)" : "#cdd9d9",
            color: "#fff", fontWeight: 800, fontSize: 17, padding: "16px", borderRadius: 14,
            textDecoration: "none", cursor: agreed ? "pointer" : "not-allowed",
            boxShadow: agreed ? "0 10px 24px rgba(6,199,85,.32)" : "none", transition: "all .2s",
          }}
        >
          <LineGlyph /> 使用 LINE 帳號註冊／登入
        </a>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: C.mute }}>
          已經是會員了？<a href={LOGIN_URL} style={{ color: C.deep, fontWeight: 800 }}>直接登入</a>
        </div>
        <div style={{ textAlign: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid #e6edf0", fontSize: 12, color: "#6b7b85", letterSpacing: 0.3 }}>
          東北角海王子潛水 ‧ v{APP_VERSION}
        </div>
      </div>
    </div>
  );
}

function TridentIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18" />
      <path d="M6 7c0 3 2.5 4 6 4s6-1 6-4" />
      <path d="M6 7V4M18 7V4M12 5V3" />
      <path d="M9.5 19.5h5" />
    </svg>
  );
}
function LineGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <path d="M12 2C6.48 2 2 5.69 2 10.23c0 4.07 3.56 7.48 8.37 8.12.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.26-.2.99.87.54s5.77-3.4 7.87-5.82C21.2 13.7 22 12.04 22 10.23 22 5.69 17.52 2 12 2z" />
    </svg>
  );
}

// ─── Email 驗證 banner ─────────────────────────────────────────────
function EmailVerifyBanner({ member, onSent }: { member: Member; onSent: () => void }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState(member.email ?? "");

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      if (emailInput && emailInput !== member.email) {
        await api("/api/me", { method: "PATCH", body: JSON.stringify({ email: emailInput }) });
      }
      await api("/api/me/send-verify-email", { method: "POST", body: JSON.stringify({}) });
      setMsg("✓ 驗證信已寄出，請至信箱點連結完成驗證後重新整理");
      onSent();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "寄送失敗");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ background: "#fff8ec", border: "1px solid #f3d8a0", borderRadius: 12, padding: "14px 18px", marginBottom: 20 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#9a6a18", marginBottom: 8 }}>
        ⚠️ 下單前請先完成 Email 驗證（潛水保險與重要通知需要）
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="你的 Email"
          style={{ flex: "1 1 240px", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" }}
        />
        <button
          onClick={send}
          disabled={sending || !emailInput}
          style={{ background: C.coral, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13.5, fontWeight: 700, cursor: sending ? "wait" : "pointer", fontFamily: "inherit", opacity: !emailInput ? 0.5 : 1 }}
        >
          {sending ? "寄送中…" : member.email ? "重寄驗證信" : "寄驗證信"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("✓") ? "#0a8f86" : "#c0473b", marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

// ─── 瀏覽（日潛 / 潛旅）─────────────────────────────────────────────
function Browse({ onBookDaily, onBookTour }: {
  onBookDaily: (t: Trip) => void; onBookTour: (id: string) => void;
}) {
  const [tab, setTab] = useState<"daily" | "tour">("daily");
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [tours, setTours] = useState<Tour[] | null>(null);

  useEffect(() => {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    api<{ trips: Trip[] }>(`/api/trips?from=${from}&to=${to}`).then((d) => setTrips(d.trips)).catch(() => setTrips([]));
    api<{ tours: Tour[] }>("/api/tours").then((d) => setTours(d.tours)).catch(() => setTours([]));
  }, []);

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <TabBtn active={tab === "daily"} onClick={() => setTab("daily")}>🐠 日潛場次</TabBtn>
        <TabBtn active={tab === "tour"} onClick={() => setTab("tour")}>✈️ 潛旅行程</TabBtn>
      </div>

      {tab === "daily" && (
        <>
          {trips === null && <Loading />}
          {trips?.length === 0 && <Empty>目前沒有開放的日潛場次</Empty>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 16 }}>
            {trips?.map((t) => <TripCard key={t.id} trip={t} onBook={() => onBookDaily(t)} />)}
          </div>
        </>
      )}
      {tab === "tour" && (
        <>
          {tours === null && <Loading />}
          {tours?.length === 0 && <Empty>目前沒有開放的潛旅行程</Empty>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 16 }}>
            {tours?.map((t) => <TourCard key={t.id} tour={t} onBook={() => onBookTour(t.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: active ? C.deep : "#fff", color: active ? "#fff" : C.mute,
      border: `1px solid ${active ? C.deep : C.line}`, borderRadius: 10, padding: "9px 20px",
      fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    }}>{children}</button>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "#fff", border: `1px dashed ${C.line}`, borderRadius: 12, padding: "44px 0", textAlign: "center", color: C.mute, fontSize: 14 }}>{children}</div>;
}
function card(): React.CSSProperties {
  return { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(10,35,66,.05)", display: "flex", flexDirection: "column" };
}
function primaryBtn(): React.CSSProperties {
  return { background: C.phosphor, color: C.deep, border: "none", borderRadius: 10, padding: "11px 16px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", width: "100%" };
}

function TripCard({ trip, onBook }: { trip: Trip; onBook: () => void }) {
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date(trip.date + "T00:00:00+08:00").getDay()];
  const full = trip.available !== null && trip.available <= 0;
  const est = trip.pricing.extraTank * trip.tankCount + trip.pricing.baseTrip;
  return (
    <div style={card()}>
      <div style={{ background: C.deep, color: "#fff", padding: "14px 16px" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{trip.date}（{weekday}）</div>
        <div style={{ fontSize: 13, color: C.phosphor, marginTop: 2 }}>{trip.startTime} 出發 ‧ {trip.tankCount} 潛</div>
      </div>
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>📍 {trip.sites.map((s) => s.name).join("、") || "東北角"}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {trip.isNightDive && <Tag>🌙 夜潛</Tag>}
          {trip.isScooter && <Tag>🛵 水中摩托</Tag>}
          {trip.available !== null ? <Tag>剩 {trip.available} 位</Tag> : <Tag>可預約</Tag>}
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: "auto" }}>每人約 <b style={{ color: C.deep, fontSize: 15 }}>{ntd(est)}</b> 起</div>
        <button onClick={onBook} disabled={full} style={{ ...primaryBtn(), opacity: full ? 0.5 : 1, cursor: full ? "not-allowed" : "pointer" }}>
          {full ? "已額滿" : "預約此場次"}
        </button>
      </div>
    </div>
  );
}
function TourCard({ tour, onBook }: { tour: Tour; onBook: () => void }) {
  const full = tour.available !== null && tour.available <= 0;
  return (
    <div style={card()}>
      <div style={{ background: C.surface, color: "#fff", padding: "14px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{tour.title}</div>
        {tour.subtitle && <div style={{ fontSize: 12.5, color: C.phosphor, marginTop: 3 }}>{tour.subtitle}</div>}
      </div>
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13.5 }}>🗓️ {tour.dateStart} ~ {tour.dateEnd}{tour.durationLabel ? `（${tour.durationLabel}）` : ""}</div>
        <div style={{ fontSize: 13.5 }}>📍 {tour.destination}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tour.beginnerFriendly && <Tag>新手友善</Tag>}
          {tour.tanksCount != null && <Tag>{tour.tanksCount} 潛</Tag>}
          {tour.available !== null ? <Tag>剩 {tour.available} 位</Tag> : <Tag>可報名</Tag>}
        </div>
        <div style={{ fontSize: 13, color: C.mute, marginTop: "auto" }}>
          每人 <b style={{ color: C.deep, fontSize: 15 }}>{ntd(tour.basePrice)}</b>
          <span style={{ marginLeft: 8 }}>訂金 {ntd(tour.deposit)}</span>
        </div>
        <button onClick={onBook} disabled={full} style={{ ...primaryBtn(), opacity: full ? 0.5 : 1, cursor: full ? "not-allowed" : "pointer" }}>
          {full ? "已額滿" : "報名此行程"}
        </button>
      </div>
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11.5, background: "#eef6f5", color: "#0a6b63", borderRadius: 20, padding: "2px 10px", fontWeight: 600 }}>{children}</span>;
}

// ─── 共用：個資 + 緊急聯絡 + 同意簽名 ──────────────────────────────
interface CommonForm {
  realName: string; phone: string; cert: string; certNumber: string; logCount: string;
  ecName: string; ecPhone: string; ecRel: string;
  notes: string; agreed: boolean; signature: string | null;
}
function useCommonForm(member: Member): [CommonForm, (patch: Partial<CommonForm>) => void] {
  const [f, setF] = useState<CommonForm>({
    realName: member.realName ?? "", phone: member.phone ?? "",
    cert: member.cert ?? "", certNumber: member.certNumber ?? "", logCount: String(member.logCount ?? ""),
    ecName: member.emergencyContact?.name ?? "", ecPhone: member.emergencyContact?.phone ?? "", ecRel: member.emergencyContact?.relationship ?? "",
    notes: "", agreed: false, signature: null,
  });
  const patch = (p: Partial<CommonForm>) => setF((prev) => ({ ...prev, ...p }));
  return [f, patch];
}
function field(label: string, node: React.ReactNode, required?: boolean) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 5, color: C.deep }}>
        {label}{required && <span style={{ color: C.coral }}> *</span>}
      </span>
      {node}
    </label>
  );
}
const inp: React.CSSProperties = { width: "100%", border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" };

function CommonFields({ f, patch }: { f: CommonForm; patch: (p: Partial<CommonForm>) => void }) {
  return (
    <>
      <SectionTitle>聯絡資料</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {field("姓名", <input style={inp} value={f.realName} onChange={(e) => patch({ realName: e.target.value })} />, true)}
        {field("電話", <input style={inp} value={f.phone} onChange={(e) => patch({ phone: e.target.value })} />, true)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {field("證照等級", (
          <select style={inp} value={f.cert} onChange={(e) => patch({ cert: e.target.value })}>
            <option value="">未選</option>
            {["OW", "AOW", "Rescue", "DM", "Instructor"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ))}
        {field("證照號碼", <input style={inp} value={f.certNumber} onChange={(e) => patch({ certNumber: e.target.value })} />)}
        {field("潛水次數", <input style={inp} type="number" value={f.logCount} onChange={(e) => patch({ logCount: e.target.value })} />)}
      </div>
      <SectionTitle>緊急聯絡人</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {field("姓名", <input style={inp} value={f.ecName} onChange={(e) => patch({ ecName: e.target.value })} />)}
        {field("電話", <input style={inp} value={f.ecPhone} onChange={(e) => patch({ ecPhone: e.target.value })} />)}
        {field("關係", <input style={inp} value={f.ecRel} onChange={(e) => patch({ ecRel: e.target.value })} placeholder="例：配偶" />)}
      </div>
      {field("備註（特殊需求）", <textarea style={{ ...inp, minHeight: 56, resize: "vertical" }} value={f.notes} onChange={(e) => patch({ notes: e.target.value })} />)}

      <SectionTitle>同意聲明與簽名</SectionTitle>
      <label style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13, color: C.ink, marginBottom: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={f.agreed} onChange={(e) => patch({ agreed: e.target.checked })} style={{ marginTop: 3 }} />
        <span>我已閱讀並同意 <a href="/#faq" target="_blank" style={{ color: C.coral }}>潛水安全注意事項與退款政策</a>，並確認以上資料正確。</span>
      </label>
      <SignaturePad height={180} onChange={(dataUrl, hasInk) => patch({ signature: hasInk ? dataUrl : null })} />
    </>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13.5, fontWeight: 800, color: C.deep, margin: "18px 0 10px", paddingBottom: 6, borderBottom: `2px solid ${C.pearl}` }}>{children}</div>;
}
function commonBody(f: CommonForm) {
  const ec = f.ecName || f.ecPhone || f.ecRel ? { name: f.ecName, phone: f.ecPhone, relationship: f.ecRel } : undefined;
  return {
    realName: f.realName || undefined,
    phone: f.phone || undefined,
    notes: f.notes || undefined,
    agreedToTerms: true as const,
    signatureDataUrl: f.signature ?? undefined,
    emergencyContact: ec,
  };
}
function BackBtn({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} style={{ background: "none", border: "none", color: C.mute, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 14 }}>← 返回</button>;
}
function formCard(): React.CSSProperties {
  return { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "24px 26px", boxShadow: "0 4px 20px rgba(10,35,66,.06)" };
}

// ─── 日潛下單表單 ──────────────────────────────────────────────────
function DailyBookingForm({ trip, member, onBack }: { trip: Trip; member: Member; onBack: () => void }) {
  const [f, patch] = useCommonForm(member);
  const [participants, setParticipants] = useState(1);
  const [tankCount, setTankCount] = useState(trip.tankCount);
  const [gear, setGear] = useState<Record<string, number>>({}); // type -> qty
  const [gearPrice, setGearPrice] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ gearRentalPrices?: Record<string, number>; config?: { gearRentalPrices?: Record<string, number> } }>("/api/site-config")
      .then((d) => {
        const prices = d.gearRentalPrices ?? d.config?.gearRentalPrices ?? {};
        const map: Record<string, number> = {};
        GEAR.forEach((g) => { map[g.type] = Number(prices[g.type] ?? g.defPrice); });
        setGearPrice(map);
      })
      .catch(() => {
        const map: Record<string, number> = {};
        GEAR.forEach((g) => { map[g.type] = g.defPrice; });
        setGearPrice(map);
      });
  }, []);

  const gearAmountRaw = GEAR.reduce((s, g) => s + (gear[g.type] ?? 0) * (gearPrice[g.type] ?? g.defPrice), 0);
  const tankFee = Number(member.tankPromo?.active ? Math.max(0, trip.pricing.extraTank - (member.tankPromo?.discount ?? 0)) : trip.pricing.extraTank);
  const divesAmount = tankFee * tankCount * participants;
  let extraAmount = trip.pricing.baseTrip;
  if (trip.isNightDive) extraAmount += trip.pricing.nightDive;
  if (trip.isScooter) extraAmount += trip.pricing.scooterRental;
  const gearAmount = member.gearDiscountPct < 100 ? Math.round((gearAmountRaw * member.gearDiscountPct) / 100) : gearAmountRaw;
  const total = divesAmount + extraAmount + gearAmount;

  async function submit() {
    setErr(null);
    if (!f.realName || !f.phone) { setErr("請填寫姓名與電話"); return; }
    if (!f.agreed) { setErr("請勾選同意聲明"); return; }
    setSubmitting(true);
    try {
      const body = {
        ...commonBody(f),
        tripId: trip.id,
        participants,
        tankCount,
        cert: f.cert || undefined,
        certNumber: f.certNumber || undefined,
        logCount: f.logCount ? Number(f.logCount) : undefined,
        rentalGear: GEAR.filter((g) => (gear[g.type] ?? 0) > 0).map((g) => ({
          itemType: g.type as "BCD", price: gearPrice[g.type] ?? g.defPrice, qty: gear[g.type],
        })),
      };
      const res = await api<{ booking: { id: string; payLinkToken: string | null } }>("/api/bookings/daily", {
        method: "POST", body: JSON.stringify(body),
      });
      const b = res.booking;
      window.location.href = b.payLinkToken ? `/pay/${b.id}?t=${b.payLinkToken}` : `/dtest`;
    } catch (e) {
      const ce = e as Error & { code?: string };
      setErr(ce.code === "email_not_verified" ? "請先完成上方 Email 驗證才能下單。" : (e instanceof Error ? e.message : "下單失敗"));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <BackBtn onBack={onBack} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div style={formCard()}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep, marginBottom: 4 }}>預約日潛</h2>
          <div style={{ fontSize: 14, color: C.mute, marginBottom: 6 }}>
            {trip.date} {trip.startTime} ‧ {trip.sites.map((s) => s.name).join("、") || "東北角"}
          </div>

          <SectionTitle>潛水內容</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {field("人數", <Stepper value={participants} min={1} max={10} onChange={setParticipants} />)}
            {field(`潛次（最多 ${trip.tankCount}）`, <Stepper value={tankCount} min={1} max={trip.tankCount} onChange={setTankCount} />)}
          </div>

          <SectionTitle>裝備租借（每人）</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {GEAR.map((g) => {
              const qty = gear[g.type] ?? 0;
              return (
                <label key={g.type} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${qty > 0 ? C.phosphor : C.line}`, borderRadius: 9, padding: "8px 11px", cursor: "pointer", background: qty > 0 ? "#f0fbfa" : "#fff" }}>
                  <input type="checkbox" checked={qty > 0} onChange={(e) => setGear((prev) => ({ ...prev, [g.type]: e.target.checked ? 1 : 0 }))} />
                  <span style={{ fontSize: 13, flex: 1 }}>{g.label}</span>
                  <span style={{ fontSize: 12.5, color: C.mute }}>{ntd(gearPrice[g.type] ?? g.defPrice)}</span>
                </label>
              );
            })}
          </div>

          <CommonFields f={f} patch={patch} />
          {err && <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>{err}</div>}
        </div>

        <SummaryPanel
          rows={[
            ["潛水費", ntd(divesAmount), `${tankFee} × ${tankCount}潛 × ${participants}人`],
            ...(extraAmount > 0 ? [["基本/附加費", ntd(extraAmount), ""] as [string, string, string]] : []),
            ...(gearAmount > 0 ? [["裝備租借", ntd(gearAmount), member.gearDiscountPct < 100 ? `VIP ${member.gearDiscountPct}折後` : ""] as [string, string, string]] : []),
          ]}
          total={total}
          note="一日潛水一次付清。下單後導向付款頁上傳轉帳。"
          submitting={submitting}
          onSubmit={submit}
          submitLabel="送出預約 → 付款"
        />
      </div>
    </div>
  );
}

// ─── 潛旅下單表單 ──────────────────────────────────────────────────
function TourBookingForm({ tourId, member, onBack }: { tourId: string; member: Member; onBack: () => void }) {
  const [tour, setTour] = useState<TourDetail | null>(null);
  const [f, patch] = useCommonForm(member);
  const [participants, setParticipants] = useState(1);
  const [addons, setAddons] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<TourDetail>(`/api/tours/${tourId}`).then(setTour).catch(() => setErr("載入行程失敗"));
  }, [tourId]);

  if (!tour) return <div><BackBtn onBack={onBack} /><Loading /></div>;

  const addonList = tour.addons ?? [];
  const addonAmount = addonList.filter((a) => addons.includes(a.id)).reduce((s, a) => s + a.price, 0);
  const total = tour.basePrice * participants + addonAmount * participants;
  const depositTotal = tour.deposit * participants;

  async function submit() {
    setErr(null);
    if (!f.realName || !f.phone) { setErr("請填寫姓名與電話"); return; }
    if (!f.ecName || !f.ecPhone) { setErr("潛旅需填寫緊急聯絡人姓名與電話"); return; }
    if (!f.agreed) { setErr("請勾選同意聲明"); return; }
    setSubmitting(true);
    try {
      const body = {
        tourId,
        participants,
        selectedAddons: addons,
        notes: f.notes || undefined,
        agreedToTerms: true as const,
        signatureDataUrl: f.signature ?? undefined,
        realName: f.realName,
        phone: f.phone,
        certNumber: f.certNumber || undefined,
        emergencyContact: { name: f.ecName, phone: f.ecPhone, relationship: f.ecRel },
      };
      const res = await api<{ booking: { id: string; payLinkToken: string | null } }>("/api/bookings/tour", {
        method: "POST", body: JSON.stringify(body),
      });
      const b = res.booking;
      window.location.href = b.payLinkToken ? `/pay/${b.id}?t=${b.payLinkToken}` : `/dtest`;
    } catch (e) {
      const ce = e as Error & { code?: string };
      setErr(ce.code === "email_not_verified" ? "請先完成上方 Email 驗證才能下單。" : (e instanceof Error ? e.message : "報名失敗"));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <BackBtn onBack={onBack} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div style={formCard()}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep, marginBottom: 4 }}>{tour.title}</h2>
          <div style={{ fontSize: 14, color: C.mute }}>🗓️ {tour.dateStart} ~ {tour.dateEnd} ‧ 📍 {tour.destination}</div>

          <SectionTitle>報名人數</SectionTitle>
          {field("人數", <Stepper value={participants} min={1} max={10} onChange={setParticipants} />)}

          {addonList.length > 0 && (
            <>
              <SectionTitle>加購選項（每人）</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {addonList.map((a) => {
                  const on = addons.includes(a.id);
                  return (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${on ? C.phosphor : C.line}`, borderRadius: 9, padding: "8px 11px", cursor: "pointer", background: on ? "#f0fbfa" : "#fff" }}>
                      <input type="checkbox" checked={on} onChange={(e) => setAddons((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))} />
                      <span style={{ fontSize: 13, flex: 1 }}>{a.label}</span>
                      <span style={{ fontSize: 12.5, color: C.mute }}>+{ntd(a.price)}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          <CommonFields f={f} patch={patch} />
          {err && <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>{err}</div>}
        </div>

        <SummaryPanel
          rows={[
            ["團費", ntd(tour.basePrice * participants), `${ntd(tour.basePrice)} × ${participants}人`],
            ...(addonAmount > 0 ? [["加購", ntd(addonAmount * participants), ""] as [string, string, string]] : []),
          ]}
          total={total}
          extraRow={["應繳訂金", ntd(depositTotal)]}
          note="旅遊潛水採訂金 + 尾款。下單後先付訂金，尾款於出發前繳清。"
          submitting={submitting}
          onSubmit={submit}
          submitLabel="送出報名 → 付訂金"
        />
      </div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn: React.CSSProperties = { width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${C.line}`, background: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer", color: C.deep };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button type="button" style={btn} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <span style={{ fontSize: 17, fontWeight: 800, minWidth: 28, textAlign: "center" }}>{value}</span>
      <button type="button" style={btn} onClick={() => onChange(Math.min(max, value + 1))}>＋</button>
    </div>
  );
}

function SummaryPanel({ rows, total, extraRow, note, submitting, onSubmit, submitLabel }: {
  rows: [string, string, string][]; total: number; extraRow?: [string, string];
  note: string; submitting: boolean; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div style={{ ...formCard(), position: "sticky", top: 80, padding: "20px 22px" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.deep, marginBottom: 14 }}>費用明細</div>
      {rows.map(([k, v, sub], i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
          <span style={{ fontSize: 13, color: C.mute }}>{k}{sub && <span style={{ fontSize: 11, marginLeft: 5, color: "#9aabae" }}>{sub}</span>}</span>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: `1px solid ${C.line}`, margin: "10px 0", paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>總計</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: C.coral }}>{ntd(total)}</span>
      </div>
      {extraRow && (
        <div style={{ display: "flex", justifyContent: "space-between", background: "#fff8ec", borderRadius: 8, padding: "8px 11px", marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#9a6a18" }}>{extraRow[0]}</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#9a6a18" }}>{extraRow[1]}</span>
        </div>
      )}
      <p style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.6, margin: "12px 0 14px" }}>{note}</p>
      <button onClick={onSubmit} disabled={submitting} style={{ ...primaryBtn(), background: C.coral, color: "#fff", opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer", padding: "13px 16px", fontSize: 15 }}>
        {submitting ? "送出中…" : submitLabel}
      </button>
    </div>
  );
}

// ─── 我的訂單 ──────────────────────────────────────────────────────
const STATUS_ZH: Record<string, string> = {
  pending: "待付款", awaiting_verify: "待核款", confirmed: "已確認", completed: "已完成",
  cancelled_by_user: "已取消", cancelled_by_weather: "天候取消", cancelled_unpaid: "逾期取消", no_show: "未到",
};
const PAY_ZH: Record<string, string> = {
  unpaid: "未付款", pending: "未付款", deposit_paid: "已付訂金", fully_paid: "已付清", refunded: "已退款",
};
function MyOrders() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  useEffect(() => {
    api<{ bookings: MyBooking[] }>("/api/bookings/my").then((d) => setBookings(d.bookings)).catch(() => setBookings([]));
  }, []);
  if (bookings === null) return <Loading />;
  if (bookings.length === 0) return <Empty>還沒有任何訂單，去「預約」開始第一筆吧 🤿</Empty>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep }}>我的訂單</h2>
      {bookings.map((b) => {
        const title = b.type === "daily"
          ? `日潛 ${b.ref?.date ?? ""} ${b.ref?.startTime ?? ""}`
          : (b.ref?.title ?? "潛旅");
        const sub = b.type === "daily"
          ? (b.ref?.sites?.join("、") ?? "")
          : `${b.ref?.dateStart ?? ""} ~ ${b.ref?.dateEnd ?? ""}`;
        const unpaid = b.totalAmount - b.paidAmount;
        const canPay = ["pending", "awaiting_verify", "confirmed"].includes(b.status) && unpaid > 0;
        return (
          <div key={b.id} style={{ ...card(), flexDirection: "row", alignItems: "center", padding: "14px 18px", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>{sub} ‧ {b.participants} 人 ‧ 下單 {b.createdAt.slice(0, 10)}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Tag>{STATUS_ZH[b.status] ?? b.status}</Tag>
              <Tag>{PAY_ZH[b.paymentStatus] ?? b.paymentStatus}</Tag>
            </div>
            <div style={{ textAlign: "right", minWidth: 110 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.deep }}>{ntd(b.totalAmount)}</div>
              {unpaid > 0 && <div style={{ fontSize: 12, color: C.coral }}>未付 {ntd(unpaid)}</div>}
            </div>
            {canPay && (
              <a href={`/pay/${b.id}`} style={{ background: C.coral, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 9, textDecoration: "none", whiteSpace: "nowrap" }}>
                前往付款
              </a>
            )}
          </div>
        );
      })}
      <p style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>※ 退款 / 取消 / 上傳付款證明等，請在付款頁或手機 LINE App 操作。</p>
    </div>
  );
}

// ─── 會員中心 ──────────────────────────────────────────────────────
function ProfilePanel({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const [realName, setRealName] = useState(member.realName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ realName, phone, email }) });
      setMsg("✓ 已儲存");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "儲存失敗");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep, marginBottom: 14 }}>會員中心</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <Stat label="會員等級" value={`LV${member.vipLevel}`} />
        <Stat label="抵用金" value={ntd(member.creditBalance)} />
        <Stat label="完成潛次" value={`${member.stats.completed}`} />
      </div>
      <div style={formCard()}>
        <SectionTitle>基本資料</SectionTitle>
        {field("姓名", <input style={inp} value={realName} onChange={(e) => setRealName(e.target.value)} />)}
        {field("電話", <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />)}
        {field(
          "Email",
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...inp, flex: 1 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {member.emailVerifiedAt
              ? <span style={{ fontSize: 12, color: "#0a8f86", fontWeight: 700, whiteSpace: "nowrap" }}>✓ 已驗證</span>
              : <span style={{ fontSize: 12, color: C.coral, fontWeight: 700, whiteSpace: "nowrap" }}>未驗證</span>}
          </div>
        )}
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(), background: C.deep, color: "#fff", width: "auto", padding: "11px 24px", marginTop: 6 }}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        {msg && <span style={{ marginLeft: 12, fontSize: 13, color: msg.startsWith("✓") ? "#0a8f86" : "#c0473b" }}>{msg}</span>}
        <p style={{ fontSize: 11.5, color: C.mute, marginTop: 14, lineHeight: 1.6 }}>
          ※ 完整個資（證照、緊急聯絡人、潛伴、生日禮金等）可在手機 LINE App「個人」分頁編輯。
        </p>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.deep }}>{value}</div>
      <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ background: C.deep, color: "#9fb3c4", textAlign: "center", padding: "26px 20px", fontSize: 12 }}>
      東北角海王子潛水 ‧ 安全．專業，陪你看見海<br />
      <span style={{ fontSize: 11, opacity: 0.7 }}>桌面版會員預約（測試中） ‧ v{APP_VERSION}</span>
    </footer>
  );
}
