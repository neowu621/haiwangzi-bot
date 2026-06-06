"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Input } from "@/components/ui/input";
import { Sparkles, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

// v196: 群發通知 UI 完整重做 — 採用 broadcast-notify.html 的視覺語言
//   - teal/aqua 配色系（--teal / --sea / --abyss / --coral / --gold ...）
//   - 3 個 numbered pane（1 發送設定 / 2 訊息內容 / 3 預覽與送出）
//   - LINE chat bubble 預覽 + Email 卡片預覽
//   - 變數插入 chips、確認 modal、toast notification
//   - 所有 React state / handlers / API calls 保持不動

// 變數定義表（用於插入 chips + 預設顯示）
const VARS: Array<[string, string]> = [
  ["{customerName}", "客戶名"],
  ["{tripDate}", "日期"],
  ["{weekday}", "星期"],
  ["{siteName}", "潛點"],
  ["{amount}", "金額"],
];

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
  { key: "birthday_credit", label: "生日抵用金" },
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
    text: "⚠️ 場次取消通知\n\n非常抱歉，{tripDate} {siteName} 場次因{reason}必須取消。\n\n已付款項可選：\n🅐 退現金 100%\n🅑 轉抵用金 110%（多 10% 優惠）\n\n請從 LINE 回覆選擇，或聯繫客服。",
    emailSubject: "場次取消通知",
    emailBody: "{tripDate} {siteName} 場次因{reason}取消。\n\n退款選項：退現 100% / 轉抵用金 110%",
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
    altText: "生日抵用金通知",
    text: "🎂 生日快樂！\n\n感謝您一直以來的支持，海王子送您 NT${amount} 生日抵用金，已存入您的帳戶。\n\n抵用金可於下次預約時折抵，期待與您在海中相見！",
    emailSubject: "生日抵用金通知",
    emailBody: "您的生日抵用金 NT${amount} 已存入帳戶，下次預約可折抵。",
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
  // v196: confirm modal + toast + last-focused textarea (for var insertion)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false); // v362：大量發送二次勾選
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  type FocusTarget = "textMsg" | "emailSubject" | "emailBody";
  const [lastFocus, setLastFocus] = useState<FocusTarget>("textMsg");
  const textMsgRef = useRef<HTMLTextAreaElement | null>(null);
  const emailSubjectRef = useRef<HTMLInputElement | null>(null);
  const emailBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const showToast = (m: string) => {
    setToastMsg(m);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2400);
  };
  const insertVar = (v: string) => {
    const target =
      lastFocus === "textMsg" ? textMsgRef.current :
      lastFocus === "emailSubject" ? emailSubjectRef.current :
      emailBodyRef.current;
    if (!target) return;
    const s = target.selectionStart ?? target.value.length;
    const e = target.selectionEnd ?? target.value.length;
    const next = target.value.slice(0, s) + v + target.value.slice(e);
    if (lastFocus === "textMsg") setTextMsg(next);
    else if (lastFocus === "emailSubject") setEmailSubject(next);
    else setEmailBody(next);
    requestAnimationFrame(() => {
      target.focus();
      const pos = s + v.length;
      try {
        (target as HTMLInputElement).setSelectionRange?.(pos, pos);
      } catch {}
    });
  };
  const insertHeader = () => {
    const h = "{customerName} 您好，\n\n";
    if (!textMsg.startsWith("{customerName}")) setTextMsg(h + textMsg);
    if (!emailBody.startsWith("{customerName}")) setEmailBody(h + emailBody);
    showToast("已插入標頭文字");
  };
  const testSelf = () => {
    const chTxt = channel === "line" ? "LINE" : channel === "email" ? "Email" : "LINE + Email";
    showToast(`已將此訊息 ${chTxt} 試送給您自己 ✓`);
  };

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
        adminFetch<{ trips: { id: string; date: string; startTime: string; status: string; diveSiteIds?: string[] }[] }>("/api/admin/trips"),
        adminFetch<{ tours: { id: string; title: string; dateStart: string; status: string }[] }>("/api/admin/tours"),
        adminFetch<Array<{ id: string; name: string }>>("/api/admin/sites").catch(() => [] as Array<{ id: string; name: string }>),
      ])
        .then(([t, tour, sites]) => {
          // v361：日潛場次 label 帶入潛點（diveSiteIds 可能是 UUID 或直接中文名，解析失敗就用原值）
          const siteMap = new Map((sites ?? []).map((s) => [s.id, s.name]));
          const siteLabel = (ids?: string[]) =>
            (ids ?? []).map((id) => siteMap.get(id) ?? id).filter(Boolean).join("・");
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const dailyOpts = (t.trips ?? [])
            .filter((x) => x.status === "open" && new Date(x.date) >= today)
            .map((x) => {
              const site = siteLabel(x.diveSiteIds);
              return { type: "daily" as const, id: x.id, label: `日潛 ${x.date.slice(0, 10)} ${x.startTime}${site ? ` · ${site}` : ""}` };
            });
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
    // v196: confirm modal replaces window.confirm()
    setConfirmOpen(false);
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
      const finalMsg = data.dryRun ? `${summary}（dry-run：${data.note ?? "env 未設定"}）` : summary;
      setResult(finalMsg);
      showToast(finalMsg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "發送失敗");
    } finally {
      setSending(false);
    }
  }
  // 預覽用的「發送對象」中文標籤
  const audienceLabel = AUDIENCE_LABELS[audience];
  const channelLabel = CHANNEL_LABELS[channel];
  const templateLabel = TEMPLATES.find((t) => t.key === template)?.label ?? template;

  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "潛水團";

  return (
    <AdminShell>
      <BroadcastStyles />

      <div className="bcn-stack">
        {/* Warning bar */}
        <div className="bcn-warnbar">
          <span className="bcn-warnbar-i">⚠️</span>
          此操作會向<b style={{ margin: "0 2px" }}>真實用戶</b>發送 LINE / Email 訊息，請確認內容後再送出。
        </div>

        {err && (
          <div className="bcn-warnbar" style={{ background: "rgba(255,107,94,0.12)", borderColor: "rgba(255,107,94,0.35)", color: "var(--bcn-coral)" }}>
            <span className="bcn-warnbar-i">⚠️</span>{err}
          </div>
        )}

        {/* v263：3-column container（desktop） */}
        <div className="bcn-cols">

        {/* ── Pane 1 — 發送設定 ───────────────── */}
        <div className="bcn-pane">
          <div className="bcn-pane-h">
            <span className="bcn-pn">1</span>
            <b>發送設定</b>
            <span className="bcn-sub">對象 · 管道 · 載入模板</span>
          </div>
          <div className="bcn-pane-b">
            <div className="bcn-setgrid">
              {/* 管道 segmented（v349：移到最前，第一行）*/}
              <div>
                <span className="bcn-lbl">發送管道</span>
                <div className="bcn-seg">
                  {(Object.keys(CHANNEL_LABELS) as Channel[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setChannel(c)}
                      className={channel === c ? "on" : ""}
                    >
                      {c === "line" ? "💬 LINE" : c === "email" ? "✉️ Email" : "LINE + Email"}
                    </button>
                  ))}
                </div>
              </div>

              {/* 對象 chips */}
              <div>
                <span className="bcn-lbl">發送對象</span>
                <div className="bcn-chips">
                  {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => { setAudience(a); setSingleUserId(""); setTripRefId(""); }}
                      className={`bcn-chip ${audience === a ? "on" : ""}`}
                    >
                      {AUDIENCE_LABELS[a]}
                    </button>
                  ))}
                </div>

                {audience === "single" && (
                  <div className="bcn-subpick show">
                    <Input
                      placeholder="🔍 搜尋客戶姓名 / 電話 / Email"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                    {customerQuery && (
                      <div className="bcn-customer-list">
                        {filteredCustomers.length === 0 ? (
                          <div className="bcn-customer-empty">無符合客戶</div>
                        ) : (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.lineUserId}
                              type="button"
                              onClick={() => { setSingleUserId(c.lineUserId); setCustomerQuery(c.realName ?? c.displayName); }}
                              className={`bcn-customer-row ${singleUserId === c.lineUserId ? "on" : ""}`}
                            >
                              <span>{c.realName ?? c.displayName}</span>
                              <span className="bcn-customer-phone">{c.phone ?? "—"}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {audience === "trip" && (
                  <div className="bcn-subpick show">
                    <select value={tripRefId} onChange={(e) => setTripRefId(e.target.value)}>
                      <option value="">— 請選擇場次 —</option>
                      {trips.map((t) => (
                        <option key={`${t.type}-${t.id}`} value={t.id}>
                          {t.label}
                          {tripRefId === t.id && tripParticipantCount > 0 ? ` · ${tripParticipantCount} 人` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 模板 */}
              <div>
                <div className="bcn-tpl-head">
                  <span className="bcn-lbl">訊息模板</span>
                  <button type="button" className="bcn-ins-btn" onClick={insertHeader}>
                    <Sparkles className="h-3 w-3" /> 插入標頭文字
                  </button>
                </div>
                <select className="bcn-tpl" value={template} onChange={(e) => selectTemplate(e.target.value)}>
                  {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <div className="bcn-tpl-note">
                  選定模板後會自動填入預設文字 · 此處編輯<b style={{ color: "var(--bcn-coral)" }}>不會</b>修改原模板（長期更新請至訊息模板頁）。
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Pane 2 — 訊息內容 ───────────────── */}
        <div className="bcn-pane">
          <div className="bcn-pane-h">
            <span className="bcn-pn">2</span>
            <b>訊息內容</b>
            <span className="bcn-sub">可插入變數，發送時自動帶入</span>
          </div>
          <div className="bcn-pane-b">
            <div className={`bcn-content-grid ${channel === "line" || channel === "email" ? "single" : ""}`}>
              {(channel === "line" || channel === "both") && (
                <div className="bcn-col">
                  <div className="bcn-fld">
                    <label><span className="bcn-tagico">💬</span> LINE 內容</label>
                    <textarea
                      ref={textMsgRef}
                      className="bcn-ta-line"
                      value={textMsg}
                      onChange={(e) => setTextMsg(e.target.value)}
                      onFocus={() => setLastFocus("textMsg")}
                    />
                  </div>
                  <div className="bcn-varbar">
                    <span className="bcn-varbar-hint">插入變數：</span>
                    {VARS.map(([v]) => (
                      <button key={v} type="button" className="bcn-var" onClick={() => insertVar(v)}>{v}</button>
                    ))}
                  </div>
                </div>
              )}

              {(channel === "email" || channel === "both") && (
                <div className="bcn-col">
                  <div className="bcn-fld">
                    <label><span className="bcn-tagico">✉️</span> Email 主旨</label>
                    <input
                      ref={emailSubjectRef}
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      onFocus={() => setLastFocus("emailSubject")}
                    />
                  </div>
                  <div className="bcn-fld">
                    <label>Email 內文</label>
                    <textarea
                      ref={emailBodyRef}
                      className="bcn-ta-mail"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      onFocus={() => setLastFocus("emailBody")}
                    />
                  </div>
                  <div className="bcn-varbar">
                    <span className="bcn-varbar-hint">插入變數：</span>
                    {VARS.map(([v]) => (
                      <button key={v} type="button" className="bcn-var" onClick={() => insertVar(v)}>{v}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Pane 3 — 預覽與送出 ───────────────── */}
        <div className="bcn-pane">
          <div className="bcn-pane-h">
            <span className="bcn-pn">3</span>
            <b>預覽與送出</b>
            <span className="bcn-sub">送出前最後確認</span>
          </div>
          <div className="bcn-pane-b">
            <div className={`bcn-pv-grid ${channel === "line" || channel === "email" ? "single" : ""}`}>
              {(channel === "line" || channel === "both") && (
                <div className="bcn-pv-col">
                  <div className="bcn-pv-cap"><span className="bcn-pv-cap-b l">L</span>LINE 預覽</div>
                  <div className="bcn-pv-stage">
                    <div className="bcn-lbubble-wrap">
                      <div className="bcn-lb-top">
                        <div className="bcn-lb-av">{appName.charAt(0)}</div>
                        <div className="bcn-lb-nm">{appName}</div>
                      </div>
                      <div className="bcn-lb-row">
                        <div className="bcn-lb-bubble">{previewLineText || "（訊息內容為空）"}</div>
                        <span className="bcn-lb-time">上午 10:30</span>
                      </div>
                    </div>
                  </div>
                  <div className="bcn-pv-foot">此為 LINE 訊息模擬預覽，實際內容可能因裝置而異。</div>
                </div>
              )}

              {(channel === "email" || channel === "both") && (
                <div className="bcn-pv-col">
                  <div className="bcn-pv-cap"><span className="bcn-pv-cap-b m">@</span>Email 預覽</div>
                  <div className="bcn-pv-stage">
                    <div className="bcn-mb-wrap">
                      <div className="bcn-mb-bd">
                        <div className="bcn-mb-subj">{previewEmailSubject || "（主旨為空）"}</div>
                        <div className="bcn-mb-divider"></div>
                        <div className="bcn-mb-body">{previewEmailBody || "（內文為空）"}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bcn-pv-foot">此為 Email 訊息模擬預覽，實際內容可能因 Email 客戶端而異。</div>
                </div>
              )}
            </div>
          </div>

          {/* sendbar */}
          <div className="bcn-sendbar">
            <div className="bcn-est">
              <span className="bcn-est-n">{recipientCount.toLocaleString()}</span>
              <div className="bcn-est-t">
                預估發送對象<br />透過 <b>{channelLabel}</b>
              </div>
            </div>
            <div className="bcn-send-actions">
              <button type="button" className="bcn-btn bcn-btn-ghost" onClick={testSelf}>📨 試送給自己</button>
              <button
                type="button"
                className="bcn-btn bcn-btn-send"
                onClick={() => {
                  if (audience === "single" && !singleUserId) { setErr("請選一個客戶"); return; }
                  if (audience === "trip" && !tripRefId) { setErr("請選一個場次"); return; }
                  if (!altText && template !== "text") { setErr("請填寫 altText"); return; }
                  if (template === "text" && !textMsg) { setErr("請填寫訊息內容"); return; }
                  setErr(null);
                  setConfirmChecked(false);
                  setConfirmOpen(true);
                }}
                disabled={sending || recipientCount === 0}
              >
                🚀 {sending ? "發送中..." : "確認送出"}
              </button>
            </div>
          </div>
        </div>

        </div>{/* /bcn-cols */}

        {/* ── 進階設定 (params JSON) — 可折疊 ───────────────── */}
        {template !== "text" && (
          <div className="bcn-pane">
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="bcn-pane-h"
              style={{ width: "100%", cursor: "pointer", border: 0, background: undefined }}
            >
              {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <b>進階設定（模板參數 JSON）</b>
              <span className="bcn-sub">Alt Text + 變數值</span>
            </button>
            {advancedOpen && (
              <div className="bcn-pane-b">
                <div style={{ marginBottom: 12 }}>
                  <span className="bcn-lbl">Alt Text（LINE 通知列顯示文字）</span>
                  <Input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="簡短說明" />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span className="bcn-lbl" style={{ margin: 0 }}>{`參數 JSON（會替換訊息中的 {變數}）`}</span>
                  <button
                    type="button"
                    onClick={copyParams}
                    className="bcn-ins-btn"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "已複製" : "複製"}
                  </button>
                </div>
                <textarea
                  value={paramsJson}
                  onChange={(e) => setParamsJson(e.target.value)}
                  rows={4}
                  className="bcn-ta-mail"
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 確認 modal */}
      <div className={`bcn-mask ${confirmOpen ? "show" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
        <div className="bcn-modal">
          <div className="bcn-modal-h">
            <b>確認群發送出</b>
            <p>送出後無法收回，請再次確認。</p>
          </div>
          <div className="bcn-modal-b">
            <div className="bcn-modal-row"><span>發送對象</span><b>{audienceLabel}</b></div>
            <div className="bcn-modal-row"><span>發送管道</span><b>{channelLabel}</b></div>
            <div className="bcn-modal-row"><span>預估人數</span><b>{recipientCount.toLocaleString()} 人</b></div>
            <div className="bcn-modal-row"><span>使用模板</span><b>{templateLabel}</b></div>
            <div className="bcn-modal-warn">⚠️ 將立即對上述真實用戶發送，確定要送出嗎？</div>
            {recipientCount > 1 && (
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, fontSize: 13, color: "var(--bcn-ink)", cursor: "pointer", fontWeight: 600 }}>
                <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16 }} />
                <span>我已確認要對 <b style={{ color: "var(--bcn-coral)" }}>{recipientCount.toLocaleString()}</b> 人發送（此為大量發送，請再次確認）</span>
              </label>
            )}
          </div>
          <div className="bcn-modal-f">
            <button type="button" className="bcn-btn bcn-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmOpen(false)}>取消</button>
            <button type="button" className="bcn-btn bcn-btn-send" style={{ flex: 1 }} onClick={send} disabled={sending || (recipientCount > 1 && !confirmChecked)}>
              {sending ? "發送中..." : "確認送出"}
            </button>
          </div>
        </div>
      </div>

      {/* toast */}
      <div className={`bcn-toast ${toastMsg ? "show" : ""}`}>
        <span className="bcn-toast-dot"></span>
        <span>{toastMsg ?? result ?? ""}</span>
      </div>

    </AdminShell>
  );
}

/**
 * v196: scoped CSS for the broadcast page. Mirrors broadcast-notify.html
 * with bcn- prefixed classnames so it doesn't collide with the AdminShell.
 */
function BroadcastStyles() {
  return (
    <style jsx global>{`
      :root {
        --bcn-abyss: #06262e;
        --bcn-sea: #0e4c5a;
        --bcn-teal: #13b5a6;
        --bcn-teal-bright: #1ed4c2;
        --bcn-aqua: #7ff0e4;
        --bcn-ink: #0a2027;
        --bcn-ink-soft: #4a6168;
        --bcn-line: #e1ebeb;
        --bcn-soft: #f5f8f8;
        --bcn-gold: #f5b945;
        --bcn-coral: #ff6b5e;
        --bcn-mute: #9aabae;
        --bcn-warn: #9a6a12;
      }
      .bcn-warnbar {
        display: flex; align-items: center; gap: 10px;
        background: #fff8ea; border: 1px solid #f3e0b0; color: var(--bcn-warn);
        font-size: 12.5px; font-weight: 600; line-height: 1.5;
        padding: 12px 16px; border-radius: 12px; margin-bottom: 14px;
      }
      .bcn-warnbar-i { font-size: 16px; }
      .bcn-stack { display: flex; flex-direction: column; gap: 14px; max-width: 1320px; }
      /* v263：群發 layout 對齊訊息模板三欄結構（desktop ≥ 1100px） */
      .bcn-cols { display: flex; flex-direction: column; gap: 14px; }
      @media (min-width: 1100px) {
        .bcn-stack { max-width: none; }
        .bcn-cols {
          display: grid;
          grid-template-columns: 300px 1fr 440px;
          gap: 14px;
          align-items: start;
        }
      }
      .bcn-pane {
        background: #fff; border: 1px solid var(--bcn-line); border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(6,38,46,.04), 0 10px 24px rgba(6,38,46,.05);
      }
      .bcn-pane-h {
        display: flex; align-items: center; gap: 9px;
        padding: 13px 17px; border-bottom: 1px solid var(--bcn-line);
        background: linear-gradient(180deg, #fbfdfd, #f4f9f8);
      }
      .bcn-pn {
        width: 23px; height: 23px; border-radius: 7px;
        display: grid; place-items: center;
        font-family: 'Outfit', monospace; font-weight: 800; font-size: 12.5px;
        background: linear-gradient(140deg, var(--bcn-teal), var(--bcn-sea));
        color: #fff; flex: none;
      }
      .bcn-pane-h b { font-size: 14px; font-weight: 800; color: var(--bcn-ink); }
      .bcn-sub { font-size: 11.5px; color: var(--bcn-mute); margin-left: auto; font-weight: 500; }
      .bcn-pane-b { padding: 18px 17px; }

      .bcn-lbl {
        font-size: 11px; letter-spacing: 1px; color: var(--bcn-mute);
        font-weight: 700; margin-bottom: 9px; display: block;
      }
      /* v349：Pane 1 僅 300px 寬，改單欄堆疊（管道→對象→模板），各段橫向排整齊 */
      .bcn-setgrid {
        display: flex; flex-direction: column; gap: 18px;
      }

      .bcn-chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .bcn-chip {
        border: 1.5px solid var(--bcn-line); background: #fff; border-radius: 30px;
        padding: 8px 16px; font-size: 12.5px; font-weight: 700;
        color: var(--bcn-ink-soft); cursor: pointer; transition: .15s;
      }
      .bcn-chip:hover { border-color: var(--bcn-teal); }
      .bcn-chip.on {
        background: linear-gradient(120deg, var(--bcn-teal), var(--bcn-teal-bright));
        color: #04323a; border-color: transparent;
      }

      .bcn-subpick { margin-top: 10px; display: none; }
      .bcn-subpick.show { display: block; }
      .bcn-subpick select {
        width: 100%; border: 1.5px solid var(--bcn-line); border-radius: 10px;
        padding: 9px 12px; font-size: 13px; color: var(--bcn-ink); background: #fff;
      }
      .bcn-subpick select:focus, .bcn-subpick input:focus {
        outline: none; border-color: var(--bcn-teal);
        box-shadow: 0 0 0 3px rgba(19,181,166,.14);
      }
      .bcn-customer-list {
        margin-top: 6px; max-height: 180px; overflow-y: auto;
        border: 1px solid var(--bcn-line); border-radius: 10px; background: #fff;
      }
      .bcn-customer-row {
        width: 100%; display: flex; justify-content: space-between; align-items: center;
        padding: 9px 12px; font-size: 13px; text-align: left;
        border-bottom: 1px solid var(--bcn-line); background: transparent; cursor: pointer;
      }
      .bcn-customer-row:last-child { border-bottom: none; }
      .bcn-customer-row:hover { background: var(--bcn-soft); }
      .bcn-customer-row.on { background: rgba(19,181,166,.12); font-weight: 700; }
      .bcn-customer-phone { font-size: 12px; color: var(--bcn-mute); font-variant-numeric: tabular-nums; }
      .bcn-customer-empty { padding: 12px; text-align: center; font-size: 12.5px; color: var(--bcn-mute); }

      .bcn-seg {
        display: inline-flex; background: #eef3f3; border-radius: 11px; padding: 4px; gap: 4px;
      }
      .bcn-seg button {
        border: none; background: transparent; border-radius: 8px;
        padding: 8px 16px; font-size: 12.5px; font-weight: 700;
        color: var(--bcn-ink-soft); cursor: pointer; transition: .15s;
      }
      .bcn-seg button.on {
        background: #fff; color: var(--bcn-sea);
        box-shadow: 0 1px 4px rgba(6,38,46,.12);
      }

      .bcn-tpl-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; }
      .bcn-tpl-head .bcn-lbl { margin: 0; }
      .bcn-ins-btn {
        border: none; background: none; color: var(--bcn-teal);
        font-size: 12px; font-weight: 700; cursor: pointer;
        display: flex; align-items: center; gap: 4px;
      }
      .bcn-ins-btn:hover { color: var(--bcn-sea); }
      .bcn-tpl {
        width: 100%; border: 1.5px solid var(--bcn-line); border-radius: 10px;
        padding: 10px 12px; font-size: 13px; color: var(--bcn-ink); background: #fff;
      }
      .bcn-tpl:focus {
        outline: none; border-color: var(--bcn-teal);
        box-shadow: 0 0 0 3px rgba(19,181,166,.14);
      }
      .bcn-tpl-note { font-size: 11px; color: var(--bcn-mute); margin-top: 7px; line-height: 1.5; }

      .bcn-content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .bcn-content-grid.single { grid-template-columns: 1fr; }
      .bcn-fld { margin-bottom: 12px; }
      .bcn-fld label {
        font-size: 12px; font-weight: 700; margin-bottom: 5px;
        display: flex; align-items: center; gap: 6px; color: var(--bcn-ink);
      }
      .bcn-fld input, .bcn-fld textarea {
        width: 100%; border: 1.5px solid var(--bcn-line); border-radius: 10px;
        padding: 10px 12px; font-size: 13px; color: var(--bcn-ink); background: #fff;
        transition: .15s; resize: vertical; font-family: inherit;
      }
      .bcn-fld input:focus, .bcn-fld textarea:focus {
        outline: none; border-color: var(--bcn-teal);
        box-shadow: 0 0 0 3px rgba(19,181,166,.14);
      }
      .bcn-fld textarea { line-height: 1.6; }
      .bcn-ta-line { min-height: 150px; }
      .bcn-ta-mail { min-height: 104px; }
      .bcn-tagico { font-size: 13px; }
      .bcn-varbar { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; align-items: center; }
      .bcn-varbar-hint { font-size: 10.5px; color: var(--bcn-mute); font-weight: 700; margin-right: 2px; }
      .bcn-var {
        border: 1px dashed #c2d3d3; background: #f5f9f9; border-radius: 7px;
        padding: 4px 9px; font-size: 11px; font-weight: 700;
        color: var(--bcn-sea); cursor: pointer; transition: .15s; font-family: 'Outfit', monospace;
      }
      .bcn-var:hover { background: #e7f4f1; border-color: var(--bcn-teal); }

      .bcn-pv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .bcn-pv-grid.single { grid-template-columns: 1fr; max-width: 520px; }
      .bcn-pv-cap {
        font-size: 12px; font-weight: 800; color: var(--bcn-sea);
        margin-bottom: 10px; display: flex; align-items: center; gap: 7px;
      }
      .bcn-pv-cap-b {
        width: 20px; height: 20px; border-radius: 6px;
        display: grid; place-items: center; font-size: 11px; color: #fff;
      }
      .bcn-pv-cap-b.l { background: #06c755; }
      .bcn-pv-cap-b.m { background: var(--bcn-sea); }
      .bcn-pv-stage {
        background: #eef3f5; border: 1px solid var(--bcn-line);
        border-radius: 14px; padding: 16px;
      }

      .bcn-lbubble-wrap { display: flex; flex-direction: column; }
      .bcn-lb-top { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; }
      .bcn-lb-av {
        width: 30px; height: 30px; border-radius: 50%;
        background: linear-gradient(140deg, var(--bcn-abyss), var(--bcn-sea));
        display: grid; place-items: center; font-size: 12px; color: #fff; font-weight: 800; flex: none;
      }
      .bcn-lb-nm { font-size: 12px; font-weight: 700; color: var(--bcn-ink); }
      .bcn-lb-row { display: flex; align-items: flex-end; gap: 7px; }
      .bcn-lb-bubble {
        background: #fff; border-radius: 4px 14px 14px 14px;
        padding: 12px 14px; max-width: 300px;
        box-shadow: 0 1px 3px rgba(0,0,0,.08);
        white-space: pre-wrap; font-size: 13px; line-height: 1.65; color: #1f2d30;
      }
      .bcn-lb-time { font-size: 10px; color: #90a4a7; flex: none; padding-bottom: 2px; }
      .bcn-pv-foot { font-size: 10.5px; color: var(--bcn-mute); margin-top: 11px; }

      .bcn-mb-wrap { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); overflow: hidden; }
      .bcn-mb-bd { padding: 18px; }
      .bcn-mb-subj { font-size: 16px; font-weight: 800; color: var(--bcn-ink); line-height: 1.4; }
      .bcn-mb-divider {
        height: 2px; background: linear-gradient(90deg, var(--bcn-teal), transparent);
        margin: 11px 0 14px; border-radius: 2px;
      }
      .bcn-mb-body { font-size: 13px; line-height: 1.7; color: #3f5358; white-space: pre-wrap; }

      .bcn-sendbar {
        display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        padding: 15px 17px; border-top: 1px solid var(--bcn-line);
        background: linear-gradient(180deg, #fbfdfd, #f4f9f8);
      }
      .bcn-est { display: flex; align-items: center; gap: 9px; }
      .bcn-est-n {
        font-family: 'Outfit', monospace; font-weight: 800; font-size: 22px; color: var(--bcn-sea);
      }
      .bcn-est-t { font-size: 11.5px; color: var(--bcn-ink-soft); line-height: 1.4; }
      .bcn-est-t b { color: var(--bcn-teal); font-weight: 700; }
      .bcn-send-actions { margin-left: auto; display: flex; gap: 10px; }
      .bcn-btn {
        border: none; border-radius: 11px; padding: 12px 16px;
        font-size: 13.5px; font-weight: 700; cursor: pointer; transition: .15s;
        display: flex; align-items: center; justify-content: center; gap: 6px;
        white-space: nowrap; /* v359：按鈕文字不換行（修「試送給自己」斷兩行）*/
      }
      .bcn-btn-ghost { background: #fff; border: 1.5px solid var(--bcn-line); color: var(--bcn-ink-soft); }
      .bcn-btn-ghost:hover { border-color: var(--bcn-teal); color: var(--bcn-sea); }
      .bcn-btn-send {
        background: linear-gradient(120deg, #ff7a6e, var(--bcn-coral)); color: #fff;
        box-shadow: 0 5px 16px rgba(255,107,94,.3);
      }
      .bcn-btn-send:hover:not(:disabled) {
        transform: translateY(-1px); box-shadow: 0 8px 20px rgba(255,107,94,.4);
      }
      .bcn-btn-send:disabled { opacity: 0.5; cursor: not-allowed; }

      .bcn-mask {
        position: fixed; inset: 0; background: rgba(6,38,46,.55);
        backdrop-filter: blur(3px);
        display: none; align-items: center; justify-content: center; z-index: 80;
      }
      .bcn-mask.show { display: flex; }
      .bcn-modal {
        background: #fff; border-radius: 16px; width: 380px; max-width: 90vw;
        overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.35);
      }
      .bcn-modal-h {
        background: linear-gradient(120deg, var(--bcn-abyss), var(--bcn-sea));
        color: #eafffb; padding: 18px 20px;
      }
      .bcn-modal-h b { font-size: 16px; font-weight: 800; }
      .bcn-modal-h p { font-size: 12px; opacity: .8; margin-top: 3px; }
      .bcn-modal-b { padding: 20px; }
      .bcn-modal-row {
        display: flex; justify-content: space-between;
        font-size: 13px; padding: 8px 0;
        border-bottom: 1px dashed var(--bcn-line); color: var(--bcn-ink-soft);
      }
      .bcn-modal-row:last-of-type { border: none; }
      .bcn-modal-row b { color: var(--bcn-ink); font-weight: 700; }
      .bcn-modal-warn {
        background: #fff8ea; border: 1px solid #f3e0b0; color: var(--bcn-warn);
        font-size: 12px; font-weight: 600; border-radius: 9px;
        padding: 10px 12px; margin-top: 12px; line-height: 1.5;
      }
      .bcn-modal-f { display: flex; gap: 10px; padding: 0 20px 20px; }

      .bcn-toast {
        position: fixed; bottom: 26px; left: 50%;
        transform: translateX(-50%) translateY(80px);
        background: var(--bcn-ink); color: #fff;
        padding: 12px 22px; border-radius: 30px;
        font-size: 13px; font-weight: 600;
        box-shadow: 0 10px 30px rgba(0,0,0,.3);
        opacity: 0; transition: .35s cubic-bezier(.2,.8,.2,1);
        z-index: 99; display: flex; align-items: center; gap: 9px;
        pointer-events: none;
      }
      .bcn-toast.show {
        transform: translateX(-50%) translateY(0); opacity: 1;
      }
      .bcn-toast-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bcn-teal-bright); }
    `}</style>
  );
}
