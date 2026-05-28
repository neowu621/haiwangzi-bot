"use client";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, AlertTriangle, Sparkles, Eye, Users, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

type Audience = "all" | "customers" | "coaches" | "admins" | "single" | "trip";
type Channel = "line" | "email" | "both";

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "全部",
  customers: "客戶",
  coaches: "教練",
  admins: "管理員",
  single: "單一客戶",
  trip: "場次參加者",
};
const CHANNEL_LABELS: Record<Channel, string> = { line: "LINE", email: "Email", both: "LINE + Email" };

const TEMPLATES = [
  { key: "text", label: "純文字" },
  { key: "booking_confirm", label: "預約確認" },
  { key: "d1_reminder", label: "明日提醒" },
  { key: "deposit_notice", label: "訂金通知" },
  { key: "final_payment_notice", label: "尾款通知" },
  { key: "tour_guide", label: "行前說明" },
  { key: "weather_cancel", label: "天氣取消" },
  { key: "vip_upgrade", label: "VIP 升等" },
  { key: "birthday_credit", label: "生日禮金" },
];

// 罐頭訊息（每個模板的預設文字）
const TEMPLATE_DEFAULTS: Record<string, { altText: string; text: string; emailSubject: string; emailBody: string; params: string }> = {
  text: { altText: "", text: "", emailSubject: "", emailBody: "", params: "{}" },
  booking_confirm: {
    altText: "您的潛水預約已確認",
    text: "您的潛水預約已確認\n\n📅 場次：{tripDate}（{weekday}）\n📍 潛點：{siteName}\n💰 金額：NT${amount}\n\n感謝您的支持，期待當天見面 🤿",
    emailSubject: "您的潛水預約已確認",
    emailBody: "場次：{tripDate}（{weekday}）\n潛點：{siteName}\n金額：NT${amount}\n\n感謝您的支持，期待當天見面 🤿",
    params: '{"tripDate":"06/01","weekday":"週日","siteName":"龍洞","amount":"1200"}',
  },
  d1_reminder: {
    altText: "明日潛水提醒",
    text: "🌊 明日潛水提醒\n\n📅 日期：{tripDate}\n⏰ 集合時間：{startTime}\n📍 集合地點：{meetingPoint}\n\n請攜帶 C 卡、身分證、防曬乳。如遇天氣異常將另行通知，明天見！",
    emailSubject: "明日潛水提醒",
    emailBody: "日期：{tripDate}\n集合時間：{startTime}\n集合地點：{meetingPoint}\n\n請攜帶 C 卡、身分證、防曬乳。明天見！",
    params: '{"tripDate":"06/01","startTime":"08:00","meetingPoint":"潮境公園停車場"}',
  },
  deposit_notice: {
    altText: "訂金繳費通知",
    text: "💳 訂金繳費通知\n\n您的訂單 {code} 訂金 NT${deposit} 請於 {deadline} 前完成匯款。\n\n銀行：{bankName}\n帳號：{bankAccount}\n戶名：{bankHolder}\n\n匯款後請上傳轉帳截圖，我們將盡快確認入帳。",
    emailSubject: "訂金繳費通知",
    emailBody: "訂單編號：{code}\n訂金金額：NT${deposit}\n繳費期限：{deadline}\n\n銀行：{bankName}\n帳號：{bankAccount}\n戶名：{bankHolder}",
    params: '{"code":"O20260528-01","deposit":"500","deadline":"2026-05-31","bankName":"中信 822","bankAccount":"484540139251","bankHolder":"汪教練"}',
  },
  final_payment_notice: {
    altText: "尾款繳費通知",
    text: "💳 尾款繳費提醒\n\n您的訂單 {code} 尾款 NT${balance} 請於出發前 30 天（{deadline}）繳清。\n\n感謝！",
    emailSubject: "尾款繳費提醒",
    emailBody: "訂單編號：{code}\n尾款餘額：NT${balance}\n繳費期限：{deadline}",
    params: '{"code":"O20260528-01","balance":"4500","deadline":"2026-06-15"}',
  },
  tour_guide: {
    altText: "行前說明",
    text: "📖 行前說明\n\n出發前請確認：\n✓ 護照效期 6 個月以上\n✓ C 卡（OW 以上）\n✓ Log Book（如有）\n✓ 個人裝備\n\n出發時間：{departTime}\n集合地點：{meetingPoint}\n領隊聯絡：{guidePhone}",
    emailSubject: "行前說明",
    emailBody: "出發時間：{departTime}\n集合地點：{meetingPoint}\n領隊聯絡：{guidePhone}\n\n請確認：護照、C 卡、Log Book、個人裝備",
    params: '{"departTime":"2026-06-01 06:00","meetingPoint":"桃園機場 T2","guidePhone":"0912-345-678"}',
  },
  weather_cancel: {
    altText: "場次因天氣取消",
    text: "⚠️ 場次取消通知\n\n非常抱歉，{tripDate} {siteName} 場次因{reason}必須取消。\n\n已付款項可選：\n🅐 退現金 100%\n🅑 轉禮金 110%（多 10% 優惠）\n\n請從 LINE 回覆選擇，或聯繫客服。",
    emailSubject: "場次取消通知",
    emailBody: "{tripDate} {siteName} 場次因{reason}取消。\n\n退款選項：退現 100% / 轉禮金 110%",
    params: '{"tripDate":"06/01","siteName":"龍洞","reason":"風速超過 10m/s"}',
  },
  vip_upgrade: {
    altText: "VIP 升等通知",
    text: "🎉 恭喜升等！\n\n您已晉升為 LV{newLevel} {tierName} 會員！\n\n享有福利：\n{benefits}\n\n感謝您一直以來的支持。",
    emailSubject: "VIP 升等通知",
    emailBody: "您已晉升為 LV{newLevel} {tierName}！\n\n福利：{benefits}",
    params: '{"newLevel":"2","tierName":"龍蝦","benefits":"生日當月 9 折"}',
  },
  birthday_credit: {
    altText: "生日禮金通知",
    text: "🎂 生日快樂！\n\n感謝您一直以來的支持，海王子送您 NT${amount} 生日禮金，已存入您的帳戶。\n\n禮金可於下次預約時折抵，期待與您在海中相見！",
    emailSubject: "生日禮金通知",
    emailBody: "您的生日禮金 NT${amount} 已存入帳戶，下次預約可折抵。",
    params: '{"amount":"100"}',
  },
};

