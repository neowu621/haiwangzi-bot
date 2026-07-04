"use client";
// v700：個人中心改 m2 風格 — 主清單只載入一次 /api/me;子頁點進去才呈現(個人資訊/證照/通知用已載資料即時開啟,
//   抵用金明細才另外即時讀 /api/me/credits)→ 減少讀取次數。移除「預約紀錄/潛水紀錄」。
import { useEffect, useState } from "react";
import Link from "next/link";
import { User, School, Bell, SlidersHorizontal, LifeBuoy, ArrowLeft, ChevronRight, MessageCircle, LayoutDashboard } from "lucide-react";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { setAdminToken, setAdminUser, type AdminWebUser } from "@/lib/admin-web-auth";
import { formatPhoneTW } from "@/lib/phone";
import { C, Sect } from "@/components/liff/mobileShared";

const CERTS = ["OW", "AOW", "DM", "Instructor"] as const;
type Cert = (typeof CERTS)[number];
interface Companion { id?: string; name: string; phone: string; cert: Cert | null; certNumber: string; logCount: number; relationship: string }
interface Me {
  displayName: string; realName: string | null; phone: string | null; email: string | null; emailVerifiedAt?: string | null;
  notifyByLine: boolean; notifyByEmail: boolean; cert: Cert | null; certNumber: string | null; logCount: number;
  haiwangziLogCount: number; roles?: string[]; role?: string; vipLevel: number; birthday: string | null;
  creditBalance: number; emergencyContact: { name: string; phone: string; relationship: string } | null;
  companions: Companion[]; stats: { totalBookings: number; completed: number };
}
const ntd = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;
const INP: React.CSSProperties = { width: "100%", height: 40, border: `1px solid ${C.line}`, borderRadius: 9, padding: "0 11px", fontSize: 14, boxSizing: "border-box", background: "#fff", color: C.ink };
const SELP: React.CSSProperties = { ...INP, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%237C8A99' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" };
function Lab({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 12, color: C.mute, marginBottom: 4 }}>{children}</div>; }
function BCard({ title, sub, children }: { title?: string; sub?: string; children: React.ReactNode }) {
  return <div style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 13, marginBottom: 11 }}>{title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: sub ? 2 : 9 }}>{title}</div>}{sub && <div style={{ fontSize: 11, color: C.mute, marginBottom: 9 }}>{sub}</div>}{children}</div>;
}
function LRow({ Icon, label, right, onClick }: { Icon: typeof User; label: string; right?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, background: "none", border: "none", borderBottomWidth: "0.5px", textAlign: "left", color: C.ink, cursor: "pointer" }}>
      <Icon size={19} color={C.mute} /><span style={{ flex: 1, fontSize: 14 }}>{label}</span>
      {right && <span style={{ fontSize: 13, color: C.mute }}>{right}</span>}<ChevronRight size={16} color={C.mute} />
    </button>
  );
}
function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 14, fontWeight: 600, border: "none", background: "none", color: C.ink, padding: "0 0 12px" }}><ArrowLeft size={17} color={C.accFg} />{title}</button>;
}

type View = null | "info" | "certs" | "notif" | "credits";

