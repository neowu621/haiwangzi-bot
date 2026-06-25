"use client";
/**
 * v196：訊息模板管理 — 三欄式 layout（左：流程清單 / 中：填寫資料 / 右：發送預覽）
 * v480：預覽 / 試送 / 正式發送 全部走 @/lib/message-content 單一組稿來源 —
 *       「填寫資料」區所見＝「實際發出」的內容（含每模板專屬的動態主體）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import {
  MSG_SAMPLE_PARAMS,
  buildDynamicBody,
  EXTRA_LINES,
  EXTRA_FOOTER,
  HERO_EMOJI,
} from "@/lib/message-content";

type FieldKey = "title" | "subtitle" | "bodyText" | "buttonLabel" | "altText" | "footerHint";

interface EditableField {
  key: FieldKey;
  label: string;
  defaultValue: string;
}

interface TemplateInfo {
  key: string;
  label: string;
  group: string;
  icon: string;
  lineEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  editableFields: EditableField[];
  override: Partial<Record<FieldKey, string | null>> | null;
}

// v232：實際 Flex 模板顏色（與 src/lib/flex/_common.ts 同步）
const FLEX_COLORS = {
  oceanDeep: "#0A2342",
  oceanSurface: "#1B3A5C",
  phosphor: "#00D9CB",
  coral: "#FF7B5A",
};

// v518：每個訊息模板的「觸發時機」說明 — 對照各模板實際發送的程式位點：
//   🎯 客戶動作即時觸發 · ⏰ 每日排程自動 · 👤 老闆/教練後台操作 · 🤝 加入時自動 · ⚠️ 內部通知管理者
const TRIGGER_TIMING: Record<string, { icon: string; when: string }> = {
  welcome:                  { icon: "🤝", when: "客戶加入 LINE 好友 / 首次進入官方帳號時，自動發送一次。" },
  booking_confirm:          { icon: "🎯", when: "客戶送出預約（日潛場次或潛水旅遊）成功的當下，立即發送。" },
  deposit_notice:           { icon: "⏰", when: "潛旅下訂後接近繳費期限時自動催繳訂金（每日排程；提前天數見下方設定）。" },
  deposit_pending:          { icon: "💳", when: "【內部】客戶上傳「訂金」付款證明後，立即提醒老闆 / 管理者去核對確認。" },
  deposit_confirm:          { icon: "👤", when: "教練 / 老闆核對並確認收到訂金轉帳後，發送給客戶。" },
  final_reminder:           { icon: "⏰", when: "潛旅出發前自動預告並催繳尾款（每日排程；提前天數見下方設定，各團另可自訂尾款截止日）。" },
  trip_guide:               { icon: "📘", when: "潛旅（潛水團）出發前的完整行前須知手冊。⚠️ 目前未接自動排程，由老闆視需要手動發送 / 試送。" },
  d1_reminder:              { icon: "⏰", when: "日潛場次前自動發送行前提醒（每日排程；提前天數見下方設定）。" },
  weather_cancel:           { icon: "🌧️", when: "教練或系統因天候取消當日場次時發送。" },
  overcap_alert:            { icon: "⚠️", when: "【內部】某場次報名人數超過名額上限時，通知老闆 / 管理者。" },
  admin_weekly:             { icon: "📊", when: "【內部】每週定時自動寄給老闆 / 管理者的營運週報（排程）。" },
  attendance_confirmed:     { icon: "🐠", when: "客戶當天到場、教練點名「到場」後發送。" },
  first_order_reward_grant: { icon: "🎁", when: "客戶第一筆訂單在「到場完成」後，自動發放首單獎勵金時。" },
  refund_request:           { icon: "👤", when: "老闆發起退款、需要客戶確認退款資訊時發送。" },
  payment_reject:           { icon: "🚫", when: "老闆審核客戶上傳的轉帳證明「不通過」時發送。" },
  booking_cancel:           { icon: "❌", when: "訂單被取消時（老闆於後台取消訂單）發送。" },
  refund_complete:          { icon: "✅", when: "退款流程處理完成、金額退回後發送。" },
  vip_upgrade:              { icon: "🌟", when: "客戶累積消費 / 到場達標、VIP 等級升級時發送。" },
  birthday_credit:          { icon: "🎂", when: "客戶生日當天自動發放生日禮金時（每日排程）。" },
  credit_expiry:            { icon: "💳", when: "抵用金到期前自動提醒客戶使用（每日排程；提前天數見下方設定）。" },
};

// v519：哪些模板有「提前幾天通知」可調設定 → 對應 site-config 欄位（原本寫死在 cron，現移到此頁可改）
const LEAD_DAY_FIELDS: Record<string, { field: string; pre: string; post: string }> = {
  d1_reminder:    { field: "d1ReminderLeadDays",      pre: "日潛場次前", post: "天，自動發行前提醒。" },
  final_reminder: { field: "finalEarlyLeadDays",      pre: "潛旅出發前", post: "天，預告並催繳尾款。（各團另可自訂尾款截止日）" },
  deposit_notice: { field: "depositRemindBeforeDays", pre: "繳費截止前", post: "天，催繳潛旅訂金。" },
  credit_expiry:  { field: "creditExpiryLeadDays",    pre: "抵用金到期前", post: "天，提醒客戶把握使用。" },
};

// v520：每個模板的「適用對象」標籤 — 會員 / 日潛(一次付清) / 旅潛(訂金+尾款) / 內部(發給老闆)
const SCOPE_TAGS: Record<string, string[]> = {
  welcome:                  ["會員"],
  booking_confirm:          ["日潛"],
  deposit_notice:           ["旅潛"],
  deposit_pending:          ["旅潛", "內部"],
  deposit_confirm:          ["旅潛"],
  final_reminder:           ["旅潛"],
  trip_guide:               ["旅潛"],
  d1_reminder:              ["日潛"],
  weather_cancel:           ["日潛"],
  overcap_alert:            ["日潛", "內部"],
  admin_weekly:             ["內部"],
  attendance_confirmed:     ["日潛", "旅潛"],
  first_order_reward_grant: ["會員"],
  refund_request:           ["日潛", "旅潛"],
  payment_reject:           ["日潛", "旅潛"],
  booking_cancel:           ["日潛", "旅潛"],
  refund_complete:          ["日潛", "旅潛"],
  vip_upgrade:              ["會員"],
  birthday_credit:          ["會員"],
  credit_expiry:            ["會員"],
};
const SCOPE_COLORS: Record<string, { bg: string; fg: string }> = {
  "會員": { bg: "#eef0fb", fg: "#4b54b8" },
  "日潛": { bg: "#e3f6f3", fg: "#0d8a7e" },
  "旅潛": { bg: "#fdeede", fg: "#b4791b" },
  "內部": { bg: "#eef1f3", fg: "#5c6b73" },
};
// 特別備註：日潛一次付清、旅潛才有訂金/尾款
const SCOPE_NOTE: Record<string, string> = {
  booking_confirm: "日潛一次付清，無訂金 / 尾款流程。",
  deposit_notice:  "僅旅潛（潛水團）有訂金流程，日潛不適用。",
  deposit_confirm: "僅旅潛（潛水團）有訂金流程，日潛不適用。",
  final_reminder:  "僅旅潛（潛水團）有尾款流程，日潛不適用。",
};

// v480：每模板「動態主體」樣本 — 與試送/正式發送同一函式產生（單一來源）
function sampleBody(key: string): string {
  return buildDynamicBody(key, MSG_SAMPLE_PARAMS[key] ?? {});
}
// 把「label：value」行渲染成 k/v 列；非 k/v 行原樣顯示
function bodyLines(key: string): Array<{ k: string; v: string } | string> {
  return sampleBody(key)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("：");
      return i > 0 && i <= 6 ? { k: line.slice(0, i), v: line.slice(i + 1) } : line;
    });
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true); // v364：載入中動畫
  const [curIdx, setCurIdx] = useState(0);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<"line" | "email" | "inApp" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // v470：Email 發送路徑（gmail / zsend / fallback）
  const [emailProvider, setEmailProvider] = useState<string>("gmail");
  const [providerSaving, setProviderSaving] = useState(false);
  // v519：訊息模板「提前幾天通知」設定（存 site-config）
  const [leadDays, setLeadDays] = useState<Record<string, number>>({});
  const [leadSaving, setLeadSaving] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // v470：載入目前 Email 發送路徑設定；v519：一併載入「提前幾天通知」設定
  useEffect(() => {
    adminFetch<{ config: { emailProvider?: string; d1ReminderLeadDays?: number; finalEarlyLeadDays?: number; depositRemindBeforeDays?: number; creditExpiryLeadDays?: number } }>("/api/admin/site-config")
      .then((d) => {
        setEmailProvider(d.config?.emailProvider ?? "gmail");
        setLeadDays({
          d1ReminderLeadDays: d.config?.d1ReminderLeadDays ?? 1,
          finalEarlyLeadDays: d.config?.finalEarlyLeadDays ?? 33,
          depositRemindBeforeDays: d.config?.depositRemindBeforeDays ?? 2,
          creditExpiryLeadDays: d.config?.creditExpiryLeadDays ?? 7,
        });
      })
      .catch(() => {});
  }, []);

  // v519：把目前輸入的提前天數存回 site-config（onBlur 時呼叫）
  async function commitLeadDay(field: string) {
    setLeadSaving(true);
    try {
      await adminFetch("/api/admin/site-config", { method: "POST", body: JSON.stringify({ [field]: leadDays[field] }) });
      showToast(`「提前天數」已更新為 ${leadDays[field]} 天`);
    } catch (e) {
      showToast("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLeadSaving(false);
    }
  }

  async function saveEmailProvider(v: string) {
    const prev = emailProvider;
    setEmailProvider(v);
    setProviderSaving(true);
    try {
      await adminFetch("/api/admin/site-config", { method: "POST", body: JSON.stringify({ emailProvider: v }) });
      showToast(`Email 發送路徑已改為「${v === "gmail" ? "Gmail" : v === "zsend" ? "ZSend" : "自動備援"}」`);
    } catch (e) {
      setEmailProvider(prev);
      showToast("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setProviderSaving(false);
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adminFetch<{ templates: TemplateInfo[] }>("/api/admin/templates");
      setTemplates(d.templates);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const cur = templates[curIdx];

  // 切換 template 時重新填入 draft
  useEffect(() => {
    if (!cur) return;
    const d: Record<string, string> = {};
    cur.editableFields.forEach((f) => {
      const ov = cur.override?.[f.key];
      d[f.key] = ov && ov.length > 0 ? ov : f.defaultValue;
    });
    setDraft(d);
  }, [cur]);

  const isOn = cur ? cur.lineEnabled || cur.emailEnabled || cur.inAppEnabled : false;

  function val(k: string) {
    return draft[k] ?? "";
  }

  async function toggleCh(ch: "line" | "email" | "inApp") {
    if (!cur) return;
    const cur0 = ch === "line" ? cur.lineEnabled : ch === "email" ? cur.emailEnabled : cur.inAppEnabled;
    const next = !cur0;
    const field = ch === "line" ? "lineEnabled" : ch === "email" ? "emailEnabled" : "inAppEnabled";
    const chLabel = ch === "line" ? "LINE" : ch === "email" ? "Email" : "站內通知";
    // optimistic
    setTemplates((arr) =>
      arr.map((t, i) =>
        i === curIdx ? { ...t, [field]: next } : t,
      ),
    );
    try {
      await adminFetch("/api/admin/templates", {
        method: "POST",
        body: JSON.stringify({
          key: cur.key,
          [field]: next,
        }),
      });
      showToast(`「${cur.label}」${chLabel} 已${next ? "開啟" : "關閉"}`);
    } catch (e) {
      // rollback
      await reload();
      showToast(e instanceof Error ? e.message : "切換失敗");
    }
  }

  async function save() {
    if (!cur || !isOn) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, string | null | boolean> = { key: cur.key };
      for (const f of cur.editableFields) {
        const v = draft[f.key];
        // 與 default 相同就存 null（= 用預設）；不然存覆寫值
        body[f.key] = v && v !== f.defaultValue ? v : null;
      }
      await adminFetch("/api/admin/templates", { method: "POST", body: JSON.stringify(body) });
      const ch = [cur.lineEnabled && "LINE", cur.emailEnabled && "Email", cur.inAppEnabled && "站內"].filter(Boolean).join(" + ");
      showToast(`已儲存「${cur.label}」（發送：${ch}）`);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function testSend(ch: "line" | "email" | "inApp") {
    if (!cur) return;
    if (ch === "line" && !cur.lineEnabled) return;
    if (ch === "email" && !cur.emailEnabled) return;
    if (ch === "inApp" && !cur.inAppEnabled) return;
    setSending(ch);
    setErr(null);
    try {
      await adminFetch("/api/admin/templates/test-send", {
        method: "POST",
        body: JSON.stringify({ key: cur.key, channel: ch }),
      });
      const chLabel = ch === "line" ? "LINE" : ch === "email" ? "Email" : "站內通知";
      showToast(`已將「${cur.label}」${chLabel} 試送到您自己 ✓${ch === "inApp" ? "（到 LIFF 個人中心查看）" : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      showToast("試送失敗：" + msg);
    } finally {
      setSending(null);
    }
  }

  // 分組 + 步驟編號
  const navGroups = useMemo(() => {
    const result: { group: string; items: { idx: number; t: TemplateInfo; step: number | "內" }[] }[] = [];
    let step = 0;
    let lastGrp = "";
    templates.forEach((t, i) => {
      if (t.group !== lastGrp) {
        result.push({ group: t.group, items: [] });
        lastGrp = t.group;
      }
      const isInt = t.group.indexOf("管理者") > -1;
      result[result.length - 1].items.push({
        idx: i,
        t,
        step: isInt ? "內" : ++step,
      });
    });
    return result;
  }, [templates]);

  return (
    <AdminShell title="訊息模板">
      <div style={{ background: "#f5f8f8", height: "calc(100vh - 56px)", margin: "-1rem", padding: "16px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* hint */}
        <div style={hintbarStyle}>
          每張卡片的「動態資料」（客戶名・日期・金額）由系統<b style={{ color: "#0e4c5a" }}>自動帶入</b>，這裡只改文字描述 ·
          在區塊2勾選要發 <b style={{ color: "#0e4c5a" }}>LINE / Email / 站內通知</b> ·
          改完按 <b style={{ color: "#0e4c5a" }}>儲存</b>，再到區塊3各自 <b style={{ color: "#0e4c5a" }}>試送到我</b> 確認。
        </div>

        {/* v470：Email 發送路徑（全站套用，含試送與正式發送） */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#eef6f6", border: "1px solid #d6e6e6", borderRadius: 10, padding: "9px 13px", marginBottom: 12, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700, color: "#0e4c5a" }}>✉️ Email 發送路徑</span>
          <select
            value={emailProvider}
            disabled={providerSaving}
            onChange={(e) => saveEmailProvider(e.target.value)}
            style={{ fontSize: 12.5, padding: "5px 9px", borderRadius: 8, border: "1px solid #c4dada", background: "#fff", fontFamily: "inherit" }}
          >
            <option value="gmail">Gmail（預設）</option>
            <option value="zsend">ZSend</option>
            <option value="fallback">自動備援（Gmail 失敗改 ZSend）</option>
          </select>
          {providerSaving && <span style={{ fontSize: 11, color: "#0a8f86" }}>儲存中…</span>}
          <span style={{ fontSize: 11, color: "#7c9296" }}>所有 Email（試送＋正式）都走此路徑</span>
        </div>

        {err && (
          <div style={{ background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b", borderRadius: 10, padding: "10px 13px", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
            {err}
          </div>
        )}

        {/* v364：載入中動畫（冷啟動/慢網路時不再是一片空白）*/}
        {loading && templates.length === 0 && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#516268" }}>
            <div style={{ width: 34, height: 34, border: "3px solid #d6e6e4", borderTopColor: "#0e4c5a", borderRadius: "50%", animation: "tplspin .8s linear infinite" }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>載入訊息模板中…</div>
            <style>{`@keyframes tplspin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {/* 3-column panes */}
        <div style={{ display: loading && templates.length === 0 ? "none" : "grid", gridTemplateColumns: "256px 1fr 400px", gap: 14, flex: 1, minHeight: 0 }}>
          {/* === Pane 1: 流程清單 === */}
          <div style={paneStyle}>
            <div style={paneHeadStyle}>
              <span style={paneNumStyle}>1</span>
              <b style={{ fontSize: 13.5 }}>依流程選擇</b>
              <span style={paneSubStyle}>客戶旅程順序</span>
            </div>
            <div style={paneBodyStyle}>
              {navGroups.map((g) => (
                <div key={g.group}>
                  <div style={navGroupStyle}>{g.group}</div>
                  {/* v474：付款流程歸屬說明 — 訂金/尾款只用於旅遊潛水；一日潛水一次付清 */}
                  {g.group.includes("收款") && (
                    <div style={{ fontSize: 10.5, color: "#8a9aa0", lineHeight: 1.5, padding: "0 4px 6px" }}>
                      💡 <b style={{ color: "#0e7c8a" }}>旅遊潛水</b>：訂金 → 訂金確認 → 尾款（兩段式）<br />
                      🔱 <b style={{ color: "#0e7c8a" }}>一日潛水</b>：一次付清，只用「預約確認」，不走訂金/尾款
                    </div>
                  )}
                  {g.items.map(({ idx, t, step }) => {
                    const active = idx === curIdx;
                    const off = !(t.lineEnabled || t.emailEnabled || t.inAppEnabled);
                    const isInt = step === "內";
                    return (
                      <div
                        key={t.key}
                        onClick={() => setCurIdx(idx)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 9px", borderRadius: 10, cursor: "pointer",
                          fontSize: 13, fontWeight: active ? 700 : 500,
                          marginBottom: 2,
                          border: active ? "1px solid rgba(19,181,166,.3)" : "1px solid transparent",
                          background: active
                            ? "linear-gradient(95deg,rgba(19,181,166,.12),rgba(19,181,166,.03))"
                            : undefined,
                          boxShadow: active ? "inset 3px 0 0 #13b5a6" : undefined,
                          opacity: off ? 0.5 : 1,
                        }}
                      >
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%",
                          display: "grid", placeItems: "center",
                          fontSize: 10, fontWeight: 800,
                          background: active ? "#13b5a6" : isInt ? "#fdf2dc" : "#e3f4f1",
                          color: active ? "#fff" : isInt ? "#cf962a" : "#0e4c5a",
                          flex: "none",
                        }}>
                          {step}
                        </span>
                        <span style={{ fontSize: 15, width: 17, textAlign: "center", flex: "none" }}>{t.icon}</span>
                        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.label}
                        </span>
                        <ChannelDot on={t.lineEnabled}>L</ChannelDot>
                        <ChannelDot on={t.emailEnabled}>E</ChannelDot>
                        <ChannelDot on={t.inAppEnabled}>站</ChannelDot>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* === Pane 2: 填寫資料 === */}
          <div style={paneStyle}>
            <div style={paneHeadStyle}>
              <span style={paneNumStyle}>2</span>
              <b style={{ fontSize: 13.5 }}>填寫資料</b>
              <span style={paneSubStyle}>編輯內容 + 選管道</span>
            </div>
            <div style={paneBodyStyle}>
              {cur && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 4px 0", marginBottom: 10 }}>
                    <div style={{ fontSize: 22 }}>{cur.icon}</div>
                    <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{cur.label}</h2>
                    <span style={{
                      fontSize: 11.5, fontWeight: 800,
                      padding: "3px 10px", borderRadius: 20,
                      background: isOn ? "#e3f6ee" : "#f0f3f3",
                      color: isOn ? "#23c08a" : "#9aabae",
                    }}>
                      {isOn ? "啟用中" : "已停用"}
                    </span>
                  </div>

                  {/* v518：觸發時機 — 隨選到的模板自動切換，告訴老闆「這封會在什麼時候發出去」 */}
                  {TRIGGER_TIMING[cur.key] && (
                    <div style={{
                      display: "flex", gap: 9, alignItems: "flex-start",
                      margin: "0 4px 12px", padding: "10px 13px",
                      background: "#fff8ec", border: "1px solid #f3e2c0", borderRadius: 11,
                    }}>
                      <span style={{ fontSize: 16, flex: "none", lineHeight: 1.5 }}>{TRIGGER_TIMING[cur.key].icon}</span>
                      <div style={{ fontSize: 12, lineHeight: 1.65, color: "#7a5b20" }}>
                        <b style={{ color: "#b4791b", marginRight: 5 }}>觸發時機</b>
                        {TRIGGER_TIMING[cur.key].when}
                      </div>
                    </div>
                  )}

                  {/* v519：提前幾天通知 — 只有有「N 天前」需求的模板才出現，改這裡=改實際發送時機 */}
                  {LEAD_DAY_FIELDS[cur.key] && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      margin: "0 4px 12px", padding: "11px 13px",
                      background: "#eef6f6", border: "1px solid #cfe6e4", borderRadius: 11,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#0e4c5a", flex: "none" }}>⏱️ 提前天數設定</span>
                      <span style={{ fontSize: 12.5, color: "#33464e" }}>{LEAD_DAY_FIELDS[cur.key].pre}</span>
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={leadDays[LEAD_DAY_FIELDS[cur.key].field] ?? ""}
                        onChange={(e) => {
                          const f = LEAD_DAY_FIELDS[cur.key].field;
                          const v = Math.max(0, Math.min(180, Math.floor(Number(e.target.value) || 0)));
                          setLeadDays((m) => ({ ...m, [f]: v }));
                        }}
                        onBlur={() => commitLeadDay(LEAD_DAY_FIELDS[cur.key].field)}
                        disabled={leadSaving}
                        style={{
                          width: 64, textAlign: "center", fontSize: 14, fontWeight: 700,
                          border: "1.5px solid #9fcfca", borderRadius: 8, padding: "5px 6px",
                          color: "#0e4c5a", background: "#fff", fontFamily: "inherit",
                        }}
                      />
                      <span style={{ fontSize: 12.5, color: "#33464e" }}>{LEAD_DAY_FIELDS[cur.key].post}</span>
                      <span style={{ fontSize: 10.5, color: "#7c9296", flexBasis: "100%" }}>
                        改完點空白處即儲存，立即套用到下次自動發送（全站共用此設定）。
                      </span>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: "#4a6168", lineHeight: 1.7, padding: "0 4px", marginBottom: 12 }}>
                    <span style={{
                      display: "inline-block", background: "#e9f6f4", color: "#0e4c5a",
                      border: "1px solid #cdeae5", padding: "1px 8px", borderRadius: 20,
                      fontSize: 10.5, fontWeight: 700, marginRight: 5,
                    }}>
                      {cur.group}
                    </span>
                    {/* v520：適用對象標籤 — 會員 / 日潛 / 旅潛 / 內部 */}
                    {(SCOPE_TAGS[cur.key] ?? []).map((tag) => {
                      const c = SCOPE_COLORS[tag] ?? { bg: "#eef1f3", fg: "#5c6b73" };
                      return (
                        <span key={tag} style={{
                          display: "inline-block", background: c.bg, color: c.fg,
                          padding: "1px 8px", borderRadius: 20,
                          fontSize: 10.5, fontWeight: 700, marginRight: 5,
                        }}>
                          {tag}
                        </span>
                      );
                    })}
                    動態欄位由系統自動代入，下方僅編輯文字。
                    {SCOPE_NOTE[cur.key] && (
                      <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#b4791b", fontWeight: 600 }}>
                        ⚠️ {SCOPE_NOTE[cur.key]}
                      </span>
                    )}
                  </div>

                  {/* 管道開關 */}
                  <div style={{ background: "#f5f9f9", border: "1px solid #e1ebeb", borderRadius: 11, padding: "11px 13px", margin: "0 4px 14px" }}>
                    <span style={{ fontSize: 10.5, letterSpacing: 1, color: "#9aabae", fontWeight: 700, marginBottom: 9, display: "block" }}>
                      發送管道（可選 LINE／Email／站內通知，可複選）
                    </span>
                    <div style={{ display: "flex", gap: 9 }}>
                      <ChannelBox icon="💬" label="LINE" on={cur.lineEnabled} onToggle={() => toggleCh("line")} />
                      <ChannelBox icon="✉️" label="Email" on={cur.emailEnabled} onToggle={() => toggleCh("email")} />
                      <ChannelBox icon="📬" label="站內通知" on={cur.inAppEnabled} onToggle={() => toggleCh("inApp")} />
                    </div>
                  </div>

                  {!isOn && (
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "#fff4f2", border: "1px solid #ffd9d3", color: "#c0473b",
                      borderRadius: 10, padding: "10px 13px", fontSize: 12, fontWeight: 600,
                      margin: "0 4px 14px",
                    }}>
                      ⏸️ 三個管道都已關閉，此模板不會發送。請至少開啟一個管道。
                    </div>
                  )}

                  <div style={{ opacity: isOn ? 1 : 0.5, pointerEvents: isOn ? "auto" : "none" }}>
                    {cur.editableFields.map((f) => (
                      <div key={f.key} style={{ margin: "0 4px 14px" }}>
                        <label style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                          {f.label}
                          <span style={{ fontSize: 10.5, fontWeight: 400, color: "#94a9ac" }}>
                            預設：{f.defaultValue}
                          </span>
                        </label>
                        {f.key === "bodyText" ? (
                          <textarea
                            value={val(f.key)}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            style={{ ...inputStyle, minHeight: 58, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
                          />
                        ) : (
                          <input
                            value={val(f.key)}
                            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                            style={inputStyle}
                          />
                        )}
                      </div>
                    ))}

                    {/* v480：內容主體（動態資料）— 與發送內容相同的主體，系統自動帶入、不可編輯 */}
                    {sampleBody(cur.key) && (
                      <div style={{ margin: "0 4px 14px" }}>
                        <label style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 12, fontWeight: 700, marginBottom: 5 }}>
                          內容主體（動態資料）
                          <span style={{ fontSize: 10.5, fontWeight: 400, color: "#94a9ac" }}>
                            系統自動帶入真實資料，此處為模擬範例（不可編輯）
                          </span>
                        </label>
                        <div style={{
                          border: "1.5px dashed #cfe0e0", borderRadius: 10, padding: "10px 12px",
                          background: "#f7fbfa", fontSize: 12.5, lineHeight: 1.8,
                          color: "#33464e", whiteSpace: "pre-wrap",
                        }}>
                          {sampleBody(cur.key)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{
                    display: "flex", gap: 9, margin: "18px 4px 4px",
                    position: "sticky", bottom: 0,
                    background: "linear-gradient(transparent,#fff 32%)",
                    paddingTop: 12,
                  }}>
                    <button
                      onClick={save}
                      disabled={!isOn || saving}
                      style={{
                        flex: 1, border: "none", borderRadius: 11, padding: 12,
                        fontSize: 13.5, fontWeight: 700, fontFamily: "inherit",
                        cursor: isOn && !saving ? "pointer" : "not-allowed",
                        background: "#0a2027", color: "#fff",
                        opacity: !isOn || saving ? 0.4 : 1,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      }}
                    >
                      💾 {saving ? "儲存中..." : "儲存"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* === Pane 3: 發送預覽 === */}
          <div style={paneStyle}>
            <div style={paneHeadStyle}>
              <span style={paneNumStyle}>3</span>
              <b style={{ fontSize: 13.5 }}>發送預覽</b>
              <span style={paneSubStyle}>LINE / Email / 站內</span>
            </div>
            <div style={{ ...paneBodyStyle, background: "linear-gradient(180deg,#0a2d36,#06262e)" }}>
              {cur && (
                <>
                  <LinePreview cur={cur} val={val} sending={sending === "line"} onTest={() => testSend("line")} />
                  <EmailPreview cur={cur} val={val} sending={sending === "email"} onTest={() => testSend("email")} />
                  <InAppPreview cur={cur} val={val} sending={sending === "inApp"} onTest={() => testSend("inApp")} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)",
          background: "#0a2027", color: "#fff",
          padding: "12px 22px", borderRadius: 30, fontSize: 13, fontWeight: 600,
          boxShadow: "0 10px 30px rgba(0,0,0,.3)", zIndex: 99,
          display: "flex", alignItems: "center", gap: 9,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1ed4c2" }} />
          {toast}
        </div>
      )}
    </AdminShell>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function ChannelDot({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      width: 17, height: 17, borderRadius: 5, flex: "none",
      display: "grid", placeItems: "center", fontSize: 9.5,
      fontWeight: 800,
      background: on ? "#13b5a6" : "#e7eded",
      color: on ? "#fff" : "#b3c2c2",
      border: on ? "1px solid transparent" : "1px solid #dde7e7",
    }}>
      {children}
    </span>
  );
}

function ChannelBox({
  icon, label, on, onToggle,
}: { icon: string; label: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", gap: 8,
      background: "#fff", border: `1.5px solid ${on ? "#13b5a6" : "#e1ebeb"}`,
      borderRadius: 10, padding: "8px 11px",
    }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          width: 38, height: 21, borderRadius: 20,
          background: on ? "#13b5a6" : "#cdd9d9",
          position: "relative", flex: "none", cursor: "pointer", border: "none",
          transition: ".2s",
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: on ? 19 : 2,
          width: 17, height: 17, borderRadius: "50%", background: "#fff",
          transition: ".2s", boxShadow: "0 1px 3px rgba(0,0,0,.25)",
        }} />
      </button>
    </div>
  );
}

function LinePreview({ cur, val, sending, onTest }: {
  cur: TemplateInfo; val: (k: string) => string; sending: boolean; onTest: () => void;
}) {
  const title = val("title");
  const sub = val("subtitle");
  const body = val("bodyText");
  const hint = val("footerHint");
  const btn = val("buttonLabel");
  const push = val("altText");
  return (
    <div style={{ margin: "8px 8px 22px", opacity: cur.lineEnabled ? 1 : 0.4, filter: cur.lineEnabled ? undefined : "grayscale(.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 10px" }}>
        <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#9fd6cf", fontWeight: 800 }}>
          💬 LINE
        </span>
        {!cur.lineEnabled && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ffb3aa", background: "rgba(255,107,94,.16)", padding: "1px 8px", borderRadius: 20 }}>
            未啟用
          </span>
        )}
        <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
      </div>

      {/* v232：模擬 LINE 聊天背景 + bubble 仿真 Flex */}
      <div style={{ backgroundImage: "linear-gradient(160deg,#8fb4cf,#6e95b4)", borderRadius: 16, padding: "14px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
          <div style={{
            width: 27, height: 27, borderRadius: "50%",
            background: `linear-gradient(140deg,${FLEX_COLORS.phosphor},${FLEX_COLORS.oceanDeep})`,
            display: "grid", placeItems: "center", fontSize: 13, flex: "none",
          }}>🔱</div>
          <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,.15)" }}>
            海王子潛水
          </div>
        </div>
        {/* 實際 Flex bubble — 仿 LINE Flex Message 結構 */}
        <div style={{
          background: "#fff", borderRadius: 14,
          overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,.22)", maxWidth: 280,
        }}>
          {/* HERO：oceanDeep 背景 + 大 emoji + 大標題 + 副標 */}
          <div style={{
            background: FLEX_COLORS.oceanDeep,
            padding: "24px 16px 18px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 8 }}>
              {HERO_EMOJI[cur.key] ?? cur.icon}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", marginBottom: 4, lineHeight: 1.3 }}>
              {title}
            </div>
            {sub && (
              <div style={{ fontSize: 13, color: FLEX_COLORS.phosphor, fontWeight: 500, lineHeight: 1.4 }}>
                {sub}
              </div>
            )}
          </div>

          {/* BODY：白底 + 說明文字 / 列表 / 動態主體（與發送內容同一來源）/ 標語 */}
          <div style={{ padding: "14px 16px 4px", background: "#fff" }}>
            {body && (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: "#1A2330", marginBottom: 6, whiteSpace: "pre-wrap" }}>
                {body}
              </div>
            )}
            {EXTRA_LINES[cur.key] && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                {cur.key === "welcome" && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: FLEX_COLORS.oceanDeep, marginBottom: 2 }}>
                    我們在 LINE 為您提供：
                  </div>
                )}
                {EXTRA_LINES[cur.key].map((line, i) => (
                  <div key={i} style={{ fontSize: 12, lineHeight: 1.55, color: "#1A2330" }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
            {sampleBody(cur.key) && (
              <div style={{
                marginTop: 10, padding: 9, borderRadius: 8,
                background: "#F4F7FA",
                fontSize: 11.5, color: "#3A4655",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                {bodyLines(cur.key).map((l, i) =>
                  typeof l === "string"
                    ? <span key={i}>{l}</span>
                    : <span key={i}><b style={{ color: FLEX_COLORS.oceanDeep }}>{l.k}</b> {l.v}</span>,
                )}
              </div>
            )}
            {hint && (
              <div style={{ marginTop: 10, textAlign: "center", fontSize: 11.5, color: "#0a8f86", fontWeight: 600 }}>
                {hint}
              </div>
            )}
            {EXTRA_FOOTER[cur.key] && (
              <div style={{
                marginTop: 12, textAlign: "center", fontSize: 11.5,
                color: "#6B7682", paddingBottom: 4,
              }}>
                {EXTRA_FOOTER[cur.key]}
              </div>
            )}
          </div>

          {/* BUTTON：phosphor 漸層滿版按鈕 */}
          {btn && (
            <div style={{ padding: "0 16px 16px" }}>
              <div style={{
                background: FLEX_COLORS.phosphor,
                color: FLEX_COLORS.oceanDeep,
                textAlign: "center",
                padding: "11px 8px",
                borderRadius: 10,
                fontSize: 13.5,
                fontWeight: 800,
              }}>
                {btn}
              </div>
            </div>
          )}
        </div>
        {/* 通知列預覽 */}
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.85)", marginTop: 8, paddingLeft: 3 }}>
          🔔 通知列：<span style={{ fontSize: 10, color: "#fff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,.2)" }}>{push}</span>
        </div>
      </div>

      <button
        onClick={onTest}
        disabled={!cur.lineEnabled || sending}
        style={{
          width: "100%", marginTop: 11, border: "none", borderRadius: 9, padding: 10,
          fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
          cursor: cur.lineEnabled && !sending ? "pointer" : "not-allowed",
          background: cur.lineEnabled ? "linear-gradient(120deg,#13b5a6,#1ed4c2)" : "#3a5a60",
          color: cur.lineEnabled ? "#04323a" : "#9fc6c2",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        📨 {sending ? "送出中..." : "試送 LINE 到我"}
      </button>
      {/* v231：預覽侷限說明 */}
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 6, textAlign: "center" }}>
        ※ 預覽為簡化版；實際 LINE 訊息會有完整圖示、列表、漸層。建議按「試送到我」確認最終效果。
      </p>
    </div>
  );
}

function EmailPreview({ cur, val, sending, onTest }: {
  cur: TemplateInfo; val: (k: string) => string; sending: boolean; onTest: () => void;
}) {
  const title = val("title");
  const sub = val("subtitle");
  const body = val("bodyText");
  const hint = val("footerHint");
  const btn = val("buttonLabel");
  return (
    <div style={{ margin: "8px 8px 22px", opacity: cur.emailEnabled ? 1 : 0.4, filter: cur.emailEnabled ? undefined : "grayscale(.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 10px" }}>
        <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#9fd6cf", fontWeight: 800 }}>
          ✉️ Email
        </span>
        {!cur.emailEnabled && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ffb3aa", background: "rgba(255,107,94,.16)", padding: "1px 8px", borderRadius: 20 }}>
            未啟用
          </span>
        )}
        <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
      </div>

      <div style={{ background: "#fff", borderRadius: 11, overflow: "hidden", boxShadow: "0 5px 18px rgba(0,0,0,.22)" }}>
        <div style={{ padding: "11px 14px", borderBottom: "1px solid #eef2f2", background: "#fafcfc" }}>
          <div style={{ display: "flex", fontSize: 11, marginBottom: 3, color: "#7c9296" }}>
            <b style={{ color: "#0a2027", width: 42, fontWeight: 700 }}>寄件</b>
            <span>海王子潛水</span>
          </div>
          <div style={{ display: "flex", fontSize: 11, marginBottom: 3, color: "#7c9296" }}>
            <b style={{ color: "#0a2027", width: 42, fontWeight: 700 }}>收件</b>
            <span>我自己</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0a2027", marginTop: 5, lineHeight: 1.35 }}>
            {title}
          </div>
        </div>
        <div style={{ background: "linear-gradient(120deg,#06262e,#0e4c5a)", padding: "17px 16px", color: "#eafffb", display: "flex", alignItems: "center", gap: 11 }}>
          <span style={{ fontSize: 27 }}>{cur.icon}</span>
          <div>
            <b style={{ fontFamily: "'Outfit',sans-serif", fontSize: 14, display: "block" }}>東北角海王子潛水</b>
            <span style={{ fontSize: 10, opacity: 0.7, letterSpacing: 2 }}>SEA PRINCE DIVING</span>
          </div>
        </div>
        <div style={{ padding: "16px 17px 6px", color: "#0a2027" }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 7, lineHeight: 1.35 }}>{HERO_EMOJI[cur.key] ?? "📩"} {title}</div>
          {sub && <div style={{ fontSize: 12.5, color: "#0a8f86", fontWeight: 600, lineHeight: 1.7, marginBottom: 8 }}>{sub}</div>}
          {body && <div style={{ fontSize: 12.5, color: "#516268", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-wrap" }}>{body}</div>}
          {/* v231：模板內建列表 */}
          {EXTRA_LINES[cur.key] && (
            <ul style={{ marginBottom: 12, paddingLeft: 18, fontSize: 12, color: "#516268", lineHeight: 1.7 }}>
              {EXTRA_LINES[cur.key].map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          {sampleBody(cur.key) && (
            <div style={{ background: "#f4f9f8", border: "1px solid #e2efed", borderRadius: 9, padding: "11px 13px", marginBottom: 14 }}>
              {bodyLines(cur.key).map((l, i) =>
                typeof l === "string"
                  ? <div key={i} style={{ fontSize: 12, padding: "3px 0", color: "#516268" }}>{l}</div>
                  : <DataRow key={i} k={l.k} v={l.v} />,
              )}
            </div>
          )}
          {hint && <div style={{ textAlign: "center", fontSize: 12, color: "#0a8f86", fontWeight: 600, marginBottom: 12 }}>{hint}</div>}
          {btn && (
            <span style={{
              display: "inline-block", background: "#13b5a6", color: "#fff",
              padding: "9px 22px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, marginBottom: 14,
            }}>
              {btn} →
            </span>
          )}
        </div>
        <div style={{ padding: "12px 17px", borderTop: "1px solid #eef2f2", fontSize: 10.5, color: "#9aabae", textAlign: "center", lineHeight: 1.6 }}>
          系統自動通知信 · 動態欄位寄送時自動帶入<br />
          東北角海王子潛水 · 安全・專業，陪你看見海
        </div>
      </div>

      <button
        onClick={onTest}
        disabled={!cur.emailEnabled || sending}
        style={{
          width: "100%", marginTop: 11, border: "none", borderRadius: 9, padding: 10,
          fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
          cursor: cur.emailEnabled && !sending ? "pointer" : "not-allowed",
          background: cur.emailEnabled ? "linear-gradient(120deg,#13b5a6,#1ed4c2)" : "#3a5a60",
          color: cur.emailEnabled ? "#04323a" : "#9fc6c2",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        📨 {sending ? "送出中..." : "試送 Email 到我"}
      </button>
    </div>
  );
}

// v464：站內通知預覽 + 試送（與 LINE/Email 共用同一份內容，只多一顆發送鈕）
function InAppPreview({ cur, val, sending, onTest }: {
  cur: TemplateInfo; val: (k: string) => string; sending: boolean; onTest: () => void;
}) {
  const title = val("title");
  const sub = val("subtitle");
  const body = val("bodyText");
  const hint = val("footerHint");
  return (
    <div style={{ margin: "8px 8px 22px", opacity: cur.inAppEnabled ? 1 : 0.4, filter: cur.inAppEnabled ? undefined : "grayscale(.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 10px" }}>
        <span style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#9fd6cf", fontWeight: 800 }}>
          📬 站內通知
        </span>
        {!cur.inAppEnabled && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ffb3aa", background: "rgba(255,107,94,.16)", padding: "1px 8px", borderRadius: 20 }}>
            未啟用
          </span>
        )}
        <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.1)" }} />
      </div>

      {/* v468：客戶點開通知後看到的完整內容（與 LINE / Email 同一份） */}
      <div style={{ background: "#fff", borderRadius: 11, overflow: "hidden", boxShadow: "0 5px 18px rgba(0,0,0,.22)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderBottom: "1px solid #eef2f2" }}>
          <span style={{ fontSize: 22 }}>{cur.icon || "📬"}</span>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: "#0a2027", lineHeight: 1.35 }}>{title}</div>
        </div>
        <div style={{ padding: "14px 15px 6px", color: "#0a2027" }}>
          {sub && <div style={{ fontSize: 12.5, color: "#0a8f86", fontWeight: 600, lineHeight: 1.7, marginBottom: 8 }}>{sub}</div>}
          {body && <div style={{ fontSize: 12.5, color: "#516268", lineHeight: 1.7, marginBottom: 11, whiteSpace: "pre-wrap" }}>{body}</div>}
          {EXTRA_LINES[cur.key] && (
            <ul style={{ marginBottom: 11, paddingLeft: 18, fontSize: 12, color: "#516268", lineHeight: 1.7 }}>
              {EXTRA_LINES[cur.key].map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          )}
          {sampleBody(cur.key) && (
            <div style={{ background: "#f4f9f8", border: "1px solid #e2efed", borderRadius: 9, padding: "11px 13px", marginBottom: 12 }}>
              {bodyLines(cur.key).map((l, i) =>
                typeof l === "string"
                  ? <div key={i} style={{ fontSize: 12, padding: "3px 0", color: "#516268" }}>{l}</div>
                  : <DataRow key={i} k={l.k} v={l.v} />,
              )}
            </div>
          )}
          {hint && <div style={{ textAlign: "center", fontSize: 12, color: "#0a8f86", fontWeight: 600, marginBottom: 12 }}>{hint}</div>}
          {/* v480：站內通知詳情視窗底部固定按鈕 — 有連結顯示「前往查看」、無連結顯示「關閉通知」（非按鈕文字欄位） */}
          <span style={{ display: "inline-block", background: "var(--color-coral, #FF7B5A)", color: "#fff", padding: "8px 20px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
            前往查看 →
          </span>
          <span style={{ fontSize: 10.5, color: "#9aabae", marginLeft: 8 }}>無連結時顯示「關閉通知」</span>
        </div>
        <div style={{ padding: "10px 15px", borderTop: "1px solid #eef2f2", fontSize: 10, color: "#9aabae" }}>
          🔔 客戶在 LIFF 個人中心「訊息通知」收到，點開即看到上面完整內容
        </div>
      </div>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 6, textAlign: "center" }}>
        ※ 內容與 LINE / Email 一致；列表先顯示標題，點擊展開完整內容＋紅點未讀數。
      </p>

      <button
        onClick={onTest}
        disabled={!cur.inAppEnabled || sending}
        style={{
          width: "100%", marginTop: 6, border: "none", borderRadius: 9, padding: 10,
          fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
          cursor: cur.inAppEnabled && !sending ? "pointer" : "not-allowed",
          background: cur.inAppEnabled ? "linear-gradient(120deg,#13b5a6,#1ed4c2)" : "#3a5a60",
          color: cur.inAppEnabled ? "#04323a" : "#9fc6c2",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}
      >
        📬 {sending ? "送出中..." : "試送站內通知到我"}
      </button>
    </div>
  );
}

function DataRow({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", color: "#516268" }}>
      <span>{k}</span>
      <b style={{ color: "#0a2027" }}>{v}</b>
    </div>
  );
}

// ─── styles ─────────────────────────────────────────────────────
const hintbarStyle: React.CSSProperties = {
  background: "#eef3f5", border: "1px solid #e1ebeb", borderRadius: 12,
  color: "#4a6168", fontSize: 12.5, lineHeight: 1.6,
  padding: "12px 16px", marginBottom: 14, flexShrink: 0,
};
const paneStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #e1ebeb", borderRadius: 14,
  display: "flex", flexDirection: "column", overflow: "hidden",
  boxShadow: "0 1px 3px rgba(6,38,46,.04),0 10px 24px rgba(6,38,46,.05)",
  minHeight: 0,
};
const paneHeadStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 9,
  padding: "12px 15px", borderBottom: "1px solid #e1ebeb",
  background: "linear-gradient(180deg,#fbfdfd,#f4f9f8)", flex: "none",
};
const paneNumStyle: React.CSSProperties = {
  width: 22, height: 22, borderRadius: 7,
  display: "grid", placeItems: "center",
  fontWeight: 800, fontSize: 12,
  background: "linear-gradient(140deg,#13b5a6,#0e4c5a)", color: "#fff",
  flex: "none",
};
const paneSubStyle: React.CSSProperties = {
  fontSize: 11, color: "#9aabae", marginLeft: "auto", fontWeight: 500,
};
const paneBodyStyle: React.CSSProperties = { flex: 1, overflowY: "auto", padding: 10 };
const navGroupStyle: React.CSSProperties = {
  fontSize: 10, letterSpacing: 1.5, color: "#9aabae",
  padding: "11px 10px 5px", fontWeight: 700,
};
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1.5px solid #e1ebeb", borderRadius: 10,
  padding: "9px 12px", fontSize: 13, fontFamily: "inherit",
  color: "#0a2027", background: "#fff", outline: "none",
};