interface CustomerOption {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  role?: string;
  effectiveRoles?: string[];
}

interface TripOption {
  type: "daily" | "tour";
  id: string;
  label: string;
}

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

// 把 {key} 變數替換成 params 對應值
function substituteParams(text: string, params: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => key in params ? String(params[key]) : `{${key}}`);
}

export default function BroadcastPage() {
  const [audience, setAudience] = useState<Audience>("customers");
  const [channel, setChannel] = useState<Channel>("line");
  const [template, setTemplate] = useState("booking_confirm");
  const [altText, setAltText] = useState(TEMPLATE_DEFAULTS.booking_confirm.altText);
  const [textMsg, setTextMsg] = useState(TEMPLATE_DEFAULTS.booking_confirm.text);
  const [paramsJson, setParamsJson] = useState(TEMPLATE_DEFAULTS.booking_confirm.params);
  const [emailSubject, setEmailSubject] = useState(TEMPLATE_DEFAULTS.booking_confirm.emailSubject);
  const [emailBody, setEmailBody] = useState(TEMPLATE_DEFAULTS.booking_confirm.emailBody);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // 所有 users（mount 時載入一次，用來計算各 audience 數量 + 單一客戶下拉）
  const [allUsers, setAllUsers] = useState<CustomerOption[]>([]);

  // single 用
  const [singleUserId, setSingleUserId] = useState<string>("");
  const [customerQuery, setCustomerQuery] = useState("");

  // trip 用
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripRefId, setTripRefId] = useState<string>("");
  const [tripParticipantCount, setTripParticipantCount] = useState(0);

  useEffect(() => {
    adminFetch<{ users: CustomerOption[] }>("/api/admin/users")
      .then((r) => setAllUsers(r.users ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (audience === "trip" && trips.length === 0) {
      Promise.all([
        adminFetch<{ trips: { id: string; date: string; startTime: string; status: string }[] }>("/api/admin/trips"),
        adminFetch<{ tours: { id: string; title: string; dateStart: string; status: string }[] }>("/api/admin/tours"),
      ])
        .then(([t, tour]) => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const dailyOpts = (t.trips ?? [])
            .filter((x) => x.status === "open" && new Date(x.date) >= today)
            .map((x) => ({ type: "daily" as const, id: x.id, label: `日潛 ${x.date.slice(0, 10)} ${x.startTime}` }));
          const tourOpts = (tour.tours ?? [])
            .filter((x) => x.status === "open" && new Date(x.dateStart) >= today)
            .map((x) => ({ type: "tour" as const, id: x.id, label: `潛水團 ${x.title}` }));
          setTrips([...dailyOpts, ...tourOpts]);
        })
        .catch(() => {});
    }
  }, [audience, trips.length]);

  // 選定 trip 時抓參加者數量
  useEffect(() => {
    if (audience === "trip" && tripRefId) {
      const sel = trips.find((t) => t.id === tripRefId);
      if (sel) {
        adminFetch<{ bookings: { user: { lineUserId: string } }[] }>(`/api/admin/bookings?refId=${tripRefId}`)
          .then((r) => {
            const ids = new Set((r.bookings ?? []).map((b) => b.user.lineUserId));
            setTripParticipantCount(ids.size);
          })
          .catch(() => setTripParticipantCount(0));
      }
    } else {
      setTripParticipantCount(0);
    }
  }, [audience, tripRefId, trips]);

  // 預估收件人數
  const recipientCount = useMemo(() => {
    if (audience === "all") return allUsers.length;
    if (audience === "customers") return allUsers.filter((u) => u.role === "customer").length;
    if (audience === "coaches") return allUsers.filter((u) => u.role === "coach" || u.effectiveRoles?.includes("coach")).length;
    if (audience === "admins") return allUsers.filter((u) => ["admin", "boss"].includes(u.role ?? "") || u.effectiveRoles?.some((r) => r === "admin" || r === "boss")).length;
    if (audience === "single") return singleUserId ? 1 : 0;
    if (audience === "trip") return tripParticipantCount;
    return 0;
  }, [audience, allUsers, singleUserId, tripParticipantCount]);

  // 選 template 自動填預設
  function selectTemplate(key: string) {
    setTemplate(key);
    const d = TEMPLATE_DEFAULTS[key];
    if (d) {
      setAltText(d.altText);
      setTextMsg(d.text);
      setEmailSubject(d.emailSubject);
      setEmailBody(d.emailBody);
      setParamsJson(d.params);
    }
  }
  function fillDefaults() {
    selectTemplate(template);
  }

  // 解析 params (失敗時用空物件)
  const parsedParams = useMemo<Record<string, unknown>>(() => {
    try { return JSON.parse(paramsJson); } catch { return {}; }
  }, [paramsJson]);

  // 替換後的預覽內容
  const previewLineText = useMemo(() => substituteParams(textMsg, parsedParams), [textMsg, parsedParams]);
  const previewEmailSubject = useMemo(() => substituteParams(emailSubject || altText || textMsg.split("\n")[0], parsedParams), [emailSubject, altText, textMsg, parsedParams]);
  const previewEmailBody = useMemo(() => substituteParams(emailBody || textMsg, parsedParams), [emailBody, textMsg, parsedParams]);

  async function copyParams() {
    try {
      await navigator.clipboard.writeText(paramsJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const filteredCustomers = useMemo(() => {
    if (!customerQuery) return allUsers.slice(0, 50);
    const q = customerQuery.toLowerCase();
    return allUsers.filter((c) =>
      (c.realName ?? "").toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q),
    ).slice(0, 50);
  }, [allUsers, customerQuery]);

  async function send() {
    if (audience === "single" && !singleUserId) { setErr("請選一個客戶"); return; }
    if (audience === "trip" && !tripRefId) { setErr("請選一個場次"); return; }
    if (!altText && template !== "text") { setErr("請填寫 altText"); return; }
    if (template === "text" && !textMsg) { setErr("請填寫訊息內容"); return; }
    if (!confirm(`確定發送給 ${recipientCount} 位收件人？`)) return;
    setSending(true); setErr(null); setResult(null);
    try {
      let params: Record<string, unknown> = {};
      try { params = JSON.parse(paramsJson); } catch { setErr("params JSON 格式錯誤"); setSending(false); return; }
      const body: Record<string, unknown> = { audience, channel, template, altText: altText || textMsg, params };
      if (template === "text") body.text = textMsg;
      if (channel === "email" || channel === "both") {
        body.emailSubject = emailSubject;
        body.emailBody = emailBody;
      }
      if (audience === "single") body.singleUserId = singleUserId;
      if (audience === "trip") {
        const sel = trips.find((t) => t.id === tripRefId);
        if (sel) { body.refType = sel.type; body.refId = sel.id; }
      }
      const data = await adminFetch<{ ok: boolean; delivered?: number; emailed?: number; dryRun?: boolean; note?: string }>("/api/admin/broadcast", { method: "POST", body: JSON.stringify(body) });
      const parts: string[] = [];
      if ((data.delivered ?? 0) > 0) parts.push(`LINE ${data.delivered} 筆`);
      if ((data.emailed ?? 0) > 0) parts.push(`Email ${data.emailed} 筆`);
      const summary = parts.length > 0 ? parts.join("、") + " 已發送" : "發送完成（0 筆）";
      setResult(data.dryRun ? `${summary}（dry-run：${data.note ?? "env 未設定"}）` : summary);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setSending(false);
    }
  }

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "潛水團";

  return (
    <AdminShell>
      <div className="pb-24">
        {/* Page header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[var(--foreground)]">群發通知</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">向會員發送 LINE / Email 通知</p>
          </div>
          <div className="rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(255,200,100,0.12)", color: "#b07c00", border: "1px solid rgba(255,200,100,0.4)" }}>
            <AlertTriangle className="mr-1.5 inline h-4 w-4" />
            此操作會向真實用戶發送 LINE / Email 訊息，請確認內容後再送出。
          </div>
        </div>

        {err && <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
        {result && <div className="mb-3 rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#0a7c70", border: "1px solid rgba(99,235,164,0.4)" }}>✓ {result}</div>}

        {/* ── Section 1: 發送設定 ───────────────── */}
        <div className="mb-4 rounded-xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">發送設定</h2>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* 發送對象 */}
            <div>
              <Label className="mb-2 block text-sm font-medium">發送對象</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => { setAudience(a); setSingleUserId(""); setTripRefId(""); }}
                    className="rounded-full px-2 py-1.5 text-xs transition-colors"
                    style={audience === a
                      ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                      : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                  >
                    {AUDIENCE_LABELS[a]}
                  </button>
                ))}
              </div>
            </div>
            {/* 發送管道 */}
            <div>
              <Label className="mb-2 block text-sm font-medium">發送管道</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setChannel(c)}
                    className="rounded-full px-3 py-1.5 text-xs transition-colors"
                    style={channel === c
                      ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                      : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                  >
                    {CHANNEL_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>
            {/* 訊息模板 */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-medium">訊息模板</Label>
                <button onClick={fillDefaults}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors hover:bg-[var(--color-phosphor)]/10"
                  style={{ color: "var(--color-phosphor)" }}
                  title="重置為預設罐頭文字">
                  <Sparkles className="h-3 w-3" />
                  插入標頭文字
                </button>
              </div>
              <select value={template} onChange={(e) => selectTemplate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                選定模板後會自動填入預設標頭文字。<br />可直接編輯或點「插入標頭文字」重置。
              </p>
            </div>
          </div>

          {/* 單一客戶選擇器 */}
          {audience === "single" && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">搜尋客戶（姓名 / 電話）</Label>
              <Input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="輸入關鍵字..." className="mb-2" />
              <div className="max-h-40 overflow-y-auto rounded-md border bg-white" style={{ borderColor: "var(--border)" }}>
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[var(--muted-foreground)]">無符合客戶</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button key={c.lineUserId} onClick={() => setSingleUserId(c.lineUserId)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--muted)] border-b last:border-b-0"
                      style={{
                        borderColor: "var(--border)",
                        background: singleUserId === c.lineUserId ? "rgba(99,235,164,0.15)" : "transparent",
                        fontWeight: singleUserId === c.lineUserId ? 600 : 400,
                      }}>
                      <span>{c.realName ?? c.displayName}</span>
                      <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{c.phone ?? "—"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 場次選擇器 */}
          {audience === "trip" && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)" }}>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">選擇場次（只列出未結束的）</Label>
              <select value={tripRefId} onChange={(e) => setTripRefId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" style={{ borderColor: "var(--border)", background: "white" }}>
                <option value="">— 請選擇 —</option>
                {trips.map((t) => <option key={`${t.type}-${t.id}`} value={t.id}>{t.label}</option>)}
              </select>
              {trips.length === 0 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">目前沒有未結束的場次</p>}
              {tripRefId && <p className="mt-2 text-xs text-[var(--color-phosphor)]">✓ 將發送給 {tripParticipantCount} 位參加者</p>}
            </div>
          )}
        </div>

        {/* ── Section 2: 訊息內容 ───────────────── */}
        <div className="mb-4 rounded-xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
          <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">訊息內容</h2>

          {/* 文字編輯區（純文字模式才顯示，否則用模板） */}
          {template === "text" && (
            <div className="mb-4">
              <Label className="mb-1.5 block text-sm">訊息內容</Label>
              <textarea value={textMsg} onChange={(e) => setTextMsg(e.target.value)} rows={4}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
                placeholder="輸入純文字訊息內容..." />
            </div>
          )}
          {template !== "text" && (
            <div className="mb-4 grid gap-3 lg:grid-cols-2">
              <div>
                <Label className="mb-1.5 block text-sm">LINE 內容</Label>
                <textarea value={textMsg} onChange={(e) => setTextMsg(e.target.value)} rows={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none font-mono"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }} />
              </div>
              <div>
                <Label className="mb-1.5 block text-sm">Email 主旨</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="mb-2" />
                <Label className="mb-1.5 block text-sm">Email 內文</Label>
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none font-mono"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }} />
              </div>
            </div>
          )}

          {/* 預覽區 */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* LINE 預覽 */}
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "#f3f4f6" }}>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#06C755] text-white text-[10px] font-bold">L</span>
                LINE 預覽
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-xs font-bold">
                    {appName.charAt(0)}
                  </div>
                  <span className="text-xs font-semibold text-[var(--foreground)]">{appName}</span>
                </div>
                <div className="flex items-end gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-3 py-2 text-sm text-gray-900 whitespace-pre-wrap break-words">
                    {previewLineText || <span className="text-gray-400">（訊息內容為空）</span>}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">上午 10:30</span>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">此為 LINE 訊息模擬預覽，實際內容可能因裝置而異。</p>
            </div>

            {/* Email 預覽 */}
            <div className="rounded-lg border p-4" style={{ borderColor: "var(--border)", background: "#f3f4f6" }}>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">@</span>
                Email 預覽
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="mb-3 border-b-2 pb-2" style={{ borderColor: "var(--color-phosphor)" }}>
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {previewEmailSubject || <span className="text-gray-400">（主旨為空）</span>}
                  </h3>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {previewEmailBody || <span className="text-gray-400">（內文為空）</span>}
                </div>
              </div>
              <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">此為 Email 訊息模擬預覽，實際內容可能因 Email 客戶端而異。</p>
            </div>
          </div>
        </div>

        {/* ── Section 3: 進階設定 ───────────────── */}
        {template !== "text" && (
          <div className="mb-4 rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setAdvancedOpen(!advancedOpen)}
              className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/30 rounded-xl">
              <span className="flex items-center gap-2">
                {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                進階設定（模板參數 JSON）
              </span>
            </button>
            {advancedOpen && (
              <div className="border-t px-5 py-4" style={{ borderColor: "var(--border)" }}>
                <div className="mb-2">
                  <Label className="mb-1.5 block text-xs text-[var(--muted-foreground)]">
                    Alt Text（LINE 通知列顯示文字）
                  </Label>
                  <Input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="簡短說明" />
                </div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs text-[var(--muted-foreground)]">參數 JSON（會替換訊息中的 {`{變數}`}）</Label>
                  <button onClick={copyParams}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] hover:bg-[var(--muted)]"
                    style={{ borderColor: "var(--border)" }}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "已複製" : "複製"}
                  </button>
                </div>
                <textarea value={paramsJson} onChange={(e) => setParamsJson(e.target.value)} rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-xs font-mono resize-none"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sticky Footer ───────────────── */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[var(--admin-sidebar-w,16rem)] border-t bg-white px-6 py-3 shadow-lg z-10"
        style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--muted)" }}>
              <Users className="h-5 w-5 text-[var(--muted-foreground)]" />
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">預估發送對象</div>
              <div className="text-base font-bold text-[var(--foreground)]">
                {recipientCount} 位 {audience === "coaches" ? "教練" : audience === "admins" ? "管理員" : "客戶"}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              <Eye className="mr-1.5 h-4 w-4" />
              預覽全部
            </Button>
            <Button style={primaryBtn} onClick={send} disabled={sending || recipientCount === 0}>
              <Send className="mr-1.5 h-4 w-4" />
              {sending ? "發送中..." : "確認發送"}
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-right text-[10px] text-[var(--muted-foreground)]">
          送出後將無法取消，請再次確認內容正確
        </p>
      </div>
    </AdminShell>
  );
}