export default function ProfilePage() {
  const liff = useLiff();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useState<View>(null);

  // 表單狀態(由 me 帶入,子頁共用、儲存一次 PATCH)
  const [realName, setRealName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [notifyByLine, setNotifyByLine] = useState(true); const [notifyByEmail, setNotifyByEmail] = useState(true);
  const [cert, setCert] = useState<Cert | "">(""); const [certNumber, setCertNumber] = useState(""); const [logCount, setLogCount] = useState("");
  const [birthday, setBirthday] = useState(""); const [birthdayLocked, setBirthdayLocked] = useState(false);
  const [eName, setEName] = useState(""); const [ePhone, setEPhone] = useState(""); const [eRel, setERel] = useState("");
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(0);
  const [verifyMsg, setVerifyMsg] = useState("");

  function fill(u: Me) {
    setMe(u);
    setRealName(u.realName ?? ""); setPhone(formatPhoneTW(u.phone ?? "")); setEmail(u.email ?? "");
    setEmailVerifiedAt(u.emailVerifiedAt ? String(u.emailVerifiedAt) : null);
    setNotifyByLine(u.notifyByLine ?? true); setNotifyByEmail(u.notifyByEmail ?? true);
    setCert(u.cert ?? ""); setCertNumber(u.certNumber ?? ""); setLogCount(String(u.logCount ?? 0));
    setBirthday(u.birthday ? String(u.birthday).slice(0, 10) : ""); setBirthdayLocked(!!u.birthday);
    setEName(u.emergencyContact?.name ?? ""); setEPhone(formatPhoneTW(u.emergencyContact?.phone ?? "")); setERel(u.emergencyContact?.relationship ?? "");
    setCompanions(u.companions ?? []);
  }
  useEffect(() => {
    if (!liff.ready) return;
    liff.fetchWithAuth<Me>("/api/me").then(fill).catch(() => setErr(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);

  async function save(extra?: { companions?: Companion[] }) {
    setSaving(true);
    try {
      await liff.fetchWithAuth("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: realName || null, phone: phone || null, email: email.trim() || null,
          notifyByLine, notifyByEmail, cert: cert || null, certNumber: certNumber || null,
          logCount: Number(logCount) || 0, birthday: birthday || null,
          emergencyContact: eName && ePhone ? { name: eName, phone: ePhone, relationship: eRel || "其他" } : null,
          ...(extra?.companions ? { companions: extra.companions.filter((c) => c.name.trim().length >= 1) } : {}),
        }),
      });
      setSaved(Date.now());
    } catch { window.alert("儲存失敗，請稍後再試"); } finally { setSaving(false); }
  }
  async function sendVerify() {
    setVerifyMsg("");
    try {
      const r = await liff.fetchWithAuth<{ ok?: boolean; sent?: boolean; alreadyVerified?: boolean; message?: string; error?: string }>("/api/me/send-verify-email", { method: "POST" });
      if (r.alreadyVerified) setVerifyMsg("✓ 此 Email 已驗證");
      else if (r.ok && r.sent) setVerifyMsg(`📧 驗證信已寄至 ${email}，請收信點連結`);
      else setVerifyMsg(r.message ?? r.error ?? "發送失敗，請稍後再試");
    } catch (e) { setVerifyMsg((e instanceof Error && e.message.includes("429")) ? "⏱ 請等 60 秒後再重發" : "發送失敗，請稍後再試"); }
  }

  const isStaff = !!me && (me.roles ?? [me.role ?? ""]).some((r) => ["admin", "boss", "it", "coach", "assistant"].includes(r));
  const saveBtn = (extra?: { companions?: Companion[] }) => <button onClick={() => save(extra)} disabled={saving} style={{ width: "100%", height: 46, background: C.accFg, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, marginTop: 14, opacity: saving ? 0.6 : 1 }}>{saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存"}</button>;

  function frame(inner: React.ReactNode) {
    return <LiffShell title="個人中心" backHref="/liff/home" bottomNav={<BottomNav />}><div style={{ padding: "13px 14px", color: C.ink, fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>{inner}</div></LiffShell>;
  }
  if (err) return frame(<div style={{ color: C.mute, fontSize: 13, padding: "30px 0", textAlign: "center" }}>載入失敗，請重新整理</div>);
  if (!me) return <LiffShell title="個人中心" backHref="/liff/home" bottomNav={<BottomNav />}><LiffLoading variant="ring" label="載入個人中心..." /></LiffShell>;

  // ===== 子頁 =====
  if (view === "info") return frame(
    <>
      <SubHeader title="個人資訊" onBack={() => setView(null)} />
      <BCard>
        <Lab>姓名</Lab><input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="本名" style={INP} />
        <div style={{ marginTop: 10 }}><Lab>手機</Lab><input value={phone} onChange={(e) => setPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={INP} /></div>
        <div style={{ marginTop: 10 }}><Lab>Email（收預約確認 / 行前通知 / 發票）</Lab><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@example.com" style={INP} />
          <div style={{ marginTop: 6 }}>{emailVerifiedAt ? <span style={{ fontSize: 11.5, color: C.okFg }}>✓ Email 已驗證</span> : <button onClick={sendVerify} style={{ fontSize: 11.5, border: `1px solid ${C.accFg}`, color: C.accFg, background: "none", borderRadius: 999, padding: "4px 12px" }}>發送驗證信 🎁 完成首潛得 100 元</button>}{verifyMsg && <div style={{ fontSize: 11.5, color: C.okFg, marginTop: 5 }}>{verifyMsg}</div>}</div>
        </div>
        <div style={{ marginTop: 10 }}><Lab>生日（當月發放抵用金 🎂・填寫後不可自行修改）</Lab><input type="date" value={birthday} disabled={birthdayLocked} onChange={(e) => setBirthday(e.target.value)} style={{ ...INP, opacity: birthdayLocked ? 0.6 : 1 }} /></div>
        <div style={{ fontSize: 12.5, fontWeight: 600, margin: "14px 0 6px" }}>緊急聯絡人</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="姓名" style={INP} />
          <input value={eRel} onChange={(e) => setERel(e.target.value)} placeholder="關係" style={INP} />
        </div>
        <input value={ePhone} onChange={(e) => setEPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={{ ...INP, marginTop: 8 }} />
      </BCard>
      {saveBtn()}
    </>
  );
  if (view === "certs") return frame(
    <>
      <SubHeader title="證照 / 潛伴" onBack={() => setView(null)} />
      <BCard title="我的證照">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Lab>證照等級</Lab><select value={cert} onChange={(e) => setCert(e.target.value as Cert | "")} style={SELP}><option value="">未填</option>{CERTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><Lab>累計潛水支數</Lab><input value={logCount} onChange={(e) => setLogCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...INP, textAlign: "center" }} /></div>
        </div>
      </BCard>
      <BCard title={`常用潛伴（${companions.length}）`} sub="下單時可一鍵帶入">
        {companions.map((c, i) => (
          <div key={c.id ?? i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>潛伴 #{i + 1}</span><button onClick={() => { if (window.confirm("確定刪除這位潛伴？")) setCompanions((a) => a.filter((_, j) => j !== i)); }} style={{ fontSize: 11, color: C.coral, background: "none", border: "none" }}>刪除</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input value={c.name} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="姓名 *" style={INP} />
              <input value={c.phone} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, phone: formatPhoneTW(e.target.value) } : x))} inputMode="numeric" maxLength={11} placeholder="手機" style={INP} />
              <select value={c.cert ?? ""} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, cert: (e.target.value || null) as Cert | null } : x))} style={SELP}><option value="">證照</option>{CERTS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}</select>
              <input value={c.relationship} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} placeholder="關係" style={INP} />
            </div>
          </div>
        ))}
        <button onClick={() => setCompanions((a) => [...a, { name: "", phone: "", cert: null, certNumber: "", logCount: 0, relationship: "" }])} style={{ width: "100%", border: `1px dashed ${C.line}`, background: "none", color: C.accFg, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>＋ 新增潛伴</button>
      </BCard>
      {saveBtn({ companions })}
    </>
  );
  if (view === "notif") return frame(
    <>
      <SubHeader title="通知偏好" onBack={() => setView(null)} />
      <BCard title="通知偏好" sub="選擇用哪些管道接收預約確認、行前提醒與重要通知">
        {([["line", "LINE 通知", "透過官方帳號推播（最即時）", notifyByLine, setNotifyByLine], ["email", "Email 通知", "寄到你的信箱（需先驗證 Email）", notifyByEmail, setNotifyByEmail]] as const).map(([k, t, s, on, setOn]) => (
          <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `0.5px solid ${C.line}` }}>
            <span style={{ flex: 1 }}><span style={{ fontSize: 14, display: "block" }}>{t}</span><span style={{ fontSize: 11.5, color: C.mute }}>{s}</span></span>
            <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} style={{ width: 20, height: 20 }} />
          </label>
        ))}
      </BCard>
      {saveBtn()}
    </>
  );
  if (view === "credits") return frame(<CreditsView onBack={() => setView(null)} liff={liff} balance={me.creditBalance ?? 0} />);

  // ===== 主清單 =====
  const name = me.realName ?? me.displayName ?? "會員";
  // v729：身分徽章 + 後台連結 —— 多重身分取最高優先
  const myRoles = me.roles ?? [me.role ?? ""];
  const ROLE_LABEL: Record<string, string> = { it: "IT", boss: "老闆", admin: "管理", coach: "教練", assistant: "助教" };
  const primaryRole = ["it", "boss", "admin", "coach", "assistant"].find((r) => myRoles.includes(r));
  const roleLabel = primaryRole ? ROLE_LABEL[primaryRole] : null;
  const isAdminLevel = myRoles.some((r) => ["it", "boss", "admin"].includes(r));
  const stats: Array<[string, string]> = [
    [String(me.haiwangziLogCount ?? 0), "海王子潛次"], [String(me.creditBalance ?? 0), "抵用金"],
    [String(me.stats?.totalBookings ?? 0), "進行中"], [me.vipLevel ? `LV${me.vipLevel}` : "會員", "等級"],
  ];
  return frame(
    <>
      <div style={{ textAlign: "center", padding: "6px 0 12px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.accBg, color: C.accFg, display: "grid", placeItems: "center", margin: "0 auto" }}><User size={30} /></div>
        <div style={{ fontSize: 16, fontWeight: 500, marginTop: 8 }}>{name}</div>
        <div style={{ fontSize: 12, color: C.mute }}>{me.email ?? ""}</div>
        {roleLabel && (
          <span style={{ display: "inline-block", marginTop: 6, fontSize: 11.5, fontWeight: 700, color: C.accFg, background: C.accBg, borderRadius: 999, padding: "2px 11px" }}>
            {roleLabel}
          </span>
        )}
      </div>
      <div style={{ display: "flex", background: C.page, borderRadius: 12, padding: "12px 0", textAlign: "center", marginBottom: 6 }}>
        {stats.map(([a, b]) => <div key={b} style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 500 }}>{a}</div><div style={{ fontSize: 11, color: C.mute }}>{b}</div></div>)}
      </div>
      <Sect t="帳戶" />
      <LRow Icon={User} label="個人資訊" right={me.phone ?? ""} onClick={() => setView("info")} />
      <LRow Icon={School} label="證照 / 潛伴" right={me.cert ?? "未填"} onClick={() => setView("certs")} />
      <LRow Icon={Bell} label="通知偏好" onClick={() => setView("notif")} />
      <Sect t="訊息" />
      {/* v709：站內訊息已移到底部分頁；這裡第一層只留「聯絡客服」 */}
      <Link href="/liff/messages" style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, textDecoration: "none", color: C.ink }}>
        <MessageCircle size={19} color={C.mute} /><span style={{ flex: 1, fontSize: 14 }}>聯絡客服</span><ChevronRight size={16} color={C.mute} />
      </Link>
      <Sect t="紀錄" />
      <LRow Icon={SlidersHorizontal} label="抵用金明細" right={ntd(me.creditBalance ?? 0)} onClick={() => setView("credits")} />
      {isStaff && (<>
        <Sect t="管理" />
        <Link href="/liff/coach/today" style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, textDecoration: "none", color: C.ink }}>
          <LifeBuoy size={19} color={C.okFg} /><span style={{ flex: 1, fontSize: 14 }}>教練到場點名</span><ChevronRight size={16} color={C.mute} />
        </Link>
        {isAdminLevel && (
          // v793：用 LINE 身分直接換發後台 session(免帳密) → 手機簡易後台 /admin/m
          <button
            onClick={async () => {
              try {
                const r = await liff.fetchWithAuth<{ token: string; user: AdminWebUser }>(
                  "/api/admin-web/liff-session",
                  { method: "POST" },
                );
                setAdminToken(r.token);
                setAdminUser(r.user);
                window.location.href = "/admin/m";
              } catch (e) {
                alert("進入後台失敗：" + (e instanceof Error ? e.message : String(e)));
              }
            }}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", background: "none", textAlign: "left", borderBottom: `0.5px solid ${C.line}`, color: C.ink, cursor: "pointer" }}
          >
            <LayoutDashboard size={19} color={C.accFg} /><span style={{ flex: 1, fontSize: 14 }}>後台管理（LINE 直接進入）</span><ChevronRight size={16} color={C.mute} />
          </button>
        )}
      </>)}
      <Sect t="其他" />
      <button onClick={() => liff.logout()} style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", background: "none", textAlign: "left", color: C.dangFg }}>
        <ArrowLeft size={19} /><span style={{ flex: 1, fontSize: 14 }}>登出</span>
      </button>
    </>
  );
}

