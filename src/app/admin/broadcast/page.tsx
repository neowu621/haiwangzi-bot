"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, AlertTriangle, Sparkles } from "lucide-react";

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

// 罐頭訊息（每個模板的預設文字，方便使用者參考並編輯）
const TEMPLATE_DEFAULTS: Record<string, { altText: string; text: string; emailSubject: string; emailBody: string; params: string }> = {
  text: {
    altText: "",
    text: "",
    emailSubject: "",
    emailBody: "",
    params: "{}",
  },
  booking_confirm: {
    altText: "您的潛水預約已確認",
    text: "您好，您的潛水預約已確認！\n\n📅 場次：{tripDate} {weekday}\n📍 潛點：{siteName}\n💰 金額：NT$ {amount}\n\n感謝您的支持，期待當天見面 🤿",
    emailSubject: "[海王子] 預約確認通知",
    emailBody: "您的潛水預約已確認，當天請準時抵達集合地點。",
    params: '{"tripDate":"2026-06-01","weekday":"週日","siteName":"龍洞","amount":"1200"}',
  },
  d1_reminder: {
    altText: "明日潛水提醒",
    text: "🌊 明日潛水提醒\n\n📅 日期：{tripDate}\n⏰ 集合時間：{startTime}\n📍 集合地點：{meetingPoint}\n\n請攜帶 C 卡、身分證、防曬乳。如遇天氣異常將另行通知，明天見！",
    emailSubject: "[海王子] 明日潛水提醒",
    emailBody: "明天就是您預約的潛水日，請務必準時到達集合地點。",
    params: '{"tripDate":"2026-06-01","startTime":"08:00","meetingPoint":"潮境公園停車場"}',
  },
  deposit_notice: {
    altText: "訂金繳費通知",
    text: "💳 訂金繳費通知\n\n您的訂單 {code} 訂金 NT$ {deposit} 請於 {deadline} 前完成匯款。\n\n銀行：{bankName}\n帳號：{bankAccount}\n戶名：{bankHolder}\n\n匯款後請上傳轉帳截圖，我們將盡快確認入帳。",
    emailSubject: "[海王子] 訂金繳費通知",
    emailBody: "請於指定日期前完成訂金匯款，並上傳轉帳憑證。",
    params: '{"code":"O20260528-01","deposit":"500","deadline":"2026-05-31"}',
  },
  final_payment_notice: {
    altText: "尾款繳費通知",
    text: "💳 尾款繳費提醒\n\n您的訂單 {code} 尾款 NT$ {balance} 請於出發前 30 天（{deadline}）繳清。\n\n感謝！",
    emailSubject: "[海王子] 尾款繳費提醒",
    emailBody: "出發前請完成尾款繳交。",
    params: '{"code":"O20260528-01","balance":"4500","deadline":"2026-06-15"}',
  },
  tour_guide: {
    altText: "行前說明",
    text: "📖 行前說明\n\n出發前請確認：\n✓ 護照效期 6 個月以上\n✓ C 卡（OW 以上）\n✓ Log Book（如有）\n✓ 個人裝備\n\n出發時間：{departTime}\n集合地點：{meetingPoint}\n領隊聯絡：{guidePhone}\n\n如有問題請隨時聯繫我們！",
    emailSubject: "[海王子] 行前說明",
    emailBody: "請查收行程詳細說明。",
    params: '{"departTime":"2026-06-01 06:00","meetingPoint":"桃園機場第二航廈","guidePhone":"0912-345-678"}',
  },
  weather_cancel: {
    altText: "場次因天氣取消",
    text: "⚠️ 場次取消通知\n\n非常抱歉，{tripDate} {siteName} 場次因{reason}必須取消。\n\n已付款項將依您選擇的方式處理：\n🅐 退現金 100%\n🅑 轉禮金 110%（多 10% 優惠，下次預約可折抵）\n\n請從 LINE 內回覆選擇，或聯繫客服。",
    emailSubject: "[海王子] 場次取消通知",
    emailBody: "因天氣關係場次取消，請至 LINE 選擇退款方式。",
    params: '{"tripDate":"2026-06-01","siteName":"龍洞","reason":"風速超過 10m/s"}',
  },
  vip_upgrade: {
    altText: "VIP 升等通知",
    text: "🎉 恭喜升等！\n\n您已晉升為 LV{newLevel} {tierName} 會員！\n\n享有福利：\n{benefits}\n\n感謝您一直以來的支持，期待與您一起繼續探索海洋。",
    emailSubject: "[海王子] VIP 升等通知",
    emailBody: "恭喜您晉升至新的 VIP 等級！",
    params: '{"newLevel":"2","tierName":"龍蝦","benefits":"• 生日當月一般潛水行程 9 折"}',
  },
  birthday_credit: {
    altText: "生日禮金通知",
    text: "🎂 生日快樂！\n\n感謝您一直以來的支持，海王子送您 NT$ {amount} 生日禮金，已存入您的帳戶。\n\n禮金可於下次預約時折抵，期待與您在海中相見！",
    emailSubject: "[海王子] 生日禮金通知",
    emailBody: "您的生日禮金已存入帳戶，下次預約可折抵。",
    params: '{"amount":"100"}',
  },
};

