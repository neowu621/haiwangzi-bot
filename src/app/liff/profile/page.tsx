"use client";
// v700：個人中心改 m2 風格 — 主清單只載入一次 /api/me;子頁點進去才呈現(個人資訊/證照/通知用已載資料即時開啟,
//   抵用金明細才另外即時讀 /api/me/credits)→ 減少讀取次數。移除「預約紀錄/潛水紀錄」。
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, School, SlidersHorizontal, LifeBuoy, ArrowLeft, ChevronRight, MessageCircle } from "lucide-react";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { setAdminToken, setAdminUser, type AdminWebUser } from "@/lib/admin-web-auth";
import { formatPhoneTW } from "@/lib/phone";
import { C, Sect } from "@/components/liff/mobileShared";
import { VipTierIcon } from "@/components/VipTierIcon";
import { VIP_TIERS } from "@/lib/vip-tier"; // v1006：等級名稱(龍蝦…)顯示用

const CERTS = ["OW", "AOW", "DM", "Instructor"] as const;
type Cert = (typeof CERTS)[number];
interface Companion { id?: string; name: string; nickname?: string | null; phone: string; cert: Cert | null; certNumber: string; logCount: number; relationship: string; weightBelt?: number | null }
interface Me {
  displayName: string; realName: string | null; nickname?: string | null; phone: string | null; email: string | null; emailVerifiedAt?: string | null;
  firstOrderRewardGrantedAt?: string | null; // v1063：已領過首潛獎勵 → 文案不再提「得 100 元」
  cert: Cert | null; certNumber: string | null; logCount: number; weightBelt?: number | null;
  haiwangziLogCount: number; roles?: string[]; role?: string; vipLevel: number; birthday: string | null;
  creditBalance: number; emergencyContact: { name: string; phone: string; relationship: string } | null;
  companions: Companion[]; stats: { totalBookings: number; completed: number };
}
const ntd = (n: number) => `NT$ ${Number(n || 0).toLocaleString()}`;
const INP: React.CSSProperties = { width: "100%", height: 40, border: `1px solid ${C.line}`, borderRadius: 9, padding: "0 11px", fontSize: 14, boxSizing: "border-box", background: "#fff", color: C.ink };
const SELP: React.CSSProperties = { ...INP, appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' stroke='%237C8A99' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" };
function Lab({ children }: { children: React.ReactNode }) { return <div style={{ fontSize: 12, color: C.mute, marginBottom: 4 }}>{children}</div>; }
// v1063：檢視模式的一列。刻意不用 input —— 唯讀資料就該長得像資料，不像待填欄位。
function VRow({ k, v, extra, nick, last }: { k: string; v?: string | null; extra?: React.ReactNode; nick?: boolean; last?: boolean }) {
  const empty = !v || !String(v).trim();
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <span style={{ fontSize: 12, color: C.mute, flex: "0 0 auto" }}>{k}</span>
      <span style={{ fontSize: 14, textAlign: "right", wordBreak: "break-all" }}>
        {empty
          ? <span style={{ color: "#B6C0CA" }}>未填</span>
          : nick ? <span style={{ color: "#6D28D9", fontWeight: 800 }}>{v}</span> : v}
        {extra}
      </span>
    </div>
  );
}
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

type View = null | "info" | "certs" | "credits";