interface CreditTx { id: string; amount: number; reason: string; note?: string | null; refCode?: string | null; balanceAfter?: number; createdAt: string }
const CREDIT_REASON: Record<string, [string, string]> = { birthday: ["🎂", "生日抵用金"], vip_upgrade: ["✨", "升等獎勵"], refund: ["🔄", "退費補償"], used: ["💸", "訂單折抵"], admin_adjust: ["🛠", "管理員調整"], first_order_reward: ["🎉", "首單獎勵"], signup_reward: ["🎁", "註冊禮金"], vip_overflow: ["🏆", "VIP 滿級回饋"] };
function CreditsView({ onBack, liff, balance }: { onBack: () => void; liff: ReturnType<typeof useLiff>; balance: number }) {
  const [data, setData] = useState<{ balance: number; totalIn: number; totalOut: number; txs: CreditTx[] } | null>(null);
  useEffect(() => {
    if (!liff.ready) return;
    liff.fetchWithAuth<{ balance: number; totalIn: number; totalOut: number; txs: CreditTx[] }>("/api/me/credits")
      .then((d) => setData({ balance: d.balance ?? balance, totalIn: d.totalIn ?? 0, totalOut: d.totalOut ?? 0, txs: d.txs ?? [] }))
      .catch(() => setData({ balance, totalIn: 0, totalOut: 0, txs: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);
  return (
    <>
      <SubHeader title="抵用金明細" onBack={onBack} />
      {!data ? <LiffLoading variant="ring" label="讀取抵用金紀錄..." /> : (<>
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
