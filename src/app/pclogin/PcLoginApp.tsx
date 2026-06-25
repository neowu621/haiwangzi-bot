"use client";
/**
 * v481：瀏覽器（桌面）會員下單介面 — 入口 /pclogin
 *
 * 認證：瀏覽器 LINE Login（web OAuth）→ httpOnly cookie session（hwz_member）。
 *   與手機 LIFF 同一個 Provider → 同一個會員（同 lineUserId）。
 *   所有 API 用 credentials:"include"，伺服器端 authFromRequest 會讀 cookie。
 *
 * 重用既有後端：/api/me、/api/trips、/api/tours、/api/tours/[id]、
 *   /api/bookings/daily、/api/bookings/tour、/api/bookings/my、/api/site-config、
 *   /api/me/send-verify-email。下單後導向公開付款頁 /pay/[id]?t=token。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SignaturePad } from "@/components/ui/SignaturePad";
import { APP_VERSION } from "@/lib/version";
import { BrandMark, MantaTridentMark } from "@/components/brand/MantaTrident";
import { PromoPopup, type ActivePromo } from "@/components/PromoPopup"; // v592

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
  stats: { totalBookings: number; completed: number; unreadNotifications?: number };
  // v656：補齊手機 LIFF 會員中心的完整欄位
  haiwangziLogCount?: number;
  birthday?: string | null;
  notifyByLine?: boolean;
  notifyByEmail?: boolean;
  companions?: Array<{ id?: string; name: string; cert: string | null; certNumber?: string; phone?: string; relationship?: string; logCount?: number }>;
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
  payLinkToken?: string | null;
  notes?: string | null;       // v663：客戶備註（客人自己填）
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
    activityNote?: string | null; // v664：活動提醒（客戶可見）
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

// v666：潛旅目的地 enum → 中文（原本直接顯示 northeast/lanyu/green_island… 英文代碼）
const DEST_ZH: Record<string, string> = {
  northeast: "東北角", green_island: "綠島", lanyu: "蘭嶼", kenting: "墾丁", other: "海外",
};
function destZh(d?: string | null) {
  return d ? (DEST_ZH[d] ?? d) : "";
}

// v667：桌機登入後未讀通知彈窗（對齊 LIFF：每 session 跳一次、3 秒自動關）
const PC_UNREAD_POPUP_KEY = "haiwangzi:pc-unread-popup:v1";
function UnreadPopupPc({ count, onView, onClose }: { count: number; onView: () => void; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.5)", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 320, borderRadius: 18, background: "#fff", padding: 22, textAlign: "center", boxShadow: "0 20px 50px rgba(10,35,66,.35)" }}>
        <div style={{ fontSize: 38, marginBottom: 6 }}>📬</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.deep }}>你有 {count} 則未讀訊息</div>
        <p style={{ marginTop: 4, fontSize: 12.5, color: C.mute }}>有需要你確認 / 處理的通知,點下方查看。</p>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onView} style={{ width: "100%", borderRadius: 12, background: C.coral, padding: "12px 0", fontSize: 14, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer" }}>查看訊息 →</button>
          <button onClick={onClose} style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.line}`, background: "#fff", padding: "10px 0", fontSize: 14, fontWeight: 700, color: C.mute, cursor: "pointer" }}>稍後再看</button>
        </div>
      </div>
    </div>
  );
}

type View =
  | { name: "browse" }
  | { name: "bookDaily"; trip: Trip }
  | { name: "bookTour"; tourId: string }
  | { name: "orders" }
  | { name: "notifications" }
  | { name: "profile" };

export function PcLoginApp() {
  const [member, setMember] = useState<Member | null>(null);
  const [authState, setAuthState] = useState<"loading" | "in" | "out">("loading");
  const [view, setView] = useState<View>({ name: "browse" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [unreadPopup, setUnreadPopup] = useState(0); // v667：登入後未讀通知彈窗

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

  // v667：登入後若有未讀站內通知 → 跳一次彈窗（每 session 一次；已在通知頁不跳）
  useEffect(() => {
    if (authState !== "in" || !member) return;
    if (view.name === "notifications") return;
    const n = member.stats?.unreadNotifications ?? 0;
    if (n <= 0) return;
    try { if (sessionStorage.getItem(PC_UNREAD_POPUP_KEY)) return; } catch { /* ignore */ }
    setUnreadPopup(n);
    try { sessionStorage.setItem(PC_UNREAD_POPUP_KEY, "1"); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState, member]);

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
                member={member}
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
            {view.name === "notifications" && <NotificationsPanel />}
            {view.name === "profile" && <ProfilePanel member={member} onSaved={reloadMe} />}
            <PromoPopup load={() => api<{ items: ActivePromo[] }>("/api/promo/active").then((d) => d.items)} />
            {unreadPopup > 0 && (
              <UnreadPopupPc
                count={unreadPopup}
                onView={() => { setUnreadPopup(0); setView({ name: "notifications" }); }}
                onClose={() => setUnreadPopup(0)}
              />
            )}
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
  const navItem = (name: View["name"], label: string, badge?: number) => (
    <button
      onClick={() => setView({ name } as View)}
      style={{
        position: "relative",
        background: "none", border: "none", cursor: "pointer",
        color: view.name === name ? C.phosphor : "#cdd9e3",
        fontWeight: view.name === name ? 800 : 600, fontSize: 14, padding: "6px 4px",
        borderBottom: view.name === name ? `2px solid ${C.phosphor}` : "2px solid transparent",
        fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          // v666：nav 數量徽章 — 我的訂單=進行中筆數、通知=未讀數
          minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999,
          background: name === "notifications" ? C.coral : C.phosphor,
          color: name === "notifications" ? "#fff" : C.deep,
          fontSize: 11, fontWeight: 800, lineHeight: "18px", textAlign: "center",
          display: "inline-block",
        }}>{badge > 99 ? "99+" : badge}</span>
      )}
    </button>
  );
  return (
    <header style={{ background: C.deep, color: "#fff", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 12px rgba(10,35,66,.25)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 20px", height: 60, display: "flex", alignItems: "center", gap: 22 }}>
        <a href="/" style={{ color: "#fff", textDecoration: "none", display: "flex", alignItems: "center", gap: 9 }}>
          <MantaTridentMark size={24} color={C.phosphor} title="海王子" />
          <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>東北角海王子潛水</span>
        </a>
        {authState === "in" && (
          <nav style={{ display: "flex", gap: 18, marginLeft: 14 }}>
            {navItem("browse", "預約")}
            {navItem("orders", "我的訂單", member?.stats?.totalBookings)}
            {navItem("notifications", "通知", member?.stats?.unreadNotifications)}
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
            <a href="/api/auth/line/login?next=/pclogin" style={{ fontSize: 13, fontWeight: 800, color: C.deep, background: "#06C755", borderRadius: 9, padding: "8px 16px", textDecoration: "none" }}>
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
  const LOGIN_URL = "/api/auth/line/login?next=/pclogin";

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
          {/* v490：鬼蝠魟三叉戟標誌（深海藍方塊 + 白圖案） */}
          <BrandMark size={56} badge radius={15} style={{ boxShadow: "0 6px 16px rgba(10,35,66,.18)" }} />
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
function Browse({ member, onBookDaily, onBookTour }: {
  member: Member | null; onBookDaily: (t: Trip) => void; onBookTour: (id: string) => void;
}) {
  const [tab, setTab] = useState<"daily" | "tour" | "contact">("daily");
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
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn active={tab === "daily"} onClick={() => setTab("daily")}>🐠 日潛場次</TabBtn>
        <TabBtn active={tab === "tour"} onClick={() => setTab("tour")}>✈️ 潛旅行程</TabBtn>
        {/* v671：線上洽詢 — 問課程/潛旅、或揪團許願（搬自 /contact，登入會員免填身分/免驗證）*/}
        <TabBtn active={tab === "contact"} onClick={() => setTab("contact")}>📨 線上洽詢 / 揪團</TabBtn>
      </div>

      {tab === "contact" && <ContactPanel member={member} />}
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

// v671：線上洽詢 — 搬自公開 /contact，登入會員版（免填姓名/Email/電話、免 Turnstile，身分由後端用 cookie 自動帶）
const CONTACT_PRODUCTS = ["體驗潛水", "OW 考證", "AOW 進階", "1對1 私人", "Fun Dive", "潛水團", "包船", "其他"];
const CONTACT_PLACES = ["綠島", "蘭嶼", "小琉球", "墾丁", "媽媽島", "薄荷島", "其他"];
const CONTACT_LINE_URL = "https://line.me/R/ti/p/@894bpmew";

function ContactChips({ items, value, onPick, coral }: { items: string[]; value: string; onPick: (v: string) => void; coral?: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
      {items.map((it) => {
        const on = it === value;
        const bg = on ? (coral ? C.coral : "#0E9AA0") : "#fff";
        return (
          <button key={it} type="button" onClick={() => onPick(it)} style={{ fontSize: 13, padding: "6px 13px", borderRadius: 22, border: `1.5px solid ${on ? bg : "#cfe0e0"}`, background: bg, color: on ? "#fff" : "#0e7c8a", fontWeight: on ? 700 : 400, cursor: "pointer", fontFamily: "inherit" }}>{it}</button>
        );
      })}
    </div>
  );
}

function ContactPanel({ member }: { member: Member | null }) {
  const [aTopic, setATopic] = useState("體驗潛水");
  const [aSubject, setASubject] = useState("");
  const [aMsg, setAMsg] = useState("");
  const [aBusy, setABusy] = useState(false);
  const [aErr, setAErr] = useState("");
  const [aSent, setASent] = useState(false);

  const [bTopic, setBTopic] = useState("綠島");
  const [bSubject, setBSubject] = useState("");
  const [bWhen, setBWhen] = useState("");
  const [bPeople, setBPeople] = useState("");
  const [bNote, setBNote] = useState("");
  const [bBusy, setBBusy] = useState(false);
  const [bErr, setBErr] = useState("");
  const [bSent, setBSent] = useState(false);

  const who = member?.realName ?? member?.displayName ?? "您";
  const noEmail = !member?.email;

  async function submit(type: "question" | "wish") {
    if (noEmail) return;
    const isA = type === "question";
    if (isA) { setABusy(true); setAErr(""); } else { setBBusy(true); setBErr(""); }
    const payload = isA
      ? { type, topic: aTopic, subject: aSubject, message: aMsg }
      : { type, topic: bTopic, subject: bSubject, message: bNote, when: bWhen, people: bPeople };
    try {
      await api("/api/contact", { method: "POST", body: JSON.stringify(payload) });
      if (isA) setASent(true); else setBSent(true);
    } catch (e) {
      const m = e instanceof Error ? e.message : "送出失敗";
      if (isA) setAErr(m); else setBErr(m);
    } finally {
      if (isA) setABusy(false); else setBBusy(false);
    }
  }

  const cardBase = (bg: string, bc: string): React.CSSProperties => ({ background: bg, border: `1.5px solid ${bc}`, borderRadius: 16, padding: 20 });
  const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: C.deep, margin: "13px 0 7px" };
  const ta: React.CSSProperties = { ...inp, minHeight: 64, resize: "vertical", lineHeight: 1.6 };
  const sub: React.CSSProperties = { fontSize: 12.5, color: C.mute, lineHeight: 1.6, marginBottom: 4 };
  const sendBtn = (bg: string, busy: boolean): React.CSSProperties => ({ width: "100%", marginTop: 14, border: "none", borderRadius: 12, padding: 13, fontSize: 15, fontWeight: 800, color: "#fff", background: busy ? "#cdd9d9" : bg, fontFamily: "inherit", cursor: busy ? "wait" : "pointer", opacity: noEmail ? 0.5 : 1 });
  const errBox: React.CSSProperties = { background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 9, padding: "8px 12px", fontSize: 12.5, fontWeight: 600, marginTop: 10 };
  const doneBox = (color: string, text: string) => (
    <div style={{ textAlign: "center", padding: "24px 8px" }}>
      <div style={{ fontSize: 38 }}>✅</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 6 }}>已送出!</div>
      <p style={{ fontSize: 13, color: C.mute, marginTop: 8, lineHeight: 1.7 }}>{text}</p>
    </div>
  );

  return (
    <div>
      {/* 身分提示 */}
      <div style={{ background: "#eef6f8", border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12.5, color: C.deep }}>
        將以您的會員身分送出：<b>{who}</b>
        {member?.email ? <span style={{ color: C.mute }}>（回覆寄 {member.email}）</span> : <span style={{ color: C.coral, fontWeight: 700 }}>　⚠ 您尚未填 Email，請先到「會員中心」補 Email 才能送出</span>}
        ，免再填姓名 / Email / 電話。
      </div>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))" }}>
        {/* A 疑問 */}
        <div style={cardBase("#fff6f3", "#f3c6b8")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 22, background: "#ffe2d8" }}>🤔</div>
            <h3 style={{ fontSize: 18, color: "#c0432a", fontWeight: 800, margin: 0 }}>對課程 / 潛旅有疑問</h3>
          </div>
          {aSent ? doneBox("#c0432a", "我們收到你的問題了!會用 Email 回覆你，通常一天內。") : (
            <>
              <p style={sub}>還在考慮?選一個方案，把疑問問清楚再決定。</p>
              <div style={lbl}>你在考慮哪一個?</div>
              <ContactChips items={CONTACT_PRODUCTS} value={aTopic} onPick={setATopic} coral />
              <div style={lbl}>主旨（可補充）</div>
              <input style={inp} value={aSubject} onChange={(e) => setASubject(e.target.value)} placeholder="想問費用與天數…" />
              <div style={lbl}>想問什麼?</div>
              <textarea style={ta} value={aMsg} onChange={(e) => setAMsg(e.target.value)} placeholder="例：想帶女友一起體驗，她很怕水，適合嗎?" />
              {aErr && <div style={errBox}>{aErr}</div>}
              <button style={sendBtn("linear-gradient(135deg,#FF6B4A,#F5522F)", aBusy)} disabled={aBusy || noEmail} onClick={() => submit("question")}>{aBusy ? "送出中…" : "送出問題 ➤"}</button>
            </>
          )}
        </div>

        {/* B 許願 */}
        <div style={cardBase("#eef9f8", "#bfe5e2")}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 22, background: "#d6f0ee" }}>🌊</div>
            <h3 style={{ fontSize: 18, color: "#0e7c8a", fontWeight: 800, margin: 0 }}>想去某地 / 想揪團</h3>
          </div>
          {bSent ? doneBox("#0e7c8a", "許願收到了!湊到人或排好行程，我們會優先通知你。") : (
            <>
              <p style={sub}>想去但目前沒團?留個許願，湊到人就開、優先通知你。</p>
              <div style={lbl}>想去哪?</div>
              <ContactChips items={CONTACT_PLACES} value={bTopic} onPick={setBTopic} />
              <div style={lbl}>主旨（可補充）</div>
              <input style={inp} value={bSubject} onChange={(e) => setBSubject(e.target.value)} placeholder="想揪 7 月中的團…" />
              <div style={lbl}>大概什麼時候?幾個人?</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={inp} value={bWhen} onChange={(e) => setBWhen(e.target.value)} placeholder="例：7 月中" />
                <input style={inp} value={bPeople} onChange={(e) => setBPeople(e.target.value)} placeholder="人數 例：2" />
              </div>
              <div style={lbl}>備註（選填）</div>
              <textarea style={ta} value={bNote} onChange={(e) => setBNote(e.target.value)} placeholder="例：都有 OW，想看大香菇，住宿幫忙安排" />
              {bErr && <div style={errBox}>{bErr}</div>}
              <button style={sendBtn("linear-gradient(135deg,#0E9AA0,#0a6e73)", bBusy)} disabled={bBusy || noEmail} onClick={() => submit("wish")}>{bBusy ? "送出中…" : "送出許願 ➤"}</button>
            </>
          )}
        </div>
      </div>

      {/* 真人管道 */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#f4f8f9", border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 20px", marginTop: 18, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: C.deep }}>急著問?直接找真人 →</span>
        <a href={CONTACT_LINE_URL} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#06C755", color: "#fff", borderRadius: 11, padding: "10px 18px", fontSize: 14.5, fontWeight: 700, textDecoration: "none" }}>
          <span style={{ width: 20, height: 20, background: "#fff", borderRadius: 5, color: "#06C755", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>L</span>LINE 問汪汪教練（最快）
        </a>
        <span style={{ fontSize: 13, color: C.mute }}>或 Email：<b style={{ color: "#0e7c8a", fontFamily: "monospace" }}>service@haiwangzi.xyz</b></span>
      </div>
    </div>
  );
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
        <div style={{ fontSize: 13.5 }}>📍 {destZh(tour.destination)}</div>
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
  notes: string;
  cancelRead: boolean; safetyRead: boolean; // v491：取消 + 安全 兩政策（需點開看才能勾）
  signature: string | null;
  creditUsed: number; // v491：使用抵用金折抵
}
function useCommonForm(member: Member): [CommonForm, (patch: Partial<CommonForm>) => void] {
  const [f, setF] = useState<CommonForm>({
    realName: member.realName ?? "", phone: member.phone ?? "",
    cert: member.cert ?? "", certNumber: member.certNumber ?? "", logCount: String(member.logCount ?? ""),
    ecName: member.emergencyContact?.name ?? "", ecPhone: member.emergencyContact?.phone ?? "", ecRel: member.emergencyContact?.relationship ?? "",
    notes: "", cancelRead: false, safetyRead: false, signature: null, creditUsed: 0,
  });
  const patch = (p: Partial<CommonForm>) => setF((prev) => ({ ...prev, ...p }));
  return [f, patch];
}

interface Policies { cancellation: string; safety: string }

// v491：政策閘 — 兩個政策各需「查看」彈窗看過才能勾；簽名需兩個都勾才解鎖
function PolicyGate({ f, patch, policies }: { f: CommonForm; patch: (p: Partial<CommonForm>) => void; policies: Policies }) {
  const [open, setOpen] = useState<null | "cancel" | "safety">(null);
  const bothRead = f.cancelRead && f.safetyRead;
  const row = (key: "cancel" | "safety", label: string, read: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${read ? C.phosphor : C.line}`, borderRadius: 10, padding: "11px 13px", marginBottom: 8, background: read ? "#f0fbfa" : "#fff" }}>
      <input type="checkbox" checked={read} disabled={!read} readOnly style={{ width: 17, height: 17, accentColor: C.phosphor }} />
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600 }}>{label}</span>
      <button type="button" onClick={() => setOpen(key)} style={{ background: read ? C.line : C.deep, color: read ? C.mute : "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
        {read ? "已閱讀 ✓" : "查看並同意 ›"}
      </button>
    </div>
  );
  return (
    <>
      {row("cancel", "📋 取消政策", f.cancelRead)}
      {row("safety", "🛡️ 安全政策", f.safetyRead)}
      <div style={{ fontSize: 12, color: bothRead ? "#0a8f86" : C.mute, marginBottom: 12 }}>
        {bothRead ? "✓ 兩項政策皆已閱讀，請於下方簽名" : "請分別點開兩項政策閱讀並同意後，才能簽名送出"}
      </div>
      <div style={{ opacity: bothRead ? 1 : 0.45, pointerEvents: bothRead ? "auto" : "none" }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.deep, marginBottom: 6 }}>✍️ 手寫簽名（法律有效電子簽署）</div>
        <SignaturePad height={170} onChange={(dataUrl, hasInk) => patch({ signature: hasInk ? dataUrl : null })} />
      </div>

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}`, fontSize: 16, fontWeight: 800, color: C.deep }}>
              {open === "cancel" ? "📋 取消政策" : "🛡️ 安全政策"}
            </div>
            <div style={{ padding: "16px 20px", overflowY: "auto", fontSize: 13.5, lineHeight: 1.8, color: C.ink, whiteSpace: "pre-wrap" }}>
              {(open === "cancel" ? policies.cancellation : policies.safety) || "（管理員尚未設定此政策）"}
            </div>
            <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.line}` }}>
              <button type="button" onClick={() => { patch(open === "cancel" ? { cancelRead: true } : { safetyRead: true }); setOpen(null); }} style={{ ...primaryBtn(), background: C.coral, color: "#fff" }}>
                我已閱讀，關閉並同意
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// v491：使用抵用金折抵
function CreditBox({ balance, used, max, onChange }: { balance: number; used: number; max: number; onChange: (n: number) => void }) {
  // v604：餘額 0 時也顯示一行灰字說明，讓使用者知道有抵用金折抵機制
  if (balance <= 0) {
    return (
      <div style={{ fontSize: 12.5, color: "#8a8f98", marginBottom: 6 }}>
        🎁 目前無抵用金可折抵（生日禮金、VIP 升等、早鳥回饋等會自動入帳，下次下單即可折抵）
      </div>
    );
  }
  const cap = Math.min(balance, max);
  return (
    <>
      <SectionTitle>🎁 使用抵用金折抵</SectionTitle>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "#fff8ec", border: "1px solid #f3d8a0", borderRadius: 10, padding: "11px 14px" }}>
        <span style={{ fontSize: 13, color: "#9a6a18" }}>餘額 <b>{ntd(balance)}</b></span>
        <input type="number" min={0} max={cap} value={used || ""} onChange={(e) => onChange(Math.max(0, Math.min(cap, Number(e.target.value) || 0)))} placeholder="0" style={{ ...inp, width: 110 }} />
        <button type="button" onClick={() => onChange(cap)} style={{ background: C.deep, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>全部用</button>
        {used > 0 && <span style={{ fontSize: 13, color: "#0a8f86", fontWeight: 700 }}>折抵 {ntd(used)}</span>}
      </div>
    </>
  );
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

function CommonFields({ f, patch, policies }: { f: CommonForm; patch: (p: Partial<CommonForm>) => void; policies: Policies }) {
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
      <PolicyGate f={f} patch={patch} policies={policies} />
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
    creditUsed: f.creditUsed > 0 ? f.creditUsed : undefined,
  };
}

// v491：載入政策（取消 + 安全）— /api/config
function usePolicies(): Policies {
  const [p, setP] = useState<Policies>({ cancellation: "", safety: "" });
  useEffect(() => {
    api<{ cancellationPolicy?: string; safetyPolicy?: string; config?: { cancellationPolicy?: string; safetyPolicy?: string } }>("/api/config")
      .then((d) => setP({
        cancellation: d.cancellationPolicy ?? d.config?.cancellationPolicy ?? "",
        safety: d.safetyPolicy ?? d.config?.safetyPolicy ?? "",
      }))
      .catch(() => {});
  }, []);
  return p;
}
function BackBtn({ onBack }: { onBack: () => void }) {
  return <button onClick={onBack} style={{ background: "none", border: "none", color: C.mute, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 14 }}>← 返回</button>;
}
function formCard(): React.CSSProperties {
  return { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 16, padding: "24px 26px", boxShadow: "0 4px 20px rgba(10,35,66,.06)" };
}

// ─── 日潛下單表單 ──────────────────────────────────────────────────
interface Companion { name: string; cert: string; certNumber: string; phone: string; relationship: string }
function DailyBookingForm({ trip, member, onBack }: { trip: Trip; member: Member; onBack: () => void }) {
  const [f, patch] = useCommonForm(member);
  const policies = usePolicies();
  const [participants, setParticipants] = useState(1);
  const [tankCount, setTankCount] = useState(trip.tankCount);
  const [gear, setGear] = useState<Record<string, number>>({}); // type -> qty
  const [gearPrice, setGearPrice] = useState<Record<string, number>>({});
  const [companions, setCompanions] = useState<Companion[]>([]); // v491：多人潛伴（第2人起）
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // v592：節慶優惠代碼
  const [promoInput, setPromoInput] = useState("");
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  // 人數變動 → 同步潛伴欄位數（participants-1 位）
  useEffect(() => {
    setCompanions((prev) => {
      const need = Math.max(0, participants - 1);
      const next = prev.slice(0, need);
      while (next.length < need) next.push({ name: "", cert: "", certNumber: "", phone: "", relationship: "" });
      return next;
    });
  }, [participants]);

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
  const subtotal = divesAmount + extraAmount + gearAmount;
  const tankDiscPerTank = member.tankPromo?.active ? Math.min(member.tankPromo.discount ?? 0, trip.pricing.extraTank) : 0;
  const gearSaved = gearAmountRaw - gearAmount;
  // v592：節慶優惠代碼(取其優,可疊抵用金)
  const tankSaved = tankDiscPerTank * tankCount * participants;
  const preDiscountSubtotal = subtotal + tankSaved;
  const totalTanksAll = tankCount * participants;
  const codeDiscountEff = promoApplied && promoApplied.discount > tankSaved ? promoApplied.discount : 0;
  const finalSubtotal = Math.max(0, preDiscountSubtotal - Math.max(tankSaved, codeDiscountEff));
  const total = Math.max(0, finalSubtotal - f.creditUsed);

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true); setPromoMsg(null);
    try {
      const r = await api<{ ok: boolean; reason?: string; code?: string; discount?: number; label?: string }>(
        "/api/promo/validate",
        { method: "POST", body: JSON.stringify({ code, type: "daily", orderAmount: preDiscountSubtotal, totalTanks: totalTanksAll }) },
      );
      if (!r.ok) { setPromoApplied(null); setPromoMsg(r.reason ?? "優惠代碼無效"); }
      else {
        setPromoApplied({ code: r.code!, discount: r.discount ?? 0, label: r.label ?? "" });
        setPromoMsg((r.discount ?? 0) > tankSaved ? null : "目前已有更優的氣瓶折扣,此代碼不會額外折抵");
      }
    } catch (e) { setPromoMsg(e instanceof Error ? e.message : "驗證失敗"); }
    finally { setPromoBusy(false); }
  }

  async function submit() {
    setErr(null);
    if (!f.realName || !f.phone) { setErr("請填寫姓名與電話"); return; }
    if (!f.cancelRead || !f.safetyRead) { setErr("請先點開「取消政策」與「安全政策」閱讀並同意"); return; }
    if (!f.signature) { setErr("請手寫簽名"); return; }
    if (companions.some((c) => !c.name || !c.cert)) { setErr("多人預約：請填寫每位潛伴的姓名與證照等級"); return; }
    setSubmitting(true);
    try {
      const participantDetails = [
        { name: f.realName, phone: f.phone, cert: f.cert || undefined, certNumber: f.certNumber || undefined, logCount: f.logCount ? Number(f.logCount) : 0, relationship: "本人", isSelf: true },
        ...companions.map((c) => ({ name: c.name, phone: c.phone, cert: c.cert || undefined, certNumber: c.certNumber, logCount: 0, relationship: c.relationship, isSelf: false })),
      ];
      const body = {
        ...commonBody(f),
        tripId: trip.id,
        participants,
        tankCount,
        promoCode: promoApplied?.code, // v592
        cert: f.cert || undefined,
        certNumber: f.certNumber || undefined,
        logCount: f.logCount ? Number(f.logCount) : undefined,
        rentalGear: GEAR.filter((g) => (gear[g.type] ?? 0) > 0).map((g) => ({
          itemType: g.type as "BCD", price: gearPrice[g.type] ?? g.defPrice, qty: gear[g.type],
        })),
        participantDetails,
      };
      const res = await api<{ booking: { id: string; payLinkToken: string | null } }>("/api/bookings/daily", {
        method: "POST", body: JSON.stringify(body),
      });
      const b = res.booking;
      window.location.href = b.payLinkToken ? `/pay/${b.id}?t=${b.payLinkToken}` : `/pclogin`;
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

          <SectionTitle>裝備租借（每人）{member.gearDiscountPct < 100 && <span style={{ fontSize: 11, color: "#0a8f86", fontWeight: 600, marginLeft: 6 }}>🎖 VIP{member.vipLevel} 享 {100 - member.gearDiscountPct}% off</span>}</SectionTitle>
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

          {companions.length > 0 && (
            <>
              <SectionTitle>潛伴資料（{companions.length} 位）</SectionTitle>
              {companions.map((c, i) => (
                <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.deep, marginBottom: 8 }}>潛伴 {i + 2}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                    <input style={inp} placeholder="姓名 *" value={c.name} onChange={(e) => setCompanions((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <select style={inp} value={c.cert} onChange={(e) => setCompanions((p) => p.map((x, j) => j === i ? { ...x, cert: e.target.value } : x))}>
                      <option value="">證照等級 *</option>
                      {["OW", "AOW", "Rescue", "DM", "Instructor"].map((cc) => <option key={cc} value={cc}>{cc}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input style={inp} placeholder="電話（選填）" value={c.phone} onChange={(e) => setCompanions((p) => p.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
                    <input style={inp} placeholder="關係（選填，例：朋友）" value={c.relationship} onChange={(e) => setCompanions((p) => p.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} />
                  </div>
                </div>
              ))}
            </>
          )}

          {/* v592：節慶優惠代碼 */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: C.deep, marginBottom: 8 }}>🎏 優惠代碼</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inp, fontFamily: "monospace", flex: 1 }} placeholder="輸入優惠代碼" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} />
              <button type="button" onClick={applyPromo} disabled={promoBusy || !promoInput.trim()} style={{ background: C.deep, color: "#fff", border: "none", borderRadius: 9, padding: "0 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: promoBusy || !promoInput.trim() ? 0.5 : 1 }}>套用</button>
            </div>
            {promoApplied && codeDiscountEff > 0 && <div style={{ fontSize: 12, color: "#0a8f86", fontWeight: 700, marginTop: 8 }}>✓ {promoApplied.label}：折 {ntd(codeDiscountEff)}</div>}
            {promoMsg && <div style={{ fontSize: 12, color: "#c0473b", marginTop: 8 }}>{promoMsg}</div>}
          </div>

          <CreditBox balance={member.creditBalance} used={f.creditUsed} max={finalSubtotal} onChange={(n) => patch({ creditUsed: n })} />

          <CommonFields f={f} patch={patch} policies={policies} />
          {err && <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>{err}</div>}
        </div>

        <SummaryPanel
          rows={[
            ["潛水費", ntd(divesAmount), `${tankFee} × ${tankCount}潛 × ${participants}人`],
            ...(tankDiscPerTank > 0 && codeDiscountEff === 0 ? [["🔥 氣瓶折扣", `−${ntd(tankSaved)}`, `每支 −${tankDiscPerTank}`] as [string, string, string]] : []),
            ...(codeDiscountEff > 0 ? [["🎏 優惠代碼", `−${ntd(codeDiscountEff)}`, promoApplied?.label ?? ""] as [string, string, string]] : []),
            ...(extraAmount > 0 ? [["基本/附加費", ntd(extraAmount), ""] as [string, string, string]] : []),
            ...(gearAmount > 0 ? [["裝備租借", ntd(gearAmount), gearSaved > 0 ? `VIP 省 ${ntd(gearSaved)}` : ""] as [string, string, string]] : []),
            ...(f.creditUsed > 0 ? [["🎁 抵用金折抵", `−${ntd(f.creditUsed)}`, ""] as [string, string, string]] : []),
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
  const policies = usePolicies();
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
  const grossTotal = tour.basePrice * participants + addonAmount * participants;
  const total = Math.max(0, grossTotal - f.creditUsed);
  const depositTotal = tour.deposit * participants;

  async function submit() {
    setErr(null);
    if (!f.realName || !f.phone) { setErr("請填寫姓名與電話"); return; }
    if (!f.ecName || !f.ecPhone) { setErr("潛旅需填寫緊急聯絡人姓名與電話"); return; }
    if (!f.cancelRead || !f.safetyRead) { setErr("請先點開「取消政策」與「安全政策」閱讀並同意"); return; }
    if (!f.signature) { setErr("請手寫簽名"); return; }
    setSubmitting(true);
    try {
      const body = {
        tourId,
        participants,
        selectedAddons: addons,
        notes: f.notes || undefined,
        agreedToTerms: true as const,
        signatureDataUrl: f.signature ?? undefined,
        creditUsed: f.creditUsed > 0 ? f.creditUsed : undefined,
        realName: f.realName,
        phone: f.phone,
        certNumber: f.certNumber || undefined,
        emergencyContact: { name: f.ecName, phone: f.ecPhone, relationship: f.ecRel },
      };
      const res = await api<{ booking: { id: string; payLinkToken: string | null } }>("/api/bookings/tour", {
        method: "POST", body: JSON.stringify(body),
      });
      const b = res.booking;
      window.location.href = b.payLinkToken ? `/pay/${b.id}?t=${b.payLinkToken}` : `/pclogin`;
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
          <div style={{ fontSize: 14, color: C.mute }}>🗓️ {tour.dateStart} ~ {tour.dateEnd} ‧ 📍 {destZh(tour.destination)}</div>

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

          <CreditBox balance={member.creditBalance} used={f.creditUsed} max={grossTotal} onChange={(n) => patch({ creditUsed: n })} />

          <CommonFields f={f} patch={patch} policies={policies} />
          {err && <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginTop: 14 }}>{err}</div>}
        </div>

        <SummaryPanel
          rows={[
            ["團費", ntd(tour.basePrice * participants), `${ntd(tour.basePrice)} × ${participants}人`],
            ...(addonAmount > 0 ? [["加購", ntd(addonAmount * participants), ""] as [string, string, string]] : []),
            ...(f.creditUsed > 0 ? [["🎁 抵用金折抵", `−${ntd(f.creditUsed)}`, ""] as [string, string, string]] : []),
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
  pending: "待付款", awaiting_verify: "待核款", confirmed: "已確認", completed: "活動結束",
  cancelled_by_user: "活動取消（客戶取消）", cancelled_by_weather: "活動取消（天氣）",
  cancelled_unpaid: "活動取消（逾期）", no_show: "活動取消（未到場）",
};
// v657：是否「已結束」=已取消 / 活動結束 / 活動日已過
const PC_CANCELLED = new Set(["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid", "no_show"]);
function pcOrderDone(b: MyBooking, todayStr: string): { done: boolean; cancelled: boolean } {
  const cancelled = PC_CANCELLED.has(b.status);
  if (cancelled) return { done: true, cancelled: true };
  if (b.status === "completed") return { done: true, cancelled: false };
  const ev = b.type === "daily" ? b.ref?.date : (b.ref?.dateEnd ?? b.ref?.dateStart);
  if (ev && ev < todayStr) return { done: true, cancelled: false };
  return { done: false, cancelled: false };
}
const PAY_ZH: Record<string, string> = {
  unpaid: "未付款", pending: "未付款", deposit_paid: "已付訂金", fully_paid: "已付清", refunded: "已退款",
};
// v592/v596：桌面訊息中心 — 通知(可篩選) + 聯絡客服(雙向,複用客服信箱)
type Notif = { id: string; title: string; body: string; isRead: boolean; createdAt: string };
function NotificationsPanel() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"week" | "all" | "today" | "date">("week"); // v666：預設「近一周」
  const [pickDate, setPickDate] = useState("");
  const [contactMsg, setContactMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  type ChatMsg = { who: "me" | "cs"; body: string; createdAt: string };
  const [convo, setConvo] = useState<ChatMsg[]>([]);
  // v668：客服對話分頁 — 預設只載最近 30 則，往上補更早
  const [convoHasMore, setConvoHasMore] = useState(false);
  const [convoOldest, setConvoOldest] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const convoScrollRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true); // 下次 convo 更新後是否自動捲到底（載入更早時設 false）

  const reload = () => {
    setLoading(true);
    api<{ items: Notif[] }>("/api/me/notifications?limit=50")
      .then((d) => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  const loadConvo = () => {
    api<{ messages: ChatMsg[]; hasMore?: boolean; oldestAt?: string | null }>("/api/me/contact")
      .then((d) => {
        stickBottomRef.current = true;
        setConvo(d.messages ?? []);
        setConvoHasMore(!!d.hasMore);
        setConvoOldest(d.oldestAt ?? (d.messages?.[0]?.createdAt ?? null));
      })
      .catch(() => {});
  };
  const loadOlder = () => {
    if (!convoOldest || loadingOlder) return;
    setLoadingOlder(true);
    api<{ messages: ChatMsg[]; hasMore?: boolean; oldestAt?: string | null }>(`/api/me/contact?before=${encodeURIComponent(convoOldest)}`)
      .then((d) => {
        stickBottomRef.current = false; // 補在上面，維持目前捲動位置、不要跳到底
        setConvo((prev) => [...(d.messages ?? []), ...prev]);
        setConvoHasMore(!!d.hasMore);
        if (d.oldestAt) setConvoOldest(d.oldestAt);
      })
      .catch(() => {})
      .finally(() => setLoadingOlder(false));
  };
  useEffect(() => {
    reload();
    loadConvo();
    api("/api/me/notifications/read", { method: "POST", body: JSON.stringify({ all: true }) }).catch(() => {});
  }, []);
  // 對話更新後：初次/送出 → 自動捲到最新；載入更早 → 保持位置
  useEffect(() => {
    if (stickBottomRef.current && convoScrollRef.current) {
      convoScrollRef.current.scrollTop = convoScrollRef.current.scrollHeight;
    }
  }, [convo]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const dOf = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const weekAgo = new Date(Date.now() - 7 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const filtered = items.filter((n) => {
    if (filter === "week") return dOf(n.createdAt) >= weekAgo; // v666：近 7 天
    if (filter === "today") return dOf(n.createdAt) === today;
    if (filter === "date") return pickDate ? dOf(n.createdAt) === pickDate : true;
    return true;
  });

  async function sendContact() {
    if (!contactMsg.trim()) return;
    setSending(true); setSent(null);
    try {
      await api("/api/me/contact", { method: "POST", body: JSON.stringify({ message: contactMsg }) });
      setSent("✅ 已送出,客服會盡快回覆"); setContactMsg(""); loadConvo();
    } catch (e) { setSent(e instanceof Error ? e.message : "送出失敗"); }
    finally { setSending(false); }
  }

  const chip = (key: typeof filter, label: string) => (
    <button onClick={() => setFilter(key)} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer", background: filter === key ? C.deep : "#e6edf2", color: filter === key ? "#fff" : C.mute, fontWeight: 600 }}>{label}</button>
  );

  return (
    <div style={formCard()}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep, marginBottom: 12 }}>通知</h2>

      {/* 聯絡客服(雙向) */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14, background: "#f8fbfc" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.deep, marginBottom: 8 }}>💬 有問題?傳訊息給客服</div>
        <textarea value={contactMsg} onChange={(e) => setContactMsg(e.target.value)} rows={2} placeholder="輸入您的問題或需求…" style={{ ...inp, width: "100%", resize: "vertical" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 11.5, color: sent?.startsWith("✅") ? "#0a8f86" : "#c0473b" }}>{sent}</span>
          <button onClick={sendContact} disabled={sending || !contactMsg.trim()} style={{ background: C.deep, color: "#fff", border: "none", borderRadius: 9, padding: "7px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: sending || !contactMsg.trim() ? 0.5 : 1 }}>送出</button>
        </div>
        {convo.length > 0 && (
          <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
            <div style={{ fontSize: 11.5, color: C.mute, marginBottom: 8 }}>對話紀錄</div>
            {/* v668：固定高度捲動框 + 自動到最新 + 「載入更早」往上補 */}
            <div ref={convoScrollRef} style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
              {convoHasMore && (
                <button onClick={loadOlder} disabled={loadingOlder} style={{ alignSelf: "center", fontSize: 12, color: C.mute, background: "#eef3f6", border: "none", borderRadius: 999, padding: "4px 14px", cursor: "pointer", opacity: loadingOlder ? 0.5 : 1 }}>
                  {loadingOlder ? "載入中…" : "↑ 載入更早訊息"}
                </button>
              )}
              {convo.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", background: m.who === "me" ? C.deep : "#eef3f6", color: m.who === "me" ? "#fff" : C.ink }}>
                    {m.who === "cs" && <div style={{ fontSize: 11, fontWeight: 700, color: "#0a8f86", marginBottom: 2 }}>客服</div>}
                    {m.body}
                    <div style={{ fontSize: 10, opacity: 0.6, marginTop: 3, textAlign: "right" }}>{new Date(m.createdAt).toLocaleString("zh-TW")}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 篩選 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {chip("week", "近一周")}
        {chip("today", "今天")}
        {chip("all", "全部")}
        {chip("date", "選日期")}
        {filter === "date" && <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} style={{ ...inp, width: "auto" }} />}
        <button onClick={reload} style={{ marginLeft: "auto", fontSize: 12, color: C.mute, background: "none", border: "none", cursor: "pointer" }}>↻ 重新整理</button>
      </div>

      {loading && <div style={{ color: C.mute, fontSize: 14 }}>載入中…</div>}
      {!loading && filtered.length === 0 && <div style={{ color: C.mute, fontSize: 14, padding: "24px 0", textAlign: "center" }}>{filter === "all" ? "目前沒有通知" : "這個範圍沒有通知"}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((n) => (
          <div key={n.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", background: n.isRead ? "#fff" : "#f0fbfa" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.deep }}>{n.title}</div>
            <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.7, marginTop: 4, whiteSpace: "pre-wrap" }}>{n.body}</div>
            <div style={{ fontSize: 11, color: C.mute, marginTop: 6 }}>{new Date(n.createdAt).toLocaleString("zh-TW")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyOrders() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  useEffect(() => {
    api<{ bookings: MyBooking[] }>("/api/bookings/my").then((d) => setBookings(d.bookings)).catch(() => setBookings([]));
  }, []);
  if (bookings === null) return <Loading />;
  if (bookings.length === 0) return <Empty>還沒有任何訂單，去「預約」開始第一筆吧 🔱</Empty>;
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const upcoming = bookings.filter((b) => !pcOrderDone(b, todayStr).done);
  const done = bookings.filter((b) => pcOrderDone(b, todayStr).done);

  const renderRow = (b: MyBooking) => {
    const title = b.type === "daily"
      ? `日潛 ${b.ref?.date ?? ""} ${b.ref?.startTime ?? ""}`
      : (b.ref?.title ?? "潛旅");
    const sub = b.type === "daily"
      ? (b.ref?.sites?.join("、") ?? "")
      : `${b.ref?.dateStart ?? ""} ~ ${b.ref?.dateEnd ?? ""}`;
    const unpaid = b.totalAmount - b.paidAmount;
    const canPay = ["pending", "awaiting_verify", "confirmed"].includes(b.status) && unpaid > 0;
    const cancelled = pcOrderDone(b, todayStr).cancelled;
    return (
      <div key={b.id} style={{
        ...card(), flexDirection: "row", alignItems: "center", padding: "14px 18px", gap: 16,
        // v657：活動取消 → 灰底、整列淡化
        ...(cancelled ? { background: "#eef1f3", borderColor: "#d8dfe4", opacity: 0.92 } : {}),
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: cancelled ? C.mute : C.ink }}>{title}</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 2 }}>{sub} ‧ {b.participants} 人 ‧ 下單 {b.createdAt.slice(0, 10)}</div>
          {/* v664：活動提醒（場次/團層級，客戶可見）+ 客戶備註（自己填）*/}
          {b.ref?.activityNote && (
            <div style={{ fontSize: 12, color: "#0a7d4f", background: "#eafaf3", borderRadius: 8, padding: "5px 9px", marginTop: 6, lineHeight: 1.6 }}>📣 活動提醒：{b.ref.activityNote}</div>
          )}
          {b.notes && (
            <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>📝 我的備註：{b.notes}</div>
          )}
        </div>
        {cancelled ? (
          // 已取消：大字灰標
          <div style={{ fontSize: 16, fontWeight: 900, color: "#7c8a92", whiteSpace: "nowrap" }}>{STATUS_ZH[b.status] ?? "活動取消"}</div>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <Tag>{STATUS_ZH[b.status] ?? b.status}</Tag>
            <Tag>{PAY_ZH[b.paymentStatus] ?? b.paymentStatus}</Tag>
          </div>
        )}
        <div style={{ textAlign: "right", minWidth: 110 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: cancelled ? C.mute : C.deep }}>{ntd(b.totalAmount)}</div>
          {!cancelled && unpaid > 0 && <div style={{ fontSize: 12, color: C.coral }}>未付 {ntd(unpaid)}</div>}
        </div>
        {canPay && (
          <a href={b.payLinkToken ? `/pay/${b.id}?t=${encodeURIComponent(b.payLinkToken)}` : `/pay/${b.id}`} style={{ background: C.coral, color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 16px", borderRadius: 9, textDecoration: "none", whiteSpace: "nowrap" }}>
            前往付款
          </a>
        )}
      </div>
    );
  };

  const groupTitle = (t: string, n: number) => (
    <div style={{ fontSize: 14, fontWeight: 800, color: C.deep, margin: "6px 0 2px" }}>{t} <span style={{ color: C.mute, fontWeight: 600 }}>（{n}）</span></div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep }}>我的訂單</h2>

      {groupTitle("📌 即將進行的預約", upcoming.length)}
      {upcoming.length === 0
        ? <p style={{ fontSize: 12.5, color: C.mute, margin: "2px 0 8px" }}>目前沒有即將進行的預約。</p>
        : upcoming.map(renderRow)}

      {done.length > 0 && <>
        {groupTitle("✅ 已結束（活動結束 / 活動取消）", done.length)}
        {done.map(renderRow)}
      </>}

      <p style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>※ 退款 / 取消 / 上傳付款證明等，請在付款頁或手機 LINE App 操作。</p>
    </div>
  );
}

// ─── 會員中心 ──────────────────────────────────────────────────────
type PcCompanion = { id?: string; name: string; cert: string; certNumber: string; phone: string; relationship: string };
// v656：桌機會員中心補齊手機 LIFF 全部個資項目（基本/證照/緊急聯絡人/常用潛伴/生日/通知偏好）
function ProfilePanel({ member, onSaved }: { member: Member; onSaved: () => void }) {
  const [realName, setRealName] = useState(member.realName ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [email, setEmail] = useState(member.email ?? "");
  const [birthday, setBirthday] = useState((member.birthday ?? "").slice(0, 10));
  const [cert, setCert] = useState(member.cert ?? "");
  const [certNumber, setCertNumber] = useState(member.certNumber ?? "");
  const [logCount, setLogCount] = useState(String(member.logCount ?? ""));
  const [emName, setEmName] = useState(member.emergencyContact?.name ?? "");
  const [emPhone, setEmPhone] = useState(member.emergencyContact?.phone ?? "");
  const [emRel, setEmRel] = useState(member.emergencyContact?.relationship ?? "");
  const [companions, setCompanions] = useState<PcCompanion[]>(
    (member.companions ?? []).map((c) => ({ id: c.id, name: c.name ?? "", cert: c.cert ?? "", certNumber: c.certNumber ?? "", phone: c.phone ?? "", relationship: c.relationship ?? "" })),
  );
  const [notifyLine, setNotifyLine] = useState(member.notifyByLine ?? true);
  const [notifyEmail, setNotifyEmail] = useState(member.notifyByEmail ?? true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setCompanion(i: number, patch: Partial<PcCompanion>) {
    setCompanions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          realName, phone, email,
          birthday: birthday || null,
          cert: cert || null,
          certNumber,
          logCount: logCount ? Number(logCount) : 0,
          emergencyContact: { name: emName, phone: emPhone, relationship: emRel || "其他" },
          companions: companions.filter((c) => c.name.trim()).map((c) => ({ ...c, logCount: 0 })),
          notifyByLine: notifyLine,
          notifyByEmail: notifyEmail,
        }),
      });
      setMsg("✓ 已儲存");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "儲存失敗");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: C.deep, marginBottom: 14 }}>會員中心</h2>
      {/* 統計：4 格（與手機 LIFF 一致） */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
        <Stat label="會員等級" value={`LV${member.vipLevel}`} />
        <Stat label="抵用金" value={ntd(member.creditBalance)} />
        <Stat label="海王子氣瓶數" value={`${member.haiwangziLogCount ?? 0}`} />
        <Stat label="已結束預約" value={`${member.stats.completed}`} />
      </div>

      {/* 基本資料 */}
      <div style={formCard()}>
        <SectionTitle>基本資料</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {field("姓名", <input style={inp} value={realName} onChange={(e) => setRealName(e.target.value)} />)}
          {field("電話", <input style={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />)}
        </div>
        {field(
          "Email",
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input style={{ ...inp, flex: 1 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {member.emailVerifiedAt
              ? <span style={{ fontSize: 12, color: "#0a8f86", fontWeight: 700, whiteSpace: "nowrap" }}>✓ 已驗證</span>
              : <span style={{ fontSize: 12, color: C.coral, fontWeight: 700, whiteSpace: "nowrap" }}>未驗證</span>}
          </div>
        )}
        {field("生日（生日當月自動送禮金）", (
          <div>
            <input
              style={{ ...inp, ...(member.birthday ? { background: "#eef1f3", color: C.mute, cursor: "not-allowed" } : {}) }}
              type="date" value={birthday}
              readOnly={Boolean(member.birthday)}
              onChange={(e) => { if (!member.birthday) setBirthday(e.target.value); }}
            />
            {member.birthday && <div style={{ fontSize: 11.5, color: C.mute, marginTop: 4 }}>🔒 生日只能填一次、已鎖定；如需更正請洽客服。</div>}
          </div>
        ))}
      </div>

      {/* 潛水證照 */}
      <div style={formCard()}>
        <SectionTitle>潛水證照</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {field("證照等級", (
            <select style={inp} value={cert} onChange={(e) => setCert(e.target.value)}>
              <option value="">未選</option>
              {["OW", "AOW", "Rescue", "DM", "Instructor"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          ))}
          {field("證照號碼", <input style={inp} value={certNumber} onChange={(e) => setCertNumber(e.target.value)} />)}
          {field("潛水次數（自填總經驗）", <input style={inp} type="number" value={logCount} onChange={(e) => setLogCount(e.target.value.replace(/\D/g, ""))} />)}
        </div>
        <p style={{ fontSize: 11.5, color: C.mute, marginTop: 4, lineHeight: 1.6 }}>※ 此為自填總經驗，僅供教練參考；VIP 升等只看「海王子氣瓶數」（教練現場點名累積）。</p>
      </div>

      {/* 緊急聯絡人 */}
      <div style={formCard()}>
        <SectionTitle>緊急聯絡人</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {field("姓名", <input style={inp} value={emName} onChange={(e) => setEmName(e.target.value)} />)}
          {field("關係", <input style={inp} value={emRel} onChange={(e) => setEmRel(e.target.value)} placeholder="如：配偶 / 父母" />)}
          {field("電話", <input style={inp} value={emPhone} onChange={(e) => setEmPhone(e.target.value)} />)}
        </div>
      </div>

      {/* 常用潛伴 */}
      <div style={formCard()}>
        <SectionTitle>常用潛伴（下單可一鍵帶入）</SectionTitle>
        {companions.length === 0 && (
          <p style={{ fontSize: 12.5, color: C.mute, margin: "0 0 10px" }}>尚無常用潛伴，按下方新增。</p>
        )}
        {companions.map((c, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, marginBottom: 10, background: "#fafdfd" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
              {field("姓名", <input style={inp} value={c.name} onChange={(e) => setCompanion(i, { name: e.target.value })} />)}
              {field("關係", <input style={inp} value={c.relationship} onChange={(e) => setCompanion(i, { relationship: e.target.value })} />)}
              <button onClick={() => setCompanions((p) => p.filter((_, idx) => idx !== i))}
                style={{ height: 42, padding: "0 14px", border: `1px solid ${C.line}`, borderRadius: 9, background: "#fff", color: C.coral, fontWeight: 700, cursor: "pointer", marginBottom: 12 }}>
                移除
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {field("證照等級", (
                <select style={inp} value={c.cert} onChange={(e) => setCompanion(i, { cert: e.target.value })}>
                  <option value="">未選</option>
                  {["OW", "AOW", "Rescue", "DM", "Instructor"].map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              ))}
              {field("證照號碼", <input style={inp} value={c.certNumber} onChange={(e) => setCompanion(i, { certNumber: e.target.value })} />)}
              {field("電話", <input style={inp} value={c.phone} onChange={(e) => setCompanion(i, { phone: e.target.value })} />)}
            </div>
          </div>
        ))}
        <button onClick={() => setCompanions((p) => [...p, { name: "", cert: "", certNumber: "", phone: "", relationship: "" }])}
          style={{ width: "100%", border: `1px dashed ${C.line}`, background: "transparent", color: C.deep, padding: 11, borderRadius: 9, cursor: "pointer", fontSize: 13.5, fontWeight: 700 }}>
          ＋ 新增潛伴
        </button>
      </div>

      {/* 通知偏好 */}
      <div style={formCard()}>
        <SectionTitle>通知偏好</SectionTitle>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, marginBottom: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={notifyLine} onChange={(e) => setNotifyLine(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span>💬 LINE 推播通知（預約確認、催繳、退款等）</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} style={{ width: 18, height: 18 }} />
          <span>✉️ Email 通知（需先完成 Email 驗證）</span>
        </label>
      </div>

      {/* 儲存（一次存全部） */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn(), background: C.deep, color: "#fff", width: "auto", padding: "12px 32px" }}>
          {saving ? "儲存中…" : "儲存全部"}
        </button>
        {msg && <span style={{ fontSize: 13.5, fontWeight: 700, color: msg.startsWith("✓") ? "#0a8f86" : "#c0473b" }}>{msg}</span>}
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