export default function ProfilePage() {
  const liff = useLiff();
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useState<View>(null);

  // 表單狀態(由 me 帶入,子頁共用、儲存一次 PATCH)
  const [realName, setRealName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState(""); // v1006：暱稱
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [rewarded, setRewarded] = useState(false); // v1063：首潛獎勵是否已領過（一帳號一次）
  // v1063：個人資訊預設唯讀 —— 手機上整頁都是輸入框，滑動很容易誤觸改到資料而不自知。
  //   按「編輯」才進可改狀態；「取消」用 origRef 還原。
  const [editing, setEditing] = useState(false);
  const origRef = useRef<Me | null>(null);
  const [emailJustChanged, setEmailJustChanged] = useState(false); // 剛存檔且 email 有變 → 顯示重新驗證橫幅
  const [cert, setCert] = useState<Cert | "">(""); const [certNumber, setCertNumber] = useState(""); const [logCount, setLogCount] = useState("");
  const [weightBelt, setWeightBelt] = useState(""); // v983：慣用配重(kg)
  const [birthday, setBirthday] = useState(""); const [birthdayLocked, setBirthdayLocked] = useState(false);
  const [eName, setEName] = useState(""); const [ePhone, setEPhone] = useState(""); const [eRel, setERel] = useState("");
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(0);
  const [verifyMsg, setVerifyMsg] = useState("");
  // v844：老闆待處理數量（現場報到 / 老闆結帳 / 客服信箱）— v853：僅老闆/IT 才抓
  const [adminTodo, setAdminTodo] = useState<{ attendance: number; settle: number; inbox: number; wishes: number; refunds: number } | null>(null);
  useEffect(() => {
    if (!me) return;
    const roles = me.roles ?? [me.role ?? ""];
    if (!roles.some((r) => ["it", "boss"].includes(r))) return;
    liff
      .fetchWithAuth<{ tonight?: { proofs?: number; attendance?: number; pendingOrders?: number }; pendingEmails?: number; pendingWishes?: number; pendingRefunds?: number }>("/api/admin/stats/lite")
      .then((d) => setAdminTodo({
        attendance: d.tonight?.attendance ?? 0,
        // v898：願望單獨立成一項，不再併進「老闆結帳」badge
        settle: (d.tonight?.proofs ?? 0) + (d.tonight?.pendingOrders ?? 0),
        inbox: d.pendingEmails ?? 0,
        wishes: d.pendingWishes ?? 0,
        refunds: d.pendingRefunds ?? 0, // v1069：客戶申請退款待審
      }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  function fill(u: Me) {
    setMe(u);
    setRealName(u.realName ?? ""); setPhone(formatPhoneTW(u.phone ?? "")); setEmail(u.email ?? "");
    setNickname(u.nickname ?? ""); // v1006
    setEmailVerifiedAt(u.emailVerifiedAt ? String(u.emailVerifiedAt) : null);
    setRewarded(!!u.firstOrderRewardGrantedAt); // v1063
    origRef.current = u; // v1063：取消時還原用
    setCert(u.cert ?? ""); setCertNumber(u.certNumber ?? ""); setLogCount(String(u.logCount ?? 0));
    setWeightBelt(u.weightBelt != null ? String(u.weightBelt) : ""); // v983：帶入配重
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
          realName: realName || null, nickname: nickname.trim() || null, phone: phone || null, email: email.trim() || null,
          cert: cert || null, certNumber: certNumber || null,
          logCount: Number(logCount) || 0, weightBelt: weightBelt.trim() ? Number(weightBelt) : null, // v983：配重
          birthday: birthday || null,
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
  // ── v1063：個人資訊的檢視／編輯模式 ──
  //   emailDirty：跟載入時的原值比，不是跟「上一次輸入」比 —— 改回原本的信箱就不算變更。
  const emailDirty = (email.trim() || null) !== (origRef.current?.email ?? null);
  function startEdit() { setEmailJustChanged(false); setVerifyMsg(""); setEditing(true); }
  function cancelEdit() {
    // 還原成載入時的值（不打 API）—— 這是「取消」唯一有意義的定義
    if (origRef.current) fill(origRef.current);
    setEditing(false);
  }
  async function saveInfo() {
    const changed = emailDirty;
    await save();
    setEditing(false);
    if (changed) {
      // 後端偵測到 email 變更會把 emailVerifiedAt 清成 null（/api/me v311），
      // 這裡同步前端狀態並亮出重新驗證的橫幅。
      setEmailVerifiedAt(null);
      setEmailJustChanged(true);
      if (origRef.current) origRef.current = { ...origRef.current, email: email.trim() || null, emailVerifiedAt: null };
    }
  }

  const saveBtn = (extra?: { companions?: Companion[] }) => <button onClick={() => save(extra)} disabled={saving} style={{ width: "100%", height: 46, background: C.accFg, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, marginTop: 14, opacity: saving ? 0.6 : 1 }}>{saving ? "儲存中…" : saved ? "✓ 已儲存" : "儲存"}</button>;

  function frame(inner: React.ReactNode) {
    return <LiffShell title="個人中心" backHref="/liff/home" bottomNav={<BottomNav />}><div style={{ padding: "13px 14px", color: C.ink, fontFamily: "'Noto Sans TC',system-ui,sans-serif" }}>{inner}</div></LiffShell>;
  }
  if (err) return frame(<div style={{ color: C.mute, fontSize: 13, padding: "30px 0", textAlign: "center" }}>載入失敗，請重新整理</div>);
  if (!me) return <LiffShell title="個人中心" backHref="/liff/home" bottomNav={<BottomNav />}><LiffLoading variant="ring" label="載入個人中心..." /></LiffShell>;

  // ===== 子頁 =====
  if (view === "info") return frame(
    <>
      <SubHeader title="個人資訊" onBack={() => { setView(null); cancelEdit(); }} />

      {/* v1063：剛改完 Email → 明講驗證已失效並直接給寄信入口。
          後端本來就會清掉 emailVerifiedAt（/api/me v311），只是以前安靜地做，客戶不知情。 */}
      {emailJustChanged && !emailVerifiedAt && (
        <div style={{ background: C.warnBg, color: C.warnFg, borderRadius: 12, padding: "12px 13px", fontSize: 12.5, lineHeight: 1.75, marginBottom: 11 }}>
          <b style={{ display: "block", marginBottom: 2 }}>📧 Email 已更新，需要重新驗證</b>
          你把信箱改成 <b>{email}</b>。為了確認這個信箱收得到信，原本的驗證已失效 ——
          <b>未驗證的信箱收不到預約確認信與行前通知</b>。
          {!rewarded && "完成驗證後，首次潛水還能拿 100 元抵用金 🎁。"}
          <div><button onClick={sendVerify} style={{ marginTop: 8, border: "1px solid currentColor", background: "none", color: "inherit", borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 600 }}>發送驗證信到新信箱</button></div>
          {verifyMsg && <div style={{ marginTop: 6, fontWeight: 600 }}>{verifyMsg}</div>}
        </div>
      )}

      {!editing ? (
        /* ── 檢視模式（預設）── 唯讀呈現，手機滑動不會誤觸欄位 ── */
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>個人資訊</span>
            <button onClick={startEdit} style={{ border: `1px solid ${C.accFg}`, color: C.accFg, background: "none", borderRadius: 999, padding: "5px 14px", fontSize: 12.5, fontWeight: 600 }}>✏️ 編輯</button>
          </div>
          <BCard>
            <VRow k="姓名" v={realName} />
            <VRow k="暱稱" v={nickname} nick />
            <VRow k="手機" v={phone} />
            <VRow k="Email" v={email} extra={
              <div style={{ marginTop: 4 }}>
                {emailVerifiedAt
                  ? <span style={{ fontSize: 11.5, background: C.okBg, color: C.okFg, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>✓ 已驗證</span>
                  : <>
                      <span style={{ fontSize: 11.5, background: C.warnBg, color: C.warnFg, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>⚠ 待驗證</span>
                      {!emailJustChanged && (
                        <div style={{ marginTop: 6 }}>
                          {/* v1063：首潛獎勵一帳號一次 —— 領過的人不再看到「得 100 元」 */}
                          <button onClick={sendVerify} style={{ fontSize: 11.5, border: `1px solid ${C.accFg}`, color: C.accFg, background: "none", borderRadius: 999, padding: "4px 12px" }}>
                            發送驗證信{rewarded ? "" : " 🎁 完成首潛得 100 元"}
                          </button>
                          {verifyMsg && <div style={{ fontSize: 11.5, color: C.okFg, marginTop: 5 }}>{verifyMsg}</div>}
                        </div>
                      )}
                    </>}
              </div>
            } />
            <VRow k="生日" v={birthday} extra={birthdayLocked ? <span style={{ fontSize: 11, color: C.mute }}>🔒 填寫後不可自行修改</span> : null} last />
          </BCard>
          <BCard title="緊急聯絡人">
            <VRow k="姓名" v={eName} />
            <VRow k="關係" v={eRel} />
            <VRow k="電話" v={ePhone} last />
          </BCard>
        </>
      ) : (
        /* ── 編輯模式 ── */
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>個人資訊</span>
            <span style={{ fontSize: 11.5, background: C.accBg, color: C.accFg, borderRadius: 999, padding: "3px 10px", fontWeight: 600 }}>編輯中</span>
          </div>
          <BCard>
            <Lab>姓名</Lab><input value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="本名" style={INP} />
            {/* v1006：暱稱——教練現場好稱呼 */}
            <div style={{ marginTop: 10 }}><Lab>暱稱（教練好稱呼你，例：阿明、Amy）</Lab><input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="選填" style={INP} /></div>
            <div style={{ marginTop: 10 }}><Lab>手機</Lab><input value={phone} onChange={(e) => setPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={INP} /></div>
            <div style={{ marginTop: 10 }}><Lab>Email（收預約確認 / 行前通知 / 發票）</Lab><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="you@example.com" style={INP} />
              {/* v1063：改動當下就講清楚代價，不要等存完才發現驗證沒了 */}
              {emailDirty ? (
                <div style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 6, color: C.warnFg }}>
                  ⚠️ 你改了 Email。儲存後<b>原本的驗證會失效</b>，需要重新收信驗證一次。
                </div>
              ) : (
                <div style={{ fontSize: 11.5, lineHeight: 1.7, marginTop: 6, color: C.mute }}>
                  目前{emailVerifiedAt ? "已驗證 ✓" : "尚未驗證"}。改成別的信箱要重新驗證。
                </div>
              )}
            </div>
            <div style={{ marginTop: 10 }}><Lab>生日（當月發放抵用金 🎂・填寫後不可自行修改）</Lab><input type="date" value={birthday} disabled={birthdayLocked} onChange={(e) => setBirthday(e.target.value)} style={{ ...INP, opacity: birthdayLocked ? 0.6 : 1 }} /></div>
            <div style={{ fontSize: 12.5, fontWeight: 600, margin: "14px 0 6px" }}>緊急聯絡人</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="姓名" style={INP} />
              <input value={eRel} onChange={(e) => setERel(e.target.value)} placeholder="關係" style={INP} />
            </div>
            <input value={ePhone} onChange={(e) => setEPhone(formatPhoneTW(e.target.value))} inputMode="numeric" maxLength={11} placeholder="0912-345678" style={{ ...INP, marginTop: 8 }} />
          </BCard>
          <button onClick={saveInfo} disabled={saving} style={{ width: "100%", height: 46, background: C.accFg, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 600, marginTop: 14, opacity: saving ? 0.6 : 1 }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
          <button onClick={cancelEdit} disabled={saving} style={{ width: "100%", height: 42, background: "none", color: C.mute, border: `1px solid ${C.line}`, borderRadius: 12, fontSize: 14, marginTop: 8 }}>
            取消（不儲存變更）
          </button>
        </>
      )}
    </>
  );
  if (view === "certs") return frame(
    <>
      <SubHeader title="證照 / 潛伴" onBack={() => setView(null)} />
      <BCard title="我的證照">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div><Lab>證照等級</Lab><select value={cert} onChange={(e) => setCert(e.target.value as Cert | "")} style={SELP}><option value="">未填</option>{CERTS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><Lab>累計潛水支數</Lab><input value={logCount} onChange={(e) => setLogCount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...INP, textAlign: "center" }} /></div>
          {/* v983：慣用配重(kg)——下單自動帶入 */}
          <div><Lab>慣用配重 (kg)</Lab><input value={weightBelt} onChange={(e) => setWeightBelt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="例: 5" style={{ ...INP, textAlign: "center" }} /></div>
        </div>
      </BCard>
      <BCard title={`常用潛伴（${companions.length}）`} sub="下單時可一鍵帶入">
        {companions.map((c, i) => (
          <div key={c.id ?? i} style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>潛伴 #{i + 1}</span><button onClick={() => { if (window.confirm("確定刪除這位潛伴？")) setCompanions((a) => a.filter((_, j) => j !== i)); }} style={{ fontSize: 11, color: C.coral, background: "none", border: "none" }}>刪除</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input value={c.name} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="姓名 *" style={INP} />
              {/* v1006：潛伴暱稱 */}
              <input value={c.nickname ?? ""} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, nickname: e.target.value || null } : x))} placeholder="暱稱（好稱呼）" style={INP} />
              <input value={c.phone} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, phone: formatPhoneTW(e.target.value) } : x))} inputMode="numeric" maxLength={11} placeholder="手機" style={INP} />
              <select value={c.cert ?? ""} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, cert: (e.target.value || null) as Cert | null } : x))} style={SELP}><option value="">證照</option>{CERTS.map((cc) => <option key={cc} value={cc}>{cc}</option>)}</select>
              <input value={c.relationship} onChange={(e) => setCompanions((a) => a.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} placeholder="關係" style={INP} />
              {/* v983：潛伴配重(kg) */}
              <input value={c.weightBelt != null ? String(c.weightBelt) : ""} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setCompanions((a) => a.map((x, j) => j === i ? { ...x, weightBelt: v ? Number(v) : null } : x)); }} inputMode="numeric" placeholder="配重 kg" style={{ ...INP, textAlign: "center" }} />
            </div>
          </div>
        ))}
        <button onClick={() => setCompanions((a) => [...a, { name: "", phone: "", cert: null, certNumber: "", logCount: 0, relationship: "" }])} style={{ width: "100%", border: `1px dashed ${C.line}`, background: "none", color: C.accFg, borderRadius: 10, padding: "10px 0", fontSize: 13 }}>＋ 新增潛伴</button>
      </BCard>
      {saveBtn({ companions })}
    </>
  );
  // v1018：移除「通知偏好」——通知管道(LINE/Email/站內)一律開放，不再讓客戶關閉
  if (view === "credits") return frame(<CreditsView onBack={() => setView(null)} liff={liff} balance={me.creditBalance ?? 0} />);

  // ===== 主清單 =====
  const name = me.realName ?? me.displayName ?? "會員";
  // v729：身分徽章 + 後台連結 —— 多重身分取最高優先
  const myRoles = me.roles ?? [me.role ?? ""];
  const ROLE_LABEL: Record<string, string> = { it: "IT", boss: "老闆", admin: "管理", coach: "教練", assistant: "助教" };
  const primaryRole = ["it", "boss", "admin", "coach", "assistant"].find((r) => myRoles.includes(r));
  const roleLabel = primaryRole ? ROLE_LABEL[primaryRole] : null;
  const isAdminLevel = myRoles.some((r) => ["it", "boss"].includes(r)); // v853：後台工具僅老闆/IT
  // v842：LINE 身分換發後台 session 後，直接導向指定後台頁（免再進「後台首頁」下一層）
  const goAdmin = async (path: string) => {
    try {
      const r = await liff.fetchWithAuth<{ token: string; user: AdminWebUser }>(
        "/api/admin-web/liff-session",
        { method: "POST" },
      );
      setAdminToken(r.token);
      setAdminUser(r.user);
      window.location.href = path;
    } catch (e) {
      alert("進入後台失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  };
  // v842：老闆後台工具 — 每項一行直接進入（只有 admin 級看得到）
  const ADMIN_TOOLS: Array<{ emoji: string; label: string; path: string; badge?: number }> = [
    // v1030：最常用的兩項移到最上面
    { emoji: "📋", label: "Dump 潛水資訊", path: "/admin/m/dump" },
    { emoji: "🌊", label: "日潛場次", path: "/admin/m/trips" },
    { emoji: "↩️", label: "退款申請", path: "/liff/admin-go?to=/admin/m/bookings", badge: adminTodo?.refunds },
    { emoji: "🧾", label: "老闆結帳", path: "/admin/m/tonight", badge: adminTodo?.settle },
    { emoji: "📧", label: "客服信箱", path: "/admin/m/email", badge: adminTodo?.inbox },
    { emoji: "📝", label: "願望單", path: "/admin/m/dive-wishes", badge: adminTodo?.wishes },
    { emoji: "👥", label: "會員管理", path: "/admin/m/users" },
    { emoji: "⛴️", label: "潛水旅行", path: "/admin/m/tours" },
    { emoji: "⭐", label: "抵用金管理", path: "/admin/m/credits" },
  ];
  const stats: Array<[string, string]> = [
    [String(me.haiwangziLogCount ?? 0), "海王子潛次"], [String(me.creditBalance ?? 0), "抵用金"],
    [String(me.stats?.totalBookings ?? 0), "進行中"], [me.vipLevel ? `LV${me.vipLevel}` : "會員", "等級"],
  ];
  return frame(
    <>
      {/* v1006：頭區改一行 —— [LVn 等級名] [圖樣置中] [名字/暱稱 (角色)]；Email 不顯示 */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 2px 12px" }}>
        <div style={{ flex: 1, textAlign: "right", paddingRight: 12 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: C.accFg }}>
            {me.vipLevel >= 1 ? `LV${me.vipLevel} ${VIP_TIERS.find((t) => t.level === me.vipLevel)?.name ?? ""}`.trim() : "會員"}
          </span>
        </div>
        <div style={{ flex: "none" }}>
          {me.vipLevel >= 1 && me.vipLevel <= 5 ? (
            <div style={{ width: 56, height: 56 }}><VipTierIcon level={me.vipLevel} size={56} /></div>
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.accBg, color: C.accFg, display: "grid", placeItems: "center" }}><User size={26} /></div>
          )}
        </div>
        <div style={{ flex: 1, paddingLeft: 12, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" }}>
            {me.nickname?.trim() || name}
            {roleLabel && <span style={{ fontSize: 12, fontWeight: 700, color: C.accFg }}>（{roleLabel}）</span>}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", background: C.page, borderRadius: 12, padding: "12px 0", textAlign: "center", marginBottom: 6 }}>
        {stats.map(([a, b]) => <div key={b} style={{ flex: 1 }}><div style={{ fontSize: 18, fontWeight: 500 }}>{a}</div><div style={{ fontSize: 11, color: C.mute }}>{b}</div></div>)}
      </div>
      <Sect t="帳戶" />
      <LRow Icon={User} label="個人資訊" right={me.phone ?? ""} onClick={() => setView("info")} />
      <LRow Icon={School} label="證照 / 潛伴" right={me.cert ?? "未填"} onClick={() => setView("certs")} />
      <Sect t="訊息" />
      {/* v709：站內訊息已移到底部分頁；這裡第一層只留「聯絡客服」 */}
      <Link href="/liff/messages" style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, textDecoration: "none", color: C.ink }}>
        <MessageCircle size={19} color={C.mute} /><span style={{ flex: 1, fontSize: 14 }}>聯絡客服</span><ChevronRight size={16} color={C.mute} />
      </Link>
      <Sect t="紀錄" />
      <LRow Icon={SlidersHorizontal} label="抵用金明細" right={ntd(me.creditBalance ?? 0)} onClick={() => setView("credits")} />
      {isStaff && (<>
        <Sect t="管理" />
        {/* v1030：Dump / 日潛場次 等工具移到管理最上面（今明資訊接在後面） */}
        {isAdminLevel && ADMIN_TOOLS.map((it) => (
          // v842：老闆後台各工具一行直接進入（LINE 身分免帳密換 session）
          <button
            key={it.path}
            onClick={() => goAdmin(it.path)}
            style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", border: "none", background: "none", textAlign: "left", borderBottom: `0.5px solid ${C.line}`, color: C.ink, cursor: "pointer" }}
          >
            <span style={{ width: 19, textAlign: "center", fontSize: 17, flex: "none" }}>{it.emoji}</span>
            <span style={{ flex: 1, fontSize: 14 }}>{it.label}</span>
            {it.badge && it.badge > 0 ? (
              <span style={{ background: "#e5484d", color: "#fff", fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{it.badge}</span>
            ) : null}
            <ChevronRight size={16} color={C.mute} />
          </button>
        ))}
        <Link href="/liff/coach/today" style={{ display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 2px", borderBottom: `0.5px solid ${C.line}`, textDecoration: "none", color: C.ink }}>
          <LifeBuoy size={19} color={C.okFg} /><span style={{ flex: 1, fontSize: 14 }}>今明資訊</span>
          {adminTodo && adminTodo.attendance > 0 ? (
            <span style={{ background: "#e5484d", color: "#fff", fontSize: 11, fontWeight: 800, minWidth: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{adminTodo.attendance}</span>
          ) : null}
          <ChevronRight size={16} color={C.mute} />
        </Link>
      </>)}
      {/* v1020：依老闆指示移除「其他 → 登出」（LINE 內不需要登出） */}
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