interface CustomerOption {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
}

interface TripOption {
  type: "daily" | "tour";
  id: string;
  label: string;
  participantCount: number;
}

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

export default function BroadcastPage() {
  const [audience, setAudience] = useState<Audience>("customers");
  const [channel, setChannel] = useState<Channel>("line");
  const [template, setTemplate] = useState("text");
  const [altText, setAltText] = useState("");
  const [textMsg, setTextMsg] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // single 用
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [singleUserId, setSingleUserId] = useState<string>("");
  const [customerQuery, setCustomerQuery] = useState("");

  // trip 用
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripRefId, setTripRefId] = useState<string>("");

  // Load customers & active trips when audience is single/trip
  useEffect(() => {
    if (audience === "single" && customers.length === 0) {
      adminFetch<{ users: (CustomerOption & { role: string })[] }>("/api/admin/users")
        .then((r) => setCustomers(r.users ?? []))
        .catch((e) => setErr("載入會員失敗：" + (e instanceof Error ? e.message : String(e))));
    }
    if (audience === "trip" && trips.length === 0) {
      Promise.all([
        adminFetch<{ trips: { id: string; date: string; startTime: string; diveSiteIds: string[]; status: string }[] }>("/api/admin/trips"),
        adminFetch<{ tours: { id: string; title: string; dateStart: string; status: string }[] }>("/api/admin/tours"),
      ])
        .then(([t, tour]) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dailyOpts = (t.trips ?? [])
            .filter((x) => x.status === "open" && new Date(x.date) >= today)
            .map((x) => ({ type: "daily" as const, id: x.id, label: `日潛 ${x.date.slice(0, 10)} ${x.startTime}`, participantCount: 0 }));
          const tourOpts = (tour.tours ?? [])
            .filter((x) => x.status === "open" && new Date(x.dateStart) >= today)
            .map((x) => ({ type: "tour" as const, id: x.id, label: `潛水團 ${x.title} (${x.dateStart.slice(0, 10)})`, participantCount: 0 }));
          setTrips([...dailyOpts, ...tourOpts]);
        })
        .catch((e) => setErr("載入場次失敗：" + (e instanceof Error ? e.message : String(e))));
    }
  }, [audience, customers.length, trips.length]);

  // 選 template 時自動填預設文字
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
    const d = TEMPLATE_DEFAULTS[template];
    if (!d) return;
    setAltText(d.altText);
    setTextMsg(d.text);
    setEmailSubject(d.emailSubject);
    setEmailBody(d.emailBody);
    setParamsJson(d.params);
  }

  const filteredCustomers = customers.filter((c) => {
    if (!customerQuery) return true;
    const q = customerQuery.toLowerCase();
    return (
      (c.realName ?? "").toLowerCase().includes(q) ||
      c.displayName.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    );
  }).slice(0, 50);

  async function send() {
    if (audience === "single" && !singleUserId) { setErr("請選一個客戶"); return; }
    if (audience === "trip" && !tripRefId) { setErr("請選一個場次"); return; }
    if (!altText && template !== "text") { setErr("請填寫 altText"); return; }
    if (template === "text" && !textMsg) { setErr("請填寫訊息內容"); return; }
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
        if (sel) {
          body.refType = sel.type;
          body.refId = sel.id;
        }
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

  return (
    <AdminShell>
      <div className="mx-auto max-w-2xl space-y-5">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
        {result && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {result}</div>}

        <div className="rounded-lg p-4 text-sm" style={{ background: "rgba(255,200,100,0.1)", border: "1px solid rgba(255,200,100,0.25)", color: "#b07c00" }}>
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          此操作會向真實用戶發送 LINE / Email 訊息，請確認內容後再送出。
        </div>

        <div className="rounded-xl border p-5 space-y-4 bg-white" style={{ borderColor: "var(--border)" }}>
          {/* Audience */}
          <div>
            <Label className="mb-2 block text-sm text-[var(--foreground)]">發送對象</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AUDIENCE_LABELS) as Audience[]).map(a => (
                <button key={a} onClick={() => { setAudience(a); setSingleUserId(""); setTripRefId(""); }}
                  className="rounded-full px-3 py-1.5 text-sm transition-colors"
                  style={audience === a ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                    : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  {AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {/* Single customer picker */}
          {audience === "single" && (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)/50" }}>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">搜尋客戶（姓名 / 電話）</Label>
              <Input value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="輸入關鍵字..." />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border" style={{ borderColor: "var(--border)" }}>
                {filteredCustomers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[var(--muted-foreground)]">無符合客戶</div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.lineUserId}
                      onClick={() => setSingleUserId(c.lineUserId)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--muted)] transition-colors border-b last:border-b-0"
                      style={{
                        borderColor: "var(--border)",
                        background: singleUserId === c.lineUserId ? "var(--color-phosphor)/15" : "transparent",
                        fontWeight: singleUserId === c.lineUserId ? 600 : 400,
                      }}
                    >
                      <span>{c.realName ?? c.displayName}</span>
                      <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{c.phone ?? "—"}</span>
                    </button>
                  ))
                )}
              </div>
              {singleUserId && (
                <p className="mt-2 text-xs text-[var(--color-phosphor)]">
                  ✓ 已選定：{customers.find(c => c.lineUserId === singleUserId)?.realName ?? customers.find(c => c.lineUserId === singleUserId)?.displayName}
                </p>
              )}
            </div>
          )}

          {/* Trip picker */}
          {audience === "trip" && (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--muted)/50" }}>
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">
                選擇場次（只列出尚未結束的 open 場次/潛水團，會發給所有活躍訂單客戶）
              </Label>
              <select
                value={tripRefId}
                onChange={e => setTripRefId(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              >
                <option value="">— 請選擇 —</option>
                {trips.map((t) => (
                  <option key={`${t.type}-${t.id}`} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              {trips.length === 0 && (
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">目前沒有未結束的場次</p>
              )}
            </div>
          )}

          {/* Channel */}
          <div>
            <Label className="mb-2 block text-sm text-[var(--foreground)]">發送管道</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CHANNEL_LABELS) as Channel[]).map(c => (
                <button key={c} onClick={() => setChannel(c)}
                  className="rounded-full px-3 py-1.5 text-sm transition-colors"
                  style={channel === c ? { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)", fontWeight: 600 }
                    : { background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Template + Auto-fill button */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm text-[var(--foreground)]">訊息模板</Label>
              <button onClick={fillDefaults}
                className="flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors hover:bg-[var(--color-phosphor)]/15"
                style={{ color: "var(--color-phosphor)", border: "1px solid var(--color-phosphor)/40" }}
                title="把目前選定模板的預設罐頭文字填入下方訊息欄">
                <Sparkles className="h-3 w-3" />
                填入罐頭文字
              </button>
            </div>
            <select value={template} onChange={e => selectTemplate(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm text-[var(--foreground)]"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              選定模板後會自動填入預設罐頭文字。可直接編輯或點「填入罐頭文字」重置。
            </p>
          </div>

          {/* Text message */}
          {template === "text" ? (
            <div>
              <Label className="mb-2 block text-sm text-[var(--foreground)]">訊息內容</Label>
              <textarea value={textMsg} onChange={e => setTextMsg(e.target.value)} rows={6}
                className="w-full rounded-lg border px-3 py-2 text-sm resize-none text-[var(--foreground)]"
                style={{ borderColor: "var(--border)", background: "var(--background)" }}
                placeholder="輸入純文字訊息內容..." />
            </div>
          ) : (
            <>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Alt Text（LINE 通知列文字）</Label>
                <Input value={altText} onChange={e => setAltText(e.target.value)} placeholder="簡短說明訊息內容" />
              </div>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">參考訊息內容（罐頭文字 — 編輯後可作為 emailBody）</Label>
                <textarea value={textMsg} onChange={e => setTextMsg(e.target.value)} rows={6}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  placeholder="罐頭訊息會自動載入，可直接編輯" />
              </div>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">模板參數（JSON — 會替換訊息中的 {`{變數}`}）</Label>
                <textarea value={paramsJson} onChange={e => setParamsJson(e.target.value)} rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono resize-none text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  placeholder='{"tripDate": "2026-06-01", "siteName": "龍洞"}' />
              </div>
            </>
          )}

          {/* Email fields */}
          {(channel === "email" || channel === "both") && (
            <>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Email 主旨</Label>
                <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email 標題" />
              </div>
              <div>
                <Label className="mb-1 block text-sm text-[var(--foreground)]">Email 內文</Label>
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5}
                  className="w-full rounded-lg border px-3 py-2 text-sm resize-none text-[var(--foreground)]"
                  style={{ borderColor: "var(--border)", background: "var(--background)" }}
                  placeholder="Email 正文內容..." />
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button style={primaryBtn} onClick={send} disabled={sending}>
              <Send className="mr-2 h-4 w-4" />
              {sending ? "發送中..." : "確認發送"}
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
