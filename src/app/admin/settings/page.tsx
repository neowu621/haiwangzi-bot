"use client";
import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/version";
import { DEFAULT_CANCELLATION_POLICY, DEFAULT_SAFETY_POLICY } from "@/lib/default-policies";
import { ExternalLink, Save, Send, RefreshCw, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VipTiersEditor } from "@/components/admin-web/VipTiersEditor"; // v345

/* ─── Types ─────────────────────────────────────────── */
interface GearPrices {
  BCD: number;
  regulator: number;
  wetsuit: number;
  fins: number;
  mask: number;
  computer: number;
  full_set: number;
}

interface TripPricing {
  baseTrip: number;
  extraTank: number;
  nightDive: number;
  scooterRental: number;
}

interface VipUpgradeCredits {
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

interface ExternalLinks {
  fbGroupUrl?: string;
  mediaUrl?: string;
  youtubeChannelUrl?: string;
  instagramUrl?: string;
  lineOaQrUrl?: string;       // LINE OA 加好友 QR Code 圖片 URL
}

interface PaymentInfo {
  bank?: { name?: string; branch?: string; account?: string; holder?: string };
  linepay?: { qrUrl?: string; liteId?: string };
}

interface Config {
  // Homepage
  heroTitle: string;
  heroSubtitle: string;
  heroGreeting: string;
  footerSloganZh: string;
  footerSloganEn: string;
  splashEnabled: boolean;
  splashDurationMs: number;
  splashCooldownMs: number;
  weatherAutoCancel: boolean;
  // Money
  gearRentalPrices: Partial<GearPrices>;
  defaultTripPricing: Partial<TripPricing>;
  defaultCoachFee: number;
  birthdayCreditAmount: number;
  birthdayCreditExpiryDays: number;       // v184：生日抵用金有效天數（0 = 永不過期）
  vipUpgradeCreditExpiryDays: number;     // v185：VIP 升等獎勵抵用金有效天數
  adminGrantCreditExpiryDays: number;     // v185：admin 手動發抵用金的預設有效天數
  refundCreditExpiryDays: number;         // v185：退款轉抵用金有效天數
  vipUpgradeCredits: Partial<VipUpgradeCredits>;
  weatherWindThreshold: number;
  // 外部連結（Rich Menu / LIFF 用）
  externalLinks: ExternalLinks;
  // 付款資訊
  paymentInfo: PaymentInfo;
  // v227：取消政策（純文字，FAQ + 預約頁同步顯示）
  cancellationPolicy: string;
  // v257：安全政策（純文字，FAQ + 預約頁同步顯示）
  safetyPolicy: string;
  // v261：首單付款獎勵
  firstOrderRewardAmount?: number;
  firstOrderRewardExpiryDays?: number;
  // v388：註冊禮金 + VIP5 滿級回饋
  signupRewardAmount?: number;
  signupRewardExpiryDays?: number;
  vipOverflowDives?: number;
  vipOverflowCredit?: number;
  // v264：自動發送（每日天氣回報）
  dailyWeatherReportEnabled?: boolean;
  dailyWeatherReportRecipients?: string[];
  dailyWeatherReportLastSentAt?: string | null;
  // v389：天氣回報時段（台灣時間）+ 內容開關
  weatherReportSlots?: Array<{ h: number; m: number }>;
  weatherReportContent?: { wind: boolean; temp: boolean; sessions: boolean; wave: boolean; forecast?: boolean };
  // v411：海象（浮標+潮位）整合
  weatherMarineEnabled?: boolean;
  weatherMarinePoints?: Array<{ label: string; buoyId: string; tideId: string }>;
  weatherMarineFields?: { waveHeight: boolean; waveDir: boolean; wavePeriod: boolean; seaTemp: boolean; current: boolean; tide: boolean };
  // v315：訂單日報
  dailyBriefingEnabled?: boolean;
  dailyBriefingIncludeCoaches?: boolean;
  // v391：場次 Dump 自動優惠開頭
  dumpPromoEnabled?: boolean;
  dumpPromoText?: string;
  // v392：氣瓶限時折扣
  tankPromoEnabled?: boolean;
  tankPromoDiscount?: number;
  tankPromoReason?: string;
  tankPromoStart?: string | null;
  tankPromoEnd?: string | null;
  // v403：首頁「最新動態」影片清單 + 模式
  homeVideosMode?: "curated" | "auto";
  homeVideos?: Array<{ id: string; title: string; isShort: boolean }>;
  // v406：最新動態進階
  homeVideoFeaturedId?: string;
  homeVideoCount?: number;
  homeVideoExcludeIds?: string[];
  homeVideoFilter?: "all" | "long";
  // v409：首頁「學員怎麼說」6 格
  homeTestimonials?: Array<{ name: string; avatar: string; activity: string; title: string; text: string }>;
  homeReviewsNote?: string;
}

// v403：把 YouTube URL/Shorts/11 碼 id → { id, isShort }；無法 parse 回 null
function parseYtUrl(raw: string): { id: string; isShort: boolean } | null {
  const s = raw.trim();
  if (!s) return null;
  const idOnly = s.match(/^[A-Za-z0-9_-]{11}$/);
  if (idOnly) return { id: idOnly[0], isShort: false };
  let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return { id: m[1], isShort: false };
  m = s.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
  if (m) return { id: m[1], isShort: true };
  m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return { id: m[1], isShort: false };
  m = s.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (m) return { id: m[1], isShort: false };
  return null;
}

// v391：Dump 優惠開頭預設文案（老闆可在系統設定編輯）
const DEFAULT_DUMP_PROMO = `🔥🔥 海王子線上預約正式開航！ 🔥🔥
別再等別人揪，自己動手最快！手機點一點，好康通通帶走 🐬
💰 註冊就送 $50、生日紅包 $100（晚了也補、汪汪不食言🐶）、首潛完再爽領 $100
⚡ 加碼！6 月底前 每支氣瓶現折 $25，潛越多省越多！`;

const DEFAULT_GEAR: GearPrices = {
  BCD: 200, regulator: 200, wetsuit: 300, fins: 100,
  mask: 100, computer: 300, full_set: 800,
};
const GEAR_LABELS: Record<keyof GearPrices, string> = {
  BCD: "BCD", regulator: "調節器", wetsuit: "防寒衣",
  fins: "蛙鞋", mask: "面鏡", computer: "潛水電腦錶", full_set: "整套優惠",
};
const DEFAULT_TRIP: TripPricing = {
  baseTrip: 1200, extraTank: 500, nightDive: 0, scooterRental: 0,
};
// v346：場次預設定價 UI 移除（不需初始設定），但 defaultTripPricing 仍保留現值寫回

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "var(--border)" }}>
      <h2 className="mb-4 text-base font-semibold text-[var(--foreground)]">
        {title}
      </h2>
      {children}
    </div>
  );
}

// v391：抵用金表格用的小徽章
function CreditBadge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{text}</span>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
      <Label className="text-sm text-[var(--foreground)]">{label}</Label>
      {children}
    </div>
  );
}

// 精簡金額欄位：label 與輸入框同一行，縮減垂直高度
function CompactNum({
  label, value, onChange, min = 0, max, labelW = "w-24",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  labelW?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className={cn("shrink-0 text-[11px] leading-tight text-[var(--muted-foreground)]", labelW)}>{label}</Label>
      <div className="min-w-0 flex-1">
        <NumberInput min={min} max={max} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function SettingsPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  // v345：支援 ?tab= 直接開特定分頁（VIP 設定從舊頁 redirect 進來時用）
  const [activeTab, setActiveTab] = useState("home");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    const valid = ["home", "links", "payment", "money", "vip", "upload", "policy", "autosend", "danger", "tools"];
    if (t && valid.includes(t)) setActiveTab(t);
  }, []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetResult, setResetResult] = useState<string | null>(null);
  const [resetInitialBusy, setResetInitialBusy] = useState(false);
  const [resetInitialResult, setResetInitialResult] = useState<string | null>(null);


  const load = useCallback(async () => {
    try {
      const data = await adminFetch<{ config: Config }>("/api/admin/site-config");
      // v239：取消政策 DB 為空時，預填系統預設文字，方便 owner 在原文上修改
      const cfgWithDefaults: Config = {
        ...data.config,
        cancellationPolicy: data.config.cancellationPolicy?.trim()
          ? data.config.cancellationPolicy
          : DEFAULT_CANCELLATION_POLICY,
        safetyPolicy: data.config.safetyPolicy?.trim()
          ? data.config.safetyPolicy
          : DEFAULT_SAFETY_POLICY,
      };
      setCfg(cfgWithDefaults);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(section: string, patch: Partial<Config>) {
    setSaving(section); setErr(null); setOk(null);
    try {
      await adminFetch("/api/admin/site-config", { method: "POST", body: JSON.stringify(patch) });
      setOk(`${section}已儲存`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(null);
    }
  }

  // v388：一次性補發註冊禮金給「已驗證但未領過」的現有會員
  // v393：一鍵補發（註冊 / 生日）— 先 dry-run 列出名單再確認發送
  async function runBackfill(kind: "signup" | "birthday") {
    setErr(null); setOk(null);
    const ep = kind === "signup"
      ? "/api/admin/backfill-signup-reward"
      : "/api/admin/backfill-birthday-credits";
    const label = kind === "signup" ? "註冊禮金" : "生日禮金";
    try {
      const dry = await adminFetch<{ skipped?: boolean; reason?: string; amount?: number; eligibleCount?: number; totalCredit?: number; members?: string[] }>(ep);
      if (dry.skipped) { alert(`無法補發：${dry.reason}`); return; }
      if (!dry.eligibleCount) { alert(`沒有需要補發${label}的會員。`); return; }
      const names = dry.members ?? [];
      const shown = names.slice(0, 40).map((n, i) => `${i + 1}. ${n}`).join("\n");
      const more = names.length > 40 ? `\n…等共 ${names.length} 位` : "";
      if (!window.confirm(
        `【補發${label}】將發給以下 ${dry.eligibleCount} 位，每位 NT$${dry.amount}，合計 NT$${dry.totalCredit}：\n\n${shown}${more}\n\n確定執行？`,
      )) return;
      const r = await adminFetch<{ grantedCount: number; totalCredit: number; failedCount: number }>(ep, { method: "POST" });
      setOk(`✅ ${label}補發完成：${r.grantedCount} 位、合計 NT$${r.totalCredit}${r.failedCount ? `（失敗 ${r.failedCount}）` : ""}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "補發失敗");
    }
  }

  async function resetAllData() {
    const typed = window.prompt(
      "⚠️ 此操作將永久刪除所有訂單、日潛場次、潛水團，無法復原！\n\n請輸入「確認刪除」繼續："
    );
    if (typed !== "確認刪除") {
      alert("取消操作，未刪除任何資料。");
      return;
    }
    setResetBusy(true);
    setResetResult(null);
    setErr(null);
    try {
      const r = await adminFetch<{
        ok: boolean;
        deleted: { bookings: number; trips: number; tours: number };
      }>("/api/admin/reset-data", {
        method: "POST",
        body: JSON.stringify({ confirm: "DELETE ALL DATA" }),
      });
      setResetResult(
        `✅ 刪除完成：訂單 ${r.deleted.bookings} 筆、日潛場次 ${r.deleted.trips} 筆、潛水團 ${r.deleted.tours} 筆`
      );
    } catch (e) {
      setErr("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setResetBusy(false);
    }
  }

  async function resetToInitial() {
    const typed = window.prompt(
      "🚨 系統初始重置：將清空所有營運資料（訂單、場次、潛水團、付款憑證、教練、潛點、提醒紀錄、訊息範本、操作紀錄、媒體照片）並把會員的衍生欄位（VIP 等級、累計消費、抵用金餘額）歸零。\n\n保留：會員帳號（lineUserId, displayName, role 等）+ 系統設定。\n\n此操作不可復原！請輸入「系統初始重置」繼續："
    );
    if (typed !== "系統初始重置") {
      alert("取消操作，未刪除任何資料。");
      return;
    }
    setResetInitialBusy(true);
    setResetInitialResult(null);
    setErr(null);
    try {
      const r = await adminFetch<{
        ok: boolean;
        deleted: Record<string, number>;
      }>("/api/admin/reset-data/system-initial", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET TO INITIAL" }),
      });
      const lines = [
        `✅ 系統初始重置完成：`,
        `• 訂單 ${r.deleted.bookings} 筆`,
        `• 日潛場次 ${r.deleted.trips} 筆`,
        `• 潛水團 ${r.deleted.tours} 筆`,
        `• 付款憑證 ${r.deleted.paymentProofs} 筆`,
        `• 教練 ${r.deleted.coaches} 位`,
        `• 潛點 ${r.deleted.sites} 個`,
        `• 抵用金交易 ${r.deleted.creditTxs} 筆`,
        `• 提醒紀錄 ${r.deleted.reminderLogs} 筆`,
        `• 訊息範本 ${r.deleted.templates} 筆`,
        `• 操作紀錄 ${r.deleted.audits} 筆`,
        `• 媒體照片 ${r.deleted.tripPhotos + r.deleted.tripMedia} 張`,
        `• 已重設 ${r.deleted.usersReset} 位會員的衍生欄位（VIP/累計/抵用金）`,
      ];
      setResetInitialResult(lines.join("\n"));
    } catch (e) {
      setErr("系統初始重置失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setResetInitialBusy(false);
    }
  }

  async function sendTestEmail() {
    setSaving("email"); setErr(null); setOk(null);
    try {
      await adminFetch("/api/admin/email/test", {
        method: "POST",
        body: JSON.stringify({ to: emailTarget || undefined }),
      });
      setOk("測試信已寄出");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "寄送失敗");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
      </AdminShell>
    );
  }
  if (!cfg) {
    return (
      <AdminShell>
        <div className="rounded-xl border p-5 text-sm bg-white" style={{ borderColor: "var(--border)", color: "var(--color-coral)" }}>
          {err ?? "載入失敗"}
        </div>
      </AdminShell>
    );
  }

  const gear = { ...DEFAULT_GEAR, ...(cfg.gearRentalPrices as Partial<GearPrices>) };
  const trip = { ...DEFAULT_TRIP, ...(cfg.defaultTripPricing as Partial<TripPricing>) };
  const vipCredits: Record<string, number> = {
    "2": 200, "3": 500, "4": 1000, "5": 2000,
    ...(cfg.vipUpgradeCredits as Record<string, number> ?? {}),
  };

  return (
    <AdminShell>
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Status */}
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
        {ok && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {ok}</div>}

        {/* v255/v345：9 大分類 Tab 切換（含 ⭐ VIP）；支援 ?tab= 直接開特定分頁 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-10">
            <TabsTrigger value="home">🏠 首頁</TabsTrigger>
            <TabsTrigger value="links">🔗 連結</TabsTrigger>
            <TabsTrigger value="payment">💳 付款</TabsTrigger>
            <TabsTrigger value="money">💰 金額</TabsTrigger>
            <TabsTrigger value="vip">⭐ VIP</TabsTrigger>
            <TabsTrigger value="upload">📤 上傳</TabsTrigger>
            <TabsTrigger value="policy">📋 政策</TabsTrigger>
            <TabsTrigger value="autosend">📨 自動發送</TabsTrigger>
            <TabsTrigger value="danger">⚠️ 危險</TabsTrigger>
            <TabsTrigger value="tools">🔧 工具</TabsTrigger>
          </TabsList>

        <TabsContent value="home" className="mt-4">
        {/* ── A. 首頁設定 ──────────────────── */}
        <SectionCard title="🏠 首頁設定">
          <div className="space-y-3">
            <FieldRow label="Hero 標題">
              <Input value={cfg.heroTitle} onChange={e => setCfg(c => c ? { ...c, heroTitle: e.target.value } : c)} />
            </FieldRow>
            <FieldRow label="Hero 副標（英）">
              <Input value={cfg.heroSubtitle} onChange={e => setCfg(c => c ? { ...c, heroSubtitle: e.target.value } : c)} />
            </FieldRow>
            <FieldRow label="打招呼語">
              <Input value={cfg.heroGreeting} onChange={e => setCfg(c => c ? { ...c, heroGreeting: e.target.value } : c)} />
            </FieldRow>
            <FieldRow label="Footer 標語（中）">
              <Input value={cfg.footerSloganZh} onChange={e => setCfg(c => c ? { ...c, footerSloganZh: e.target.value } : c)} />
            </FieldRow>
            <FieldRow label="Footer 標語（英）">
              <Input value={cfg.footerSloganEn} onChange={e => setCfg(c => c ? { ...c, footerSloganEn: e.target.value } : c)} />
            </FieldRow>
            <FieldRow label="天氣自動取消">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={cfg.weatherAutoCancel}
                  onChange={e => setCfg(c => c ? { ...c, weatherAutoCancel: e.target.checked } : c)}
                  className="h-4 w-4 accent-[var(--color-phosphor)]" />
                <span className="text-sm text-[var(--foreground)]">啟用（超過風速門檻自動取消場次）</span>
              </label>
            </FieldRow>
            <FieldRow label="Splash 動畫">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={cfg.splashEnabled}
                  onChange={e => setCfg(c => c ? { ...c, splashEnabled: e.target.checked } : c)}
                  className="h-4 w-4 accent-[var(--color-phosphor)]" />
                <span className="text-sm text-[var(--foreground)]">啟用</span>
              </label>
            </FieldRow>
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("首頁設定", {
                heroTitle: cfg.heroTitle, heroSubtitle: cfg.heroSubtitle, heroGreeting: cfg.heroGreeting,
                footerSloganZh: cfg.footerSloganZh, footerSloganEn: cfg.footerSloganEn,
                weatherAutoCancel: cfg.weatherAutoCancel, splashEnabled: cfg.splashEnabled,
              })}
              disabled={saving === "首頁設定"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "首頁設定" ? "儲存中..." : "儲存首頁設定"}
            </Button>
          </div>
        </SectionCard>

        {/* v403：首頁「最新動態」YouTube 影片清單 + 模式 */}
        <div className="mt-4">
          <HomeVideosCard cfg={cfg} setCfg={setCfg} save={save} saving={saving} />
        </div>

        {/* v414：學員怎麼說改為前台內建固定內容，後台編輯已移除 */}
        </TabsContent>

        <TabsContent value="links" className="mt-4">
        {/* ── A2. 外部連結（Rich Menu / FAQ 用）────── */}
        <SectionCard title="🔗 外部連結（Rich Menu / 客戶端用）">
          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            這些連結會被 LINE Rich Menu 與 LIFF 引用。修改後需重新同步 Rich Menu 才會生效。
          </p>
          <div className="grid grid-cols-1 gap-3">
            <FieldRow label="Facebook 社團">
              <Input
                value={cfg?.externalLinks?.fbGroupUrl ?? ""}
                onChange={(e) => setCfg((c) => c ? { ...c, externalLinks: { ...(c.externalLinks ?? {}), fbGroupUrl: e.target.value } } : c)}
                placeholder="https://www.facebook.com/groups/xxxxx"
              />
            </FieldRow>
            <FieldRow label="最新動態">
              <Input
                value={cfg?.externalLinks?.mediaUrl ?? ""}
                onChange={(e) => setCfg((c) => c ? { ...c, externalLinks: { ...(c.externalLinks ?? {}), mediaUrl: e.target.value } } : c)}
                placeholder="https://www.instagram.com/xxx 或 IG/FB/YouTube/部落格網址"
              />
            </FieldRow>
            <FieldRow label="YouTube 頻道">
              <Input
                value={cfg?.externalLinks?.youtubeChannelUrl ?? ""}
                onChange={(e) => setCfg((c) => c ? { ...c, externalLinks: { ...(c.externalLinks ?? {}), youtubeChannelUrl: e.target.value } } : c)}
                placeholder="https://www.youtube.com/@xxxxx（選填）"
              />
            </FieldRow>
            <FieldRow label="Instagram">
              <Input
                value={cfg?.externalLinks?.instagramUrl ?? ""}
                onChange={(e) => setCfg((c) => c ? { ...c, externalLinks: { ...(c.externalLinks ?? {}), instagramUrl: e.target.value } } : c)}
                placeholder="https://www.instagram.com/xxxxx（選填）"
              />
            </FieldRow>
            <FieldRow label="LINE OA QR 圖片">
              <Input
                value={cfg?.externalLinks?.lineOaQrUrl ?? ""}
                onChange={(e) => setCfg((c) => c ? { ...c, externalLinks: { ...(c.externalLinks ?? {}), lineOaQrUrl: e.target.value } } : c)}
                placeholder="https://i.imgur.com/xxxx.png（首頁 / 加好友頁顯示用）"
              />
            </FieldRow>
            {cfg?.externalLinks?.lineOaQrUrl && (
              <div className="grid grid-cols-[10rem_1fr] items-start gap-3">
                <span className="text-sm text-[var(--muted-foreground)]">QR 預覽</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cfg.externalLinks.lineOaQrUrl}
                  alt="LINE OA QR"
                  className="h-32 w-32 rounded border object-contain bg-white"
                  style={{ borderColor: "var(--border)" }}
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => save("外部連結", {
                externalLinks: cfg?.externalLinks ?? {},
              })}
              disabled={saving === "外部連結"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "外部連結" ? "儲存中..." : "儲存外部連結"}
            </Button>
          </div>
        </SectionCard>

        </TabsContent>

        <TabsContent value="payment" className="mt-4">
        {/* ── A3. 付款資訊（銀行 + LINE Pay）─────────── */}
        <SectionCard title="💳 付款資訊（客戶下單時顯示）">
          {/* 銀行匯款 */}
          <div className="mb-5">
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">🏦 銀行匯款</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FieldRow label="銀行名稱">
                <Input
                  value={cfg?.paymentInfo?.bank?.name ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), bank: { ...(c.paymentInfo?.bank ?? {}), name: e.target.value } } } : c)}
                  placeholder="例：中信"
                />
              </FieldRow>
              <FieldRow label="分行代碼">
                <Input
                  value={cfg?.paymentInfo?.bank?.branch ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), bank: { ...(c.paymentInfo?.bank ?? {}), branch: e.target.value } } } : c)}
                  placeholder="例：822"
                />
              </FieldRow>
              <FieldRow label="帳號">
                <Input
                  value={cfg?.paymentInfo?.bank?.account ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), bank: { ...(c.paymentInfo?.bank ?? {}), account: e.target.value } } } : c)}
                  placeholder="例：484540139251"
                />
              </FieldRow>
              <FieldRow label="戶名">
                <Input
                  value={cfg?.paymentInfo?.bank?.holder ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), bank: { ...(c.paymentInfo?.bank ?? {}), holder: e.target.value } } } : c)}
                  placeholder="例：汪承儒"
                />
              </FieldRow>
            </div>
          </div>

          {/* LINE Pay 半手動 */}
          <div className="mb-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-1 text-sm font-medium text-[var(--foreground)]">💚 LINE Pay（半手動）</p>
            <p className="mb-3 text-xs text-[var(--muted-foreground)]">
              客戶選 LINE Pay 時，會看到下方 QR 圖片 + LINE Pay ID，可直接轉帳給老闆。客戶完成轉帳後需上傳截圖。
            </p>
            <div className="space-y-3">
              <FieldRow label="LINE Pay QR 圖片 URL">
                <Input
                  value={cfg?.paymentInfo?.linepay?.qrUrl ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), linepay: { ...(c.paymentInfo?.linepay ?? {}), qrUrl: e.target.value } } } : c)}
                  placeholder="https://i.imgur.com/xxxxx.png 或其他圖床網址"
                />
              </FieldRow>
              <FieldRow label="LINE Pay ID">
                <Input
                  value={cfg?.paymentInfo?.linepay?.liteId ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), linepay: { ...(c.paymentInfo?.linepay ?? {}), liteId: e.target.value } } } : c)}
                  placeholder="例：a26463030（老闆個人 LINE Pay ID）"
                />
              </FieldRow>
              {cfg?.paymentInfo?.linepay?.qrUrl && (
                <div className="grid grid-cols-[10rem_1fr] items-start gap-3">
                  <span className="text-sm text-[var(--muted-foreground)]">QR 預覽</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cfg.paymentInfo.linepay.qrUrl} alt="LINE Pay QR" className="h-32 w-32 rounded border object-contain" style={{ borderColor: "var(--border)" }} />
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-[var(--muted-foreground)]">
              💡 取得 QR 步驟：開 LINE Pay → 個人 → 收款 QR → 截圖上傳到 Imgur 等圖床 → 把圖片 URL 貼到上方。
            </p>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => save("付款資訊", {
                paymentInfo: cfg?.paymentInfo ?? {},
              })}
              disabled={saving === "付款資訊"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "付款資訊" ? "儲存中..." : "儲存付款資訊"}
            </Button>
          </div>
        </SectionCard>

        </TabsContent>

        <TabsContent value="money" className="mt-4">
        {/* ── B. 金額設定 ──────────────────── */}
        <SectionCard title="💰 金額設定">

          {/* B1 裝備租借 — v391：橫式表（項目一行、價格一行） */}
          <div className="mb-5">
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">🤿 裝備租借費率（NT$）</p>
            <div className="overflow-x-auto">
              <table className="border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border bg-[var(--muted)] px-2 py-2 text-xs font-bold whitespace-nowrap text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>裝備項目</th>
                    {(Object.keys(GEAR_LABELS) as Array<keyof GearPrices>).map(key => (
                      <th key={key} className="border bg-[var(--muted)] px-2 py-2 text-xs font-bold whitespace-nowrap text-center" style={{ borderColor: "var(--border)" }}>{GEAR_LABELS[key]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border bg-[#f8fafc] px-2 py-1.5 text-xs font-bold whitespace-nowrap text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>設定價格</td>
                    {(Object.keys(GEAR_LABELS) as Array<keyof GearPrices>).map(key => (
                      <td key={key} className="border px-1.5 py-1.5" style={{ borderColor: "var(--border)" }}>
                        <div className="w-20">
                          <NumberInput min={0} value={gear[key]}
                            onChange={(n) => setCfg(c => c ? { ...c, gearRentalPrices: { ...gear, [key]: n } } : c)} />
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
              💡 VIP 會員租裝備時，依其等級的「裝備折扣%」自動打折（折扣% 在「⭐ VIP」分頁各級設定）。
            </p>
          </div>

          {/* B2 抵用金 / 優惠項目 — v391：統一表格（項目 / 抵用金 / 有效天數 / 觸發條件 / 說明） */}
          <div className="mb-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">🎁 抵用金 / 優惠項目</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: "var(--color-ocean-deep)" }}>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-white whitespace-nowrap">項目</th>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-white whitespace-nowrap">抵用金 (NT$)</th>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-white whitespace-nowrap">有效天數</th>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-white whitespace-nowrap">觸發條件</th>
                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-white">說明</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {/* 註冊禮金 */}
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">🎁 註冊禮金</td>
                    <td className="px-2 py-2"><div className="w-24"><NumberInput min={0} value={cfg.signupRewardAmount ?? 50}
                      onChange={(n) => setCfg(c => c ? { ...c, signupRewardAmount: n } : c)} /></div></td>
                    <td className="px-2 py-2"><div className="w-20"><NumberInput min={0} max={3650} value={cfg.signupRewardExpiryDays ?? 0}
                      onChange={(n) => setCfg(c => c ? { ...c, signupRewardExpiryDays: n } : c)} /></div></td>
                    <td className="px-2 py-2 whitespace-nowrap">Email 驗證後<br /><CreditBadge text="一生一次" cls="bg-amber-100 text-amber-800" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">
                      驗證 Email 即發。
                      <Button size="sm" variant="outline" className="ml-1 h-6 px-2 text-[10px]" onClick={() => void runBackfill("signup")}>🎁 一鍵補發（列名單）</Button>
                    </td>
                  </tr>
                  {/* 生日禮金 */}
                  <tr className="border-b bg-[#fafbfc]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">🎂 生日禮金</td>
                    <td className="px-2 py-2"><div className="w-24"><NumberInput min={0} value={cfg.birthdayCreditAmount}
                      onChange={(n) => setCfg(c => c ? { ...c, birthdayCreditAmount: n } : c)} /></div></td>
                    <td className="px-2 py-2"><div className="w-20"><NumberInput min={0} max={3650} value={cfg.birthdayCreditExpiryDays ?? 360}
                      onChange={(n) => setCfg(c => c ? { ...c, birthdayCreditExpiryDays: n } : c)} /></div></td>
                    <td className="px-2 py-2 whitespace-nowrap">每月 1 號發壽星<br /><CreditBadge text="一年一次" cls="bg-blue-100 text-blue-800" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">
                      生日填一次後客戶不可改；未填不發。
                      <Button size="sm" variant="outline" className="ml-1 h-6 px-2 text-[10px]" onClick={() => void runBackfill("birthday")}>🎂 一鍵補發（列名單）</Button>
                    </td>
                  </tr>
                  {/* 首單獎勵 */}
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">🎉 首單獎勵</td>
                    <td className="px-2 py-2 text-[11px] font-semibold text-violet-700 whitespace-nowrap">→ VIP 分頁</td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)]">同 VIP</td>
                    <td className="px-2 py-2 whitespace-nowrap">首次出席後<br /><CreditBadge text="自動" cls="bg-emerald-100 text-emerald-800" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">金額在「⭐ VIP / LV1 新客禮」設定；第一次潛水完成發。</td>
                  </tr>
                  {/* VIP 升等獎勵 */}
                  <tr className="border-b bg-[#fafbfc]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">⭐ VIP 升等獎勵</td>
                    <td className="px-2 py-2 text-[11px] font-semibold text-violet-700 whitespace-nowrap">→ VIP 分頁</td>
                    <td className="px-2 py-2"><div className="w-20"><NumberInput min={0} max={3650} value={cfg.vipUpgradeCreditExpiryDays ?? 360}
                      onChange={(n) => setCfg(c => c ? { ...c, vipUpgradeCreditExpiryDays: n } : c)} /></div></td>
                    <td className="px-2 py-2 whitespace-nowrap">升到新等級時<br /><CreditBadge text="升等" cls="bg-violet-100 text-violet-700" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">LV2~LV5 各級金額在「⭐ VIP」分頁設定。</td>
                  </tr>
                  {/* VIP 滿級回饋 */}
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">🏆 VIP 滿級回饋</td>
                    <td className="px-2 py-2 text-[11px] font-semibold text-violet-700 whitespace-nowrap">→ VIP 分頁</td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)]">同 VIP</td>
                    <td className="px-2 py-2 whitespace-nowrap">LV5 後每滿 N 潛<br /><CreditBadge text="滿級" cls="bg-violet-100 text-violet-700" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">「每 N 潛 / 回饋 M 元」在「⭐ VIP」分頁設定。</td>
                  </tr>
                  {/* Admin 手動發放 */}
                  <tr className="border-b bg-[#fafbfc]" style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">🛠 Admin 手動發放</td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] italic whitespace-nowrap">發放時填</td>
                    <td className="px-2 py-2"><div className="w-20"><NumberInput min={0} max={3650} value={cfg.adminGrantCreditExpiryDays ?? 360}
                      onChange={(n) => setCfg(c => c ? { ...c, adminGrantCreditExpiryDays: n } : c)} /></div></td>
                    <td className="px-2 py-2 whitespace-nowrap">老闆手動<br /><CreditBadge text="手動" cls="bg-slate-100 text-slate-600" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">此為預設效期；發放時可個別覆寫。</td>
                  </tr>
                  {/* 退款轉抵用金 */}
                  <tr style={{ borderColor: "var(--border)" }}>
                    <td className="px-2 py-2 font-bold whitespace-nowrap">💰 退款轉抵用金</td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] italic whitespace-nowrap">退款時填</td>
                    <td className="px-2 py-2"><div className="w-20"><NumberInput min={0} max={3650} value={cfg.refundCreditExpiryDays ?? 0}
                      onChange={(n) => setCfg(c => c ? { ...c, refundCreditExpiryDays: n } : c)} /></div></td>
                    <td className="px-2 py-2 whitespace-nowrap">退款時決定<br /><CreditBadge text="手動" cls="bg-slate-100 text-slate-600" /></td>
                    <td className="px-2 py-2 text-[var(--muted-foreground)] leading-relaxed">金額/比例由老闆個案決定，非自動。通常效期設 0（不限期）。</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
              天數欄：0 = 永不過期；發放 N 天內未使用自動過期。<span className="text-violet-700 font-semibold">→ VIP 分頁</span> 的項目在「⭐ VIP」分頁設定金額。
              ※ 教練預設費用、天氣取消風速門檻已移出本頁（風速門檻歸到「🌤 天氣」分頁，未來處理）。
            </p>
          </div>

          {/* v345：VIP 升等獎金已移至「⭐ VIP」tab。v391：教練預設費用 / 天氣風速門檻 input 暫移除，值仍保留於存檔 */}

          <div className="flex justify-end">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("金額設定", {
                gearRentalPrices: gear,
                defaultTripPricing: trip,
                defaultCoachFee: cfg.defaultCoachFee,
                birthdayCreditAmount: cfg.birthdayCreditAmount,
                birthdayCreditExpiryDays: cfg.birthdayCreditExpiryDays ?? 360,
                signupRewardAmount: cfg.signupRewardAmount ?? 50,
                signupRewardExpiryDays: cfg.signupRewardExpiryDays ?? 0,
                vipUpgradeCreditExpiryDays: cfg.vipUpgradeCreditExpiryDays ?? 360,
                adminGrantCreditExpiryDays: cfg.adminGrantCreditExpiryDays ?? 360,
                refundCreditExpiryDays: cfg.refundCreditExpiryDays ?? 0,
                weatherWindThreshold: cfg.weatherWindThreshold,
                vipUpgradeCredits: vipCredits,
              })}
              disabled={saving === "金額設定"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "金額設定" ? "儲存中..." : "儲存金額設定"}
            </Button>
          </div>
        </SectionCard>

        {/* v391：場次 Dump 自動優惠開頭 */}
        <div className="mt-4">
          <SectionCard title="📣 場次 Dump 優惠開頭">
            <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              開啟後，場次管理「Dump 一週場次」貼到 LINE 的文字最上方會自動帶出這段優惠 + 分隔線（不用每次手貼）。
            </p>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4"
                checked={cfg.dumpPromoEnabled ?? false}
                onChange={(e) => setCfg(c => c ? { ...c, dumpPromoEnabled: e.target.checked } : c)} />
              啟用 Dump 優惠開頭
            </label>
            <textarea
              className="w-full rounded-md border p-2 text-sm font-mono leading-relaxed"
              style={{ borderColor: "var(--border)" }}
              rows={6}
              placeholder="輸入優惠文案…"
              value={cfg.dumpPromoText ?? ""}
              onChange={(e) => setCfg(c => c ? { ...c, dumpPromoText: e.target.value } : c)} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline"
                onClick={() => setCfg(c => c ? { ...c, dumpPromoText: DEFAULT_DUMP_PROMO } : c)}>
                套用預設文案
              </Button>
              <span className="text-[10px] text-[var(--muted-foreground)]">最多 2000 字；換行會保留。</span>
              <Button size="sm" className="ml-auto" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                onClick={() => save("Dump 優惠開頭", {
                  dumpPromoEnabled: cfg.dumpPromoEnabled ?? false,
                  dumpPromoText: cfg.dumpPromoText ?? "",
                })}
                disabled={saving === "Dump 優惠開頭"}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving === "Dump 優惠開頭" ? "儲存中..." : "儲存優惠開頭"}
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* v392：氣瓶限時折扣 */}
        <div className="mt-4">
          <SectionCard title="🔥 氣瓶限時折扣（自動套用）">
            <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              開啟後，日潛下單時每支氣瓶自動折抵設定金額（潛水費 = (每瓶費 − 折抵) × 瓶數 × 人數），只折氣瓶、不折附加/裝備。可設理由與起訖日，過期自動失效。
            </p>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4"
                checked={cfg.tankPromoEnabled ?? false}
                onChange={(e) => setCfg(c => c ? { ...c, tankPromoEnabled: e.target.checked } : c)} />
              啟用氣瓶折扣
            </label>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <CompactNum label="每支折抵（NT$）" labelW="w-32" value={cfg.tankPromoDiscount ?? 0}
                onChange={(n) => setCfg(c => c ? { ...c, tankPromoDiscount: n } : c)} />
            </div>
            <div className="mt-2">
              <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">折扣理由（會顯示給客戶）</Label>
              <Input value={cfg.tankPromoReason ?? ""} placeholder="例：海王子線上預約開航慶 加碼！6月底前每支氣瓶現折 $25"
                onChange={(e) => setCfg(c => c ? { ...c, tankPromoReason: e.target.value } : c)} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">開始日（留空＝即刻）</Label>
                <Input type="date"
                  value={cfg.tankPromoStart ? new Date(cfg.tankPromoStart).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) : ""}
                  onChange={(e) => setCfg(c => c ? { ...c, tankPromoStart: e.target.value ? new Date(e.target.value + "T00:00:00+08:00").toISOString() : null } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">結束日（留空＝不限）</Label>
                <Input type="date"
                  value={cfg.tankPromoEnd ? new Date(cfg.tankPromoEnd).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }) : ""}
                  onChange={(e) => setCfg(c => c ? { ...c, tankPromoEnd: e.target.value ? new Date(e.target.value + "T23:59:59+08:00").toISOString() : null } : c)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                onClick={() => save("氣瓶折扣", {
                  tankPromoEnabled: cfg.tankPromoEnabled ?? false,
                  tankPromoDiscount: cfg.tankPromoDiscount ?? 0,
                  tankPromoReason: cfg.tankPromoReason ?? "",
                  tankPromoStart: cfg.tankPromoStart ?? null,
                  tankPromoEnd: cfg.tankPromoEnd ?? null,
                })}
                disabled={saving === "氣瓶折扣"}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving === "氣瓶折扣" ? "儲存中..." : "儲存氣瓶折扣"}
              </Button>
            </div>
          </SectionCard>
        </div>

        </TabsContent>

        {/* v345：⭐ VIP — VIP 等級設定（含每等級的升級獎勵 = VIP 升等金額） */}
        <TabsContent value="vip" className="mt-4">
          {/* v346：首單付款獎勵 = LV1 新客禮，整合進 VIP tab */}
          <SectionCard title="🎁 LV1 新客禮（首單付款獎勵）">
            <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              新客戶第一筆訂單付款完成 + Email 已驗證 → 自動發抵用金（一人僅一次）。視為踏入 VIP LV1 的入會禮。
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <CompactNum label="金額（NT$，0=停用）" labelW="w-32" value={cfg.firstOrderRewardAmount ?? 100}
                onChange={(n) => setCfg(c => c ? { ...c, firstOrderRewardAmount: n } : c)} />
              <CompactNum label="有效天數（0=永不過期）" labelW="w-32" max={3650} value={cfg.firstOrderRewardExpiryDays ?? 360}
                onChange={(n) => setCfg(c => c ? { ...c, firstOrderRewardExpiryDays: n } : c)} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                onClick={() => save("LV1 新客禮", {
                  firstOrderRewardAmount: cfg.firstOrderRewardAmount ?? 100,
                  firstOrderRewardExpiryDays: cfg.firstOrderRewardExpiryDays ?? 360,
                })}
                disabled={saving === "LV1 新客禮"}>
                <Save className="mr-1.5 h-4 w-4" />
                {saving === "LV1 新客禮" ? "儲存中..." : "儲存新客禮"}
              </Button>
            </div>
          </SectionCard>

          {/* v388：VIP5 滿級回饋 */}
          <div className="mt-4">
            <SectionCard title="🦈 VIP5 滿級回饋">
              <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                會員升到最高級（LV5）後，每再累積 N 次潛水自動回饋抵用金（里程碑各發一次）。金額 0 = 停用。
              </p>
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                <CompactNum label="每 N 潛回饋" labelW="w-28" value={cfg.vipOverflowDives ?? 50}
                  onChange={(n) => setCfg(c => c ? { ...c, vipOverflowDives: n } : c)} />
                <CompactNum label="回饋金額（NT$，0=停用）" labelW="w-36" value={cfg.vipOverflowCredit ?? 1000}
                  onChange={(n) => setCfg(c => c ? { ...c, vipOverflowCredit: n } : c)} />
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                  onClick={() => save("VIP5 滿級回饋", {
                    vipOverflowDives: cfg.vipOverflowDives ?? 50,
                    vipOverflowCredit: cfg.vipOverflowCredit ?? 1000,
                  })}
                  disabled={saving === "VIP5 滿級回饋"}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {saving === "VIP5 滿級回饋" ? "儲存中..." : "儲存滿級回饋"}
                </Button>
              </div>
            </SectionCard>
          </div>

          <div className="mt-4">
            <SectionCard title="⭐ VIP 等級設定">
              <VipTiersEditor />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="mt-4">
        {/* ── B6. 檔案上傳設定（v230） ────────────── */}
        <SectionCard title="📤 檔案上傳設定">
          <UploadTestPanel />
        </SectionCard>

        {/* v302：儲存統計 + base64 → R2 遷移 */}
        <SectionCard title="📊 儲存狀態 / Base64 遷移">
          <StorageStatsPanel />
        </SectionCard>

        </TabsContent>

        <TabsContent value="policy" className="mt-4">
        {/* ── B5. 取消政策（v227） ───────────────── */}
        <SectionCard title="📋 取消政策">
          <p className="-mt-2 mb-2 text-[11px] text-[var(--muted-foreground)]">此文字會顯示在「常見問題」與「日潛預約頁」，admin 可自由編輯。</p>
          <div>
            <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">政策內容（純文字，支援多行）</Label>
            <textarea
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-mono"
              rows={14}
              placeholder="請輸入取消政策..."
              value={cfg.cancellationPolicy ?? ""}
              onChange={(e) => setCfg(c => c ? { ...c, cancellationPolicy: e.target.value } : c)}
            />
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              ※ 留空會用系統預設政策。建議用 📌 ☔ ⚠️ 等 emoji 區分條款分組。
            </p>
          </div>
          <div className="flex justify-end pt-3">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("取消政策", { cancellationPolicy: cfg.cancellationPolicy ?? "" })}
              disabled={saving === "取消政策"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "取消政策" ? "儲存中..." : "儲存取消政策"}
            </Button>
          </div>
        </SectionCard>

        {/* ── v257：安全政策 ───────────────── */}
        <SectionCard title="🛡️ 安全政策">
          <p className="-mt-2 mb-2 text-[11px] text-[var(--muted-foreground)]">此文字會顯示在「常見問題」與「預約頁」，admin 可自由編輯。內容含潛水健康注意、活動當日守則、活動紀錄授權、保險建議。</p>
          <div>
            <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">政策內容（純文字，支援多行）</Label>
            <textarea
              className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-mono"
              rows={20}
              placeholder="請輸入安全政策..."
              value={cfg.safetyPolicy ?? ""}
              onChange={(e) => setCfg(c => c ? { ...c, safetyPolicy: e.target.value } : c)}
            />
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              ※ 留空會用系統預設政策。可貼上含 URL 的條文（FAQ 會自動把 https:// 開頭轉為可點連結）。
            </p>
          </div>
          <div className="flex justify-end pt-3">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("安全政策", { safetyPolicy: cfg.safetyPolicy ?? "" })}
              disabled={saving === "安全政策"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "安全政策" ? "儲存中..." : "儲存安全政策"}
            </Button>
          </div>
        </SectionCard>

        </TabsContent>

        <TabsContent value="autosend" className="mt-4">
        <AutoSendSection cfg={cfg} setCfg={setCfg} save={save} saving={saving} />
        </TabsContent>

        <TabsContent value="danger" className="mt-4">
        {/* ── C. 危險操作 ──────────────────── */}
        <div className="rounded-xl border-2 p-5" style={{ borderColor: "var(--color-coral)", background: "rgba(255,80,65,0.04)" }}>
          <h2 className="mb-1 text-base font-semibold" style={{ color: "var(--color-coral)" }}>
            ⚠️ 危險操作
          </h2>
          <p className="mb-4 text-xs text-[var(--muted-foreground)]">
            以下操作不可復原，請謹慎使用。會員資料不受影響。
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3" style={{ borderColor: "var(--color-coral)" }}>
              <div>
                <div className="text-sm font-medium">清空所有訂單 / 日潛場次 / 潛水團</div>
                <div className="text-xs text-[var(--muted-foreground)]">刪除全部 Booking、DivingTrip、TourPackage 記錄，會員資料保留</div>
              </div>
              <Button
                size="sm"
                onClick={resetAllData}
                disabled={resetBusy}
                className="shrink-0 border-[var(--color-coral)] text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                variant="outline"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {resetBusy ? "刪除中..." : "清空資料"}
              </Button>
            </div>

            {resetResult && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                {resetResult}
              </p>
            )}

            {/* 系統初始重置 — 更徹底，連教練/潛點/抵用金紀錄/訊息範本/操作紀錄都清掉，
                並把會員 VIP/累計/抵用金歸零（保留會員帳號本身） */}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3" style={{ borderColor: "var(--color-coral)" }}>
              <div>
                <div className="text-sm font-medium">系統初始重置（保留會員帳號）</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  把系統回到剛部署狀態：清空所有營運資料 + 教練/潛點 + 抵用金紀錄 + 訊息範本 + 操作紀錄 + 媒體照片，並把會員的 VIP/累計消費/抵用金餘額歸零。會員帳號本身保留。
                </div>
              </div>
              <Button
                size="sm"
                onClick={resetToInitial}
                disabled={resetInitialBusy}
                className="shrink-0 border-[var(--color-coral)] bg-[var(--color-coral)] text-white hover:bg-[var(--color-coral)]/90"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {resetInitialBusy ? "重置中..." : "系統初始重置"}
              </Button>
            </div>

            {resetInitialResult && (
              <pre className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 whitespace-pre-wrap font-mono">
                {resetInitialResult}
              </pre>
            )}
          </div>
        </div>

        </TabsContent>

        <TabsContent value="tools" className="mt-4">
        {/* ── D. 系統工具 ──────────────────── */}
        <SectionCard title="🔧 系統工具">
          <div className="space-y-4">
            {/* Version */}
            <FieldRow label="目前版本">
              <span className="rounded bg-[var(--muted)] px-2 py-1 font-mono text-sm" style={{ color: "#047857" }}>
                v{APP_VERSION}
              </span>
            </FieldRow>

            {/* Email test */}
            <FieldRow label="Email 測試">
              <div className="flex gap-2">
                <Input placeholder="(預設寄給自己)" value={emailTarget}
                  onChange={e => setEmailTarget(e.target.value)} />
                <Button size="sm" variant="outline"
                  onClick={sendTestEmail} disabled={saving === "email"}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {saving === "email" ? "寄送中..." : "寄送"}
                </Button>
              </div>
            </FieldRow>

            {/* Links */}
            <FieldRow label="健康檢查">
              <div className="flex gap-3">
                <a href="/api/healthz" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm hover:underline" style={{ color: "#047857" }}>
                  /api/healthz <ExternalLink className="h-3 w-3" />
                </a>
                <a href="/api/dbcheck" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm hover:underline" style={{ color: "#047857" }}>
                  /api/dbcheck <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </FieldRow>

            <FieldRow label="重新整理設定">
              <Button size="sm" variant="outline"
                onClick={load} disabled={loading}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                重新載入
              </Button>
            </FieldRow>
          </div>
        </SectionCard>
        </TabsContent>
        </Tabs>

      </div>
    </AdminShell>
  );
}

// v264 / v268：自動發送設定元件
interface AutoSendUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  email: string | null;
  role: string;
  roles?: string[];
}

function AutoSendSection({
  cfg,
  setCfg,
  save,
  saving,
}: {
  cfg: Config;
  setCfg: React.Dispatch<React.SetStateAction<Config | null>>;
  save: (label: string, partial: Partial<Config>) => Promise<void>;
  saving: string | null;
}) {
  const [users, setUsers] = React.useState<AutoSendUser[]>([]);
  const [usersLoading, setUsersLoading] = React.useState(true);
  const [testBusy, setTestBusy] = React.useState<"dry" | "real" | null>(null);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [recipSaving, setRecipSaving] = React.useState(false); // v398：收件人即時存中
  const [recipSaved, setRecipSaved] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState(""); // v454：手動加 Email 收件人

  React.useEffect(() => {
    setUsersLoading(true);
    adminFetch<{ users: AutoSendUser[] }>("/api/admin/users?role=admin,boss,coach")
      .then((d) => {
        // 只留有真實 role 的（admin/boss/coach）。
        // v454：role 或 roles[] 任一命中即算職員，避免殘留 roles=["customer"]
        // 卻 role="admin" 的帳號被誤濾掉。
        const STAFF = ["admin", "boss", "coach"];
        const filtered = (d.users ?? []).filter(
          (u) =>
            STAFF.includes(u.role) ||
            (u.roles ?? []).some((r) => STAFF.includes(r)),
        );
        setUsers(filtered);
      })
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const recipients = cfg.dailyWeatherReportRecipients ?? [];
  const recipientSet = new Set(recipients);

  // v346/v454：偵測「無效標籤」。
  // - email: 標籤一律有效 —— 老闆可手動填任意工作信箱（如 neowu@msi.com），
  //   它本來就不該綁某個職員 LINE 帳號，cron 也是直接寄到該信箱。
  // - line: 標籤只有「對得到現役職員」才有效；對不到的是殘留舊 UID（無法投遞）→ 無效。
  const validTags = new Set<string>();
  for (const u of users) {
    validTags.add(`line:${u.lineUserId}`);
    if (u.email) validTags.add(`email:${u.email}`);
  }
  const isValidRecipient = (r: string) =>
    r.startsWith("email:") ? true : validTags.has(r);
  // 只有在用戶清單載入完成後才判定，避免載入中誤判全部為孤兒
  const orphanTags = usersLoading ? [] : recipients.filter((r) => !isValidRecipient(r));
  const liveRecipients = recipients.filter(isValidRecipient);
  // 計數用「能投遞」的數量（載入中先用原始長度避免閃 0）
  const sendableCount = usersLoading ? recipients.length : liveRecipients.length;

  // v454：手動 Email 收件人 —— email: 標籤中「不屬於任何職員 email」的，即老闆自填的外部信箱
  const staffEmailTags = new Set(
    users.filter((u) => u.email).map((u) => `email:${u.email}`),
  );
  const manualEmails = recipients
    .filter((r) => r.startsWith("email:") && !staffEmailTags.has(r))
    .map((r) => r.slice(6));

  function addManualEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      alert("Email 格式不正確");
      return;
    }
    const tag = `email:${e}`;
    if (!recipientSet.has(tag)) void persistRecipients([...recipients, tag]);
    setNewEmail("");
  }
  function removeRecipientTag(tag: string) {
    void persistRecipients(recipients.filter((r) => r !== tag));
  }

  // v398：收件人勾選改「點了就即時存」— 不用再按下方儲存
  async function persistRecipients(next: string[]) {
    setCfg((c) => (c ? { ...c, dailyWeatherReportRecipients: next } : c));
    setRecipSaving(true);
    try {
      await adminFetch("/api/admin/site-config", {
        method: "POST",
        body: JSON.stringify({ dailyWeatherReportRecipients: next }),
      });
      setRecipSaved(true);
      window.setTimeout(() => setRecipSaved(false), 1500);
    } catch (e) {
      alert("儲存收件人失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRecipSaving(false);
    }
  }

  function clearOrphans() {
    if (orphanTags.length === 0) return;
    if (!confirm(`確定要清除 ${orphanTags.length} 個無效收件人嗎？\n\n${orphanTags.join("\n")}`)) return;
    void persistRecipients(recipients.filter((r) => validTags.has(r)));
  }

  function toggleLine(userId: string) {
    const tag = `line:${userId}`;
    void persistRecipients(
      recipientSet.has(tag) ? recipients.filter((r) => r !== tag) : [...recipients, tag],
    );
  }
  function toggleEmail(email: string) {
    const tag = `email:${email}`;
    void persistRecipients(
      recipientSet.has(tag) ? recipients.filter((r) => r !== tag) : [...recipients, tag],
    );
  }

  // v389：發送時段（台灣時間）+ 內容開關
  const slots = cfg.weatherReportSlots ?? [{ h: 22, m: 0 }, { h: 5, m: 0 }];
  const content = { forecast: true, ...(cfg.weatherReportContent ?? { wind: true, temp: true, sessions: true, wave: false }) };
  // v444：Cronicle 現以 Asia/Taipei 執行 → 直接用台灣時間 cron，不再換算 UTC（避免貼錯）
  function twCron(h: number, m: number) {
    return `${m} ${h} * * *`;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  function setSlots(next: Array<{ h: number; m: number }>) {
    setCfg((c) => (c ? { ...c, weatherReportSlots: next } : c));
  }
  function updateSlot(i: number, value: string) {
    const [hh, mm] = value.split(":").map((x) => Number(x));
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    setSlots(slots.map((s, idx) => (idx === i ? { h: hh, m: mm } : s)));
  }
  function addSlot() {
    if (slots.length >= 12) return;
    setSlots([...slots, { h: 12, m: 0 }]);
  }
  function removeSlot(i: number) {
    setSlots(slots.filter((_, idx) => idx !== i));
  }
  function toggleContent(key: "wind" | "temp" | "sessions" | "wave" | "forecast") {
    setCfg((c) => (c ? { ...c, weatherReportContent: { ...content, [key]: !content[key] } } : c));
  }
  // v411：海象設定
  const marineEnabled = cfg.weatherMarineEnabled ?? false;
  const marinePoints = cfg.weatherMarinePoints ?? [
    { label: "龍洞區", buoyId: "46694A", tideId: "C4A02" },
    { label: "基隆區", buoyId: "C6B01", tideId: "C4B01" },
    { label: "萊萊鶯歌石", buoyId: "46694A", tideId: "C4A05" },
  ];
  const marineFields = cfg.weatherMarineFields ?? { waveHeight: true, waveDir: true, wavePeriod: true, seaTemp: true, current: true, tide: true };
  function updateMarinePoint(i: number, key: "label" | "buoyId" | "tideId", val: string) {
    setCfg((c) => (c ? { ...c, weatherMarinePoints: marinePoints.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)) } : c));
  }
  // v446：海象回報點可新增/刪除（最多 5 區）
  function addMarinePoint() {
    if (marinePoints.length >= 5) return;
    setCfg((c) => (c ? { ...c, weatherMarinePoints: [...marinePoints, { label: "萊萊鶯歌石", buoyId: "46694A", tideId: "C4A05" }] } : c));
  }
  function removeMarinePoint(i: number) {
    setCfg((c) => (c ? { ...c, weatherMarinePoints: marinePoints.filter((_, idx) => idx !== i) } : c));
  }
  function toggleMarineField(key: keyof NonNullable<Config["weatherMarineFields"]>) {
    setCfg((c) => (c ? { ...c, weatherMarineFields: { ...marineFields, [key]: !marineFields[key] } } : c));
  }
  // 東北角浮標/潮位站清單（CWA O-B0075-001；鼻頭角 OAC003 目前停測，不列入）
  const BUOY_OPTS = [
    { id: "46694A", name: "龍洞浮標（核心）" },
    { id: "C6B01", name: "彭佳嶼浮標（基隆外海）" },
    { id: "C6AH2", name: "富貴角浮標（北海岸）" },
    { id: "46708A", name: "龜山島浮標（宜蘭）" },
    { id: "46706A", name: "蘇澳浮標（宜蘭）" },
  ];
  const TIDE_OPTS = [
    { id: "C4A02", name: "龍洞潮位" },
    { id: "C4B01", name: "基隆潮位" },
    { id: "C4A05", name: "福隆潮位" },
    { id: "C4U02", name: "烏石潮位（頭城）" },
    { id: "C4U01", name: "蘇澳潮位" },
  ];
  const MARINE_FIELD_OPTS = [
    { k: "waveHeight", label: "🌊 浪高" },
    { k: "waveDir", label: "🧭 波向" },
    { k: "wavePeriod", label: "⏱ 波浪週期" },
    { k: "seaTemp", label: "🌡 海溫（防寒衣建議）" },
    { k: "current", label: "🌀 海流" },
    { k: "tide", label: "📏 潮位" },
  ] as const;
  function slotMeta(h: number) {
    // 粗略標示用途：18:00–翌4:59 視為「前一晚預報」，其餘「出發前 / 當日」
    if (h >= 18 || h < 5) return { emoji: "🌙", tag: "前一晚預報", desc: "看「明日」天氣 + 明日場次" };
    return { emoji: "🌅", tag: "出發前 / 當日", desc: "看「今日」即時天氣 + 今日場次" };
  }

  async function runTest(dryRun: boolean) {
    setTestBusy(dryRun ? "dry" : "real");
    setTestResult(null);
    try {
      const r = await adminFetch<{
        ok: boolean;
        skipped?: boolean;
        reason?: string;
        maxWind?: number | null;
        textPreview?: string;
        results?: Array<{ to: string; ok: boolean; error?: string }>;
        tookMs?: number;
      }>("/api/admin/test-weather-report", {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      if (r.skipped) {
        setTestResult(`⚠️ Skipped：${r.reason}`);
      } else if (dryRun) {
        setTestResult(`✓ 預覽內容（沒有實際寄送）：\n\n${r.textPreview ?? "(empty)"}`);
      } else {
        const ok = (r.results ?? []).filter((x) => x.ok).length;
        const fail = (r.results ?? []).filter((x) => !x.ok).length;
        const details =
          (r.results ?? [])
            .map((x) => `${x.ok ? "✓" : "✗"} ${x.to}${x.error ? ` — ${x.error}` : ""}`)
            .join("\n") || "（沒有收件人）";
        setTestResult(`已發送：成功 ${ok} / 失敗 ${fail}（用時 ${r.tookMs}ms）\n\n${details}\n\n— 預覽：\n${r.textPreview ?? ""}`);
      }
    } catch (e) {
      setTestResult(`✗ 失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTestBusy(null);
    }
  }

  return (
    <SectionCard title="📨 自動發送設定">
      <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)]">
        這些通知由 Cronicle 排程觸發，可在此設定是否啟用、寄送對象。
      </p>

      {/* v315：訂單日報設定（v393：移到最上面） */}
      <div className="mb-4 rounded-xl border-2 p-4" style={{ borderColor: "var(--border)", background: "rgba(96,165,250,0.06)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">📋 每晚 21:00 預報明日（訂單，非天氣）</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              每天台灣 21:00 自動發送「明日訂單預報」（Cronicle 以台灣時間跑 → cron <span className="font-mono">0 21 * * *</span>）。<br/>
              老闆/admin：完整版（明日場次+客戶+應收+待審匯款+今日待結算+月統計）LINE + Email。<br/>
              教練：精簡版 LINE，只列明日場次與客戶清單+電話（不含金額）。
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm shrink-0">
            <input
              type="checkbox"
              checked={cfg.dailyBriefingEnabled ?? true}
              onChange={(e) => setCfg(c => c ? { ...c, dailyBriefingEnabled: e.target.checked } : c)}
            />
            <span className="text-[var(--foreground)]">啟用</span>
          </label>
        </div>
        {cfg.dailyBriefingEnabled !== false && (
          <label className="mt-3 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={cfg.dailyBriefingIncludeCoaches ?? true}
              onChange={(e) => setCfg(c => c ? { ...c, dailyBriefingIncludeCoaches: e.target.checked } : c)}
            />
            <span className="text-[var(--foreground)]">也發給教練（精簡版）</span>
          </label>
        )}
      </div>

      <div className="rounded-lg border p-4 mb-3" style={{ borderColor: "var(--border)" }}>
        <p className="text-sm font-bold text-[var(--foreground)] mb-1">🌤️ 每日天氣回報</p>

        {/* ── Step 1 是否啟用 ── */}
        <div className="flex items-center justify-between gap-3 border-t pt-3 mt-2" style={{ borderColor: "var(--border)" }}>
          <div>
            <p className="text-[13px] font-semibold text-[var(--foreground)]">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">1</span>
              是否啟用
            </p>
            <p className="mt-0.5 ml-7 text-[11px] text-[var(--muted-foreground)]">關閉後不會自動發送（仍可手動測試發送）。</p>
          </div>
          <label className="flex items-center gap-2 text-sm shrink-0">
            <input
              type="checkbox"
              checked={cfg.dailyWeatherReportEnabled ?? false}
              onChange={(e) => setCfg(c => c ? { ...c, dailyWeatherReportEnabled: e.target.checked } : c)}
            />
            <span className="text-[var(--foreground)]">啟用</span>
          </label>
        </div>

        {/* ── Step 2 發送時段（台灣時間） ── */}
        <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold text-[var(--foreground)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">2</span>
            發送時段 <span className="ml-1 rounded bg-[#e0f7f3] px-1.5 py-0.5 text-[10px] font-bold text-[#0e9e8e]">台灣時間</span>
          </p>
          <p className="mt-0.5 ml-7 mb-2 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            想一天發幾次都可以。右邊灰框是對應的 <b>cron（台灣時間）</b>，直接貼到 Cronicle（Cronicle 現以台灣時間執行）。
          </p>
          <div className="ml-7 space-y-2">
            {slots.map((s, i) => {
              const meta = slotMeta(s.h);
              return (
                <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "#fafcff" }}>
                  <span className="text-lg">{meta.emoji}</span>
                  <input
                    type="time"
                    value={`${pad(s.h)}:${pad(s.m)}`}
                    onChange={(e) => updateSlot(i, e.target.value)}
                    className="rounded border px-2 py-1 text-[13px] font-semibold"
                    style={{ borderColor: "var(--border)" }}
                  />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-[#0e9e8e]">{meta.tag}</div>
                    <div className="truncate text-[10px] text-[var(--muted-foreground)]">{meta.desc}</div>
                  </div>
                  <span className="ml-auto rounded bg-[var(--muted)]/50 px-2 py-1 font-mono text-[11px] text-[var(--muted-foreground)]">
                    台灣 {twCron(s.h, s.m)}
                  </span>
                  <button onClick={() => removeSlot(i)} className="px-1 text-[var(--muted-foreground)] hover:text-[var(--color-coral)]" title="刪除時段">✕</button>
                </div>
              );
            })}
            {slots.length < 12 && (
              <button onClick={addSlot} className="w-full rounded-lg border border-dashed py-2 text-[13px] font-semibold text-[#0e9e8e]" style={{ borderColor: "var(--border)", background: "#fff" }}>
                ＋ 新增時段
              </button>
            )}
          </div>
        </div>

        {/* ── Step 3 發送給誰 與 路徑 ── */}
        <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold text-[var(--foreground)] mb-0.5">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">3</span>
            發送給誰 與 路徑
          </p>
        </div>
        <Label className="mb-1 block text-xs text-[var(--muted-foreground)] ml-7">
          收件人（勾選即<b className="text-[var(--color-ocean-deep)]">自動儲存</b>，不用按下方按鈕）
          {recipSaving && <span className="ml-2 text-[10px] text-amber-600">儲存中…</span>}
          {recipSaved && <span className="ml-2 text-[10px] text-emerald-600">✓ 已儲存</span>}
        </Label>
        {usersLoading ? (
          <p className="text-[11px] text-[var(--muted-foreground)]">載入用戶清單中...</p>
        ) : users.length === 0 ? (
          <p className="text-[11px] text-[var(--muted-foreground)]">（沒有 admin / boss / coach 用戶）</p>
        ) : (
          <div className="space-y-1 rounded-md border p-2 max-h-72 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
            {users.map((u) => {
              const lineChecked = recipientSet.has(`line:${u.lineUserId}`);
              const emailChecked = u.email ? recipientSet.has(`email:${u.email}`) : false;
              const roleLabel =
                u.roles && u.roles.length > 0
                  ? u.roles.join("/")
                  : u.role;
              return (
                <div
                  key={u.lineUserId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1.5 text-[12px] hover:bg-[var(--muted)]/40"
                >
                  <span className="flex-1 min-w-[180px]">
                    <b>{u.realName ?? u.displayName}</b>
                    <span className="ml-1.5 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">{roleLabel}</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <input type="checkbox" checked={lineChecked} onChange={() => toggleLine(u.lineUserId)} />
                    <span>LINE</span>
                  </label>
                  <label className={cn("flex items-center gap-1.5 text-[11px]", !u.email && "opacity-40")}>
                    <input
                      type="checkbox"
                      disabled={!u.email}
                      checked={emailChecked}
                      onChange={() => u.email && toggleEmail(u.email)}
                      title={u.email ?? "此用戶沒填 Email"}
                    />
                    <span>Email {u.email ? `(${u.email})` : ""}</span>
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {/* v454：手動 Email 收件人 — 老闆自填的外部信箱（不需綁職員 LINE 帳號） */}
        <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] font-medium text-[var(--foreground)] mb-1.5">
            📧 手動 Email 收件人（外部信箱，免綁 LINE）
          </p>
          {manualEmails.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {manualEmails.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-1 text-[11px]"
                >
                  {e}
                  <button
                    type="button"
                    onClick={() => removeRecipientTag(`email:${e}`)}
                    className="text-[var(--muted-foreground)] hover:text-red-500"
                    title="移除此收件人"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-[10px] text-[var(--muted-foreground)]">（尚未加入外部信箱）</p>
          )}
          <div className="flex gap-1.5">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addManualEmail();
                }
              }}
              placeholder="例如 boss@example.com"
              className="flex-1 rounded-md border px-2 py-1 text-[12px]"
              style={{ borderColor: "var(--border)" }}
            />
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={addManualEmail}>
              ＋ 加入
            </Button>
          </div>
        </div>

        {/* v346：孤兒收件人警告 — 對不到現役職員的殘留 LINE UID（email 不在此列） */}
        {orphanTags.length > 0 && (
          <div className="mt-2 rounded-md border p-2.5 text-[11px]" style={{ borderColor: "#f59e0b", background: "rgba(245,158,11,0.08)" }}>
            <p className="font-medium text-[#92400e]">
              ⚠️ 偵測到 {orphanTags.length} 個無效收件人（對不到現役管理員 / 教練，可能是信箱改過或角色變更後的殘留）：
            </p>
            <ul className="mt-1 ml-4 list-disc text-[#92400e]">
              {orphanTags.map((t) => (
                <li key={t} className="font-mono break-all">
                  {t.startsWith("email:") ? `📧 ${t.slice(6)}` : t.startsWith("line:") ? `💬 LINE ${t.slice(5)}` : t}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[10px] text-[#92400e]/80">
              這些對象畫面上沒有勾選框，卻仍會被自動 / 測試發送寄到。清除後請按下方「儲存自動發送設定」才會生效。
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              onClick={clearOrphans}
              style={{ borderColor: "#f59e0b", color: "#92400e" }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              🧹 清除無效收件人
            </Button>
          </div>
        )}

        <div className="mt-2 ml-7 rounded bg-[var(--muted)]/40 p-2 text-[11px] text-[var(--muted-foreground)]">
          發送路徑：LINE Flex / 純文字 + Email（依各人勾選）　·　API 端點 <code className="font-mono text-[var(--color-ocean-deep)]">/api/cron/daily-weather-report</code>
        </div>

        {/* ── Step 4 發送內容 ── */}
        <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold text-[var(--foreground)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">4</span>
            發送內容
          </p>
          <p className="mt-0.5 ml-7 mb-2 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            資料來源：中央氣象署 CWA 即時測站（466940 基隆 + 467080 宜蘭）。勾選要帶進訊息的項目。
          </p>
          <div className="ml-7 grid grid-cols-2 gap-2">
            {([
              { k: "wind", label: "💨 風速（基隆/宜蘭）" },
              { k: "temp", label: "🌡️ 氣溫" },
              { k: "sessions", label: "📅 今日/明日場次摘要" },
              { k: "forecast", label: "⛅ 天氣預報（龍洞·萊萊/潮境 06–12 時）" },
            ] as const).map((item) => (
              <label key={item.k} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] cursor-pointer" style={{ borderColor: "var(--border)", background: "#fafcff" }}>
                <input type="checkbox" checked={content[item.k]} onChange={() => toggleContent(item.k)} />
                <span>{item.label}</span>
              </label>
            ))}
            {/* v447：海象不是這裡的勾選項，是下方 4b 的回報點；放一格指示避免老闆以為漏掉 */}
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[12px]" style={{ borderColor: "var(--color-ocean-deep)", background: "#f0f9ff" }}>
              <span>🌊 海象（浪高/海溫/海流/潮位）</span>
              <span className="ml-auto text-[10px] font-semibold text-[var(--color-ocean-deep)]">↓ 下方 4b 設定</span>
            </div>
          </div>
          <p className="mt-1.5 ml-7 text-[10px] text-[var(--muted-foreground)]">
            ※ 浪高/海溫/海流/潮位請改用下方「🌊 海象」區（真實浮標資料）。
          </p>
        </div>

        {/* ── Step 4b 海象（CWA O-B0075-001 浮標+潮位）v411 ── */}
        <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold text-[var(--foreground)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">4b</span>
            🌊 海象（龍洞區 / 基隆區）
          </p>
          <label className="mt-2 ml-7 flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={marineEnabled}
              onChange={() => setCfg((c) => (c ? { ...c, weatherMarineEnabled: !marineEnabled } : c))} />
            <span>在天氣回報帶入海象資料（真實浪高/海溫/海流/潮位 + 自動判斷）</span>
          </label>
          <p className="mt-1 ml-7 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
            資料源：中央氣象署 CWA 海象監測（O-B0075-001）。每個回報點 = 一個浮標站（浪高/海溫/海流）+ 一個潮位站。
          </p>

          <div className={`ml-7 mt-2 space-y-2 ${marineEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            {marinePoints.map((p, i) => (
              <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "#fafcff" }}>
                <div className="grid grid-cols-3 gap-2 items-center">
                  <input className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: "var(--border)" }}
                    value={p.label} placeholder="區域名"
                    onChange={(e) => updateMarinePoint(i, "label", e.target.value)} />
                  <select className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: "var(--border)" }}
                    value={p.buoyId} onChange={(e) => updateMarinePoint(i, "buoyId", e.target.value)}>
                    {BUOY_OPTS.map((o) => <option key={o.id} value={o.id}>浮標：{o.name}</option>)}
                  </select>
                  <select className="rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: "var(--border)" }}
                    value={p.tideId} onChange={(e) => updateMarinePoint(i, "tideId", e.target.value)}>
                    {TIDE_OPTS.map((o) => <option key={o.id} value={o.id}>潮位：{o.name}</option>)}
                  </select>
                </div>
                {marinePoints.length > 1 && (
                  <button type="button" onClick={() => removeMarinePoint(i)} className="mt-1.5 text-[11px] text-[var(--color-coral)]">✕ 移除此區</button>
                )}
              </div>
            ))}
            {marinePoints.length < 5 && (
              <button type="button" onClick={addMarinePoint} className="w-full rounded-lg border border-dashed py-1.5 text-[12px] font-semibold text-[#0e9e8e]" style={{ borderColor: "var(--border)", background: "#fff" }}>＋ 新增海象回報點（萊萊／其他）</button>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {MARINE_FIELD_OPTS.map((f) => (
                <label key={f.k} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] cursor-pointer" style={{ borderColor: "var(--border)", background: "#fff" }}>
                  <input type="checkbox" checked={marineFields[f.k]} onChange={() => toggleMarineField(f.k)} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed">
              判斷門檻：浪高 &lt;1m 適合／1–1.5m 留意／&gt;1.5m 不建議；海流 ≤1節 和緩／1–2節 留意／&gt;2節 強流；
              海溫→防寒衣 ≥27°C 3mm｜25–27 5mm｜23–25 加頭套手套｜20–23 5mm加厚/半乾｜&lt;20 乾式。
              抓不到該欄就略過。鼻頭角浮標目前停測，基隆區預設用彭佳嶼。
            </p>
          </div>
        </div>

        {/* ── Step 5 發送 API 測試 ── */}
        <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-[13px] font-semibold text-[var(--foreground)]">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-ocean-deep)] text-white text-[11px] mr-1.5">5</span>
            發送 API 測試
          </p>
          <p className="mt-0.5 ml-7 text-[11px] text-[var(--muted-foreground)]">
            先預覽（不寄）確認內容，或立即對勾選對象測試發送一次。
          </p>
        </div>

        <div className="mt-2 ml-7 rounded bg-[var(--muted)]/30 p-2 text-[10px] text-[var(--muted-foreground)]">
          已選 {sendableCount} 個目標
          {orphanTags.length > 0 ? `（另有 ${orphanTags.length} 個無效，未計入）` : ""}。最後一次發送：
          {cfg.dailyWeatherReportLastSentAt
            ? new Date(cfg.dailyWeatherReportLastSentAt).toLocaleString("zh-TW")
            : "（尚未發送）"}
        </div>

        {/* v268：測試按鈕 */}
        <div className="mt-3 ml-7 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => runTest(true)}
            disabled={testBusy !== null}
            title="不會真的發送，只顯示訊息預覽"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {testBusy === "dry" ? "預覽中..." : "預覽訊息（不寄）"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              const warn = orphanTags.length > 0
                ? `\n\n⚠️ 注意：目前還有 ${orphanTags.length} 個無效收件人未清除/未儲存，若直接發送仍會寄到它們。建議先清除並儲存。`
                : "";
              if (!confirm(`真的要立即發送給 ${sendableCount} 個收件人嗎？${warn}`)) return;
              void runTest(false);
            }}
            disabled={testBusy !== null || recipients.length === 0}
            style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
            title="立即發送（會真的推 LINE / Email）"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {testBusy === "real" ? "發送中..." : "🧪 立即測試發送"}
          </Button>
        </div>

        {testResult && (
          <pre className="mt-2 ml-7 max-h-72 overflow-y-auto rounded bg-white border p-3 text-[11px] whitespace-pre-wrap font-mono text-[var(--foreground)]" style={{ borderColor: "var(--border)" }}>
            {testResult}
          </pre>
        )}

        {/* v389：Cronicle 指令 + 各時段 cron 一覽 */}
        <div className="mt-3 ml-7 rounded-lg p-3 text-[10.5px] leading-relaxed" style={{ background: "var(--color-ocean-deep)", color: "#cbe7e2" }}>
          <span className="text-[#7dd3c8]"># Cronicle 排程（{slots.length} 個時段，台灣時間）</span><br />
          {slots.map((s, i) => (
            <span key={i}>
              {slotMeta(s.h).emoji} 台灣 {pad(s.h)}:{pad(s.m)} → <code className="text-white">{twCron(s.h, s.m)}</code><br />
            </span>
          ))}
          <span className="text-[#7dd3c8]"># Command（所有時段共用）</span><br />
          <code className="block mt-1 break-all">
            curl -fsS -X POST -H &quot;Authorization: Bearer $HAIWANGZI_CRON_SECRET&quot; &quot;$HAIWANGZI_BASE_URL/api/cron/daily-weather-report&quot;
          </code>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          onClick={() => save("自動發送", {
            dailyWeatherReportEnabled: cfg.dailyWeatherReportEnabled ?? false,
            dailyWeatherReportRecipients: cfg.dailyWeatherReportRecipients ?? [],
            weatherReportSlots: cfg.weatherReportSlots ?? [{ h: 22, m: 0 }, { h: 5, m: 0 }],
            weatherReportContent: cfg.weatherReportContent ?? { wind: true, temp: true, sessions: true, wave: false },
            weatherMarineEnabled: cfg.weatherMarineEnabled ?? false,
            weatherMarinePoints: marinePoints,
            weatherMarineFields: marineFields,
            dailyBriefingEnabled: cfg.dailyBriefingEnabled ?? true,
            dailyBriefingIncludeCoaches: cfg.dailyBriefingIncludeCoaches ?? true,
          })}
          disabled={saving === "自動發送"}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving === "自動發送" ? "儲存中..." : "儲存自動發送設定"}
        </Button>
      </div>

      <div className="mt-3 rounded bg-[var(--muted)]/40 p-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
        📋 <b>明日訂單預報的 Cronicle 排程</b>（Cronicle 以台灣時間執行）：<br />
        台灣 21:00 → <code>0 21 * * *</code>（每天一次）<br />
        Command：<br />
        <code className="block mt-1 break-all">
          curl -fsS -X POST -H &quot;Authorization: Bearer $HAIWANGZI_CRON_SECRET&quot; &quot;$HAIWANGZI_BASE_URL/api/cron/daily-briefing&quot;
        </code>
        <span className="mt-1 block text-[10px]">※ 天氣回報的排程在上面「🌤️ 每日天氣回報 → 步驟 5」依你設定的時段自動列出。</span>
      </div>
    </SectionCard>
  );
}

// v230：檔案上傳（R2）診斷與測試元件
interface UploadStatus {
  configured: boolean;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string | null;
  publicBucket: string;
  privateBucket: string;
  publicUrl: string | null;
}

interface UploadTestResult {
  ok: boolean;
  step?: string;
  message?: string;
  error?: string;
  detail?: string;
  hint?: string;
  testKey?: string;
  bucket?: string;
  downloadUrl?: string;
  size?: number;
  note?: string;
}

function UploadTestPanel() {
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [testResult, setTestResult] = useState<UploadTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    adminFetch<UploadStatus>("/api/admin/uploads/test")
      .then(setStatus)
      .catch(() => null)
      .finally(() => setStatusLoading(false));
  }, []);

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await adminFetch<UploadTestResult>("/api/admin/uploads/test", { method: "POST" });
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        付款憑證 / 場次照片 / 潛點圖等檔案儲存於 <b>Cloudflare R2</b>。下面顯示目前 R2 環境變數狀態，按「測試上傳」會實際嘗試傳 1 KB 測試檔到 private bucket 驗證。
      </p>

      {/* 狀態表 */}
      <div className="rounded-lg border bg-slate-50 p-3 text-xs" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 font-semibold text-slate-700">📋 環境變數狀態</div>
        {statusLoading ? (
          <div className="text-slate-500">載入中...</div>
        ) : !status ? (
          <div className="text-rose-600">無法讀取狀態</div>
        ) : (
          <div className="space-y-0.5 font-mono text-[11px]">
            <Row k="R2_ACCOUNT_ID" v={status.accountId} />
            <Row k="R2_ACCESS_KEY_ID" v={status.accessKeyId} />
            <Row k="R2_SECRET_ACCESS_KEY" v={status.secretAccessKey} />
            <Row k="R2_ENDPOINT" v={status.endpoint ?? "（用 accountId 自動組）"} />
            <Row k="R2_PRIVATE_BUCKET" v={status.privateBucket} />
            <Row k="R2_PUBLIC_BUCKET" v={status.publicBucket} />
            <Row k="R2_PUBLIC_URL" v={status.publicUrl ?? "（未設）"} />
            <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
              整體：{status.configured
                ? <span className="font-bold text-emerald-700">✓ 已設定</span>
                : <span className="font-bold text-rose-600">✗ 未設定（fallback 用 base64 存 DB）</span>}
            </div>
          </div>
        )}
      </div>

      {/* 測試按鈕 + 結果 */}
      <div className="flex gap-2">
        <Button size="sm" onClick={runTest} disabled={testing || !status?.configured}
          style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}>
          📤 {testing ? "測試中..." : "測試上傳（1 KB 測試檔）"}
        </Button>
        {!status?.configured && (
          <span className="self-center text-[10px] text-rose-600">需先設定 R2 環境變數</span>
        )}
      </div>

      {testResult && (
        <div className="rounded-lg border-2 p-3 text-xs space-y-1.5"
          style={{
            borderColor: testResult.ok ? "rgba(74, 222, 128, 0.4)" : "rgba(244, 63, 94, 0.4)",
            background: testResult.ok ? "rgba(74, 222, 128, 0.08)" : "rgba(244, 63, 94, 0.05)",
          }}>
          <div className={`font-semibold ${testResult.ok ? "text-emerald-700" : "text-rose-600"}`}>
            {testResult.ok ? "✓ 測試成功" : "✗ 測試失敗"}
          </div>
          {testResult.step && <div className="text-[10px] text-slate-600">步驟：{testResult.step}</div>}
          {testResult.message && <div>{testResult.message}</div>}
          {testResult.error && <div className="font-mono text-[11px] text-rose-700">錯誤：{testResult.error}</div>}
          {testResult.detail && <div className="font-mono text-[10px] text-slate-500">{testResult.detail}</div>}
          {testResult.hint && <div className="text-amber-700">💡 {testResult.hint}</div>}
          {testResult.testKey && (
            <div className="text-[10px] text-slate-600">
              測試 key：<code>{testResult.testKey}</code>
            </div>
          )}
          {testResult.downloadUrl && (
            <a href={testResult.downloadUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-cyan-600 hover:underline">
              下載驗證（60s 有效） →
            </a>
          )}
        </div>
      )}

      {/* 設定指引（v240：擴充完整步驟） */}
      {status && !status.configured && (
        <div className="rounded-lg border p-3 text-xs space-y-2"
          style={{ borderColor: "rgba(217, 119, 6, 0.4)", background: "rgba(254, 243, 199, 0.4)" }}>
          <div className="font-semibold text-amber-900">🔧 設定 Cloudflare R2 完整步驟（免費額度：10GB 儲存 + 100 萬次寫入/月）</div>

          <div className="space-y-1.5 text-amber-800">
            <div className="font-semibold mt-1">① 註冊 / 登入 Cloudflare</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>到 <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer" className="underline">https://dash.cloudflare.com/sign-up</a> 註冊（用 gmail 即可，免信用卡）</li>
              <li>登入後左側選單點「R2」（會請你同意 R2 條款一次，免費 plan 即可，但要綁信用卡 — Cloudflare 承諾「不超用就不扣款」）</li>
            </ol>

            <div className="font-semibold mt-1">② 建立兩個 Bucket</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>R2 頁面右上「Create bucket」→ 名稱填 <code>haiwangzi-private</code> → Location: Automatic → 建立</li>
              <li>再建一個 <code>haiwangzi-public</code>（同樣設定）</li>
              <li>進 <code>haiwangzi-public</code> → Settings → Public Access → 開啟 → 它會給你一個 <code>https://pub-xxxxx.r2.dev</code> 網址，記下來（之後填 R2_PUBLIC_URL）</li>
            </ol>

            <div className="font-semibold mt-1">③ 建立 API Token</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>R2 主頁右側「Manage R2 API Tokens」→ Create API token</li>
              <li>Token name: <code>haiwangzi-bot</code></li>
              <li>Permissions: <code>Object Read &amp; Write</code></li>
              <li>Specify bucket: 兩個 bucket 都勾選</li>
              <li>TTL: Forever（不設過期）</li>
              <li>建立後 <strong>立刻複製</strong>：Access Key ID、Secret Access Key、Account ID（離開頁面就看不到了）</li>
            </ol>

            <div className="font-semibold mt-1">④ 設定 CORS（讓 LIFF 網頁能上傳）</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>進 <code>haiwangzi-private</code> bucket → Settings → CORS policy → Edit</li>
              <li>貼下面 JSON 再儲存：</li>
            </ol>
            <pre className="rounded bg-white/60 px-2 py-1 text-[10px] leading-relaxed">{`[{
  "AllowedOrigins": ["https://haiwangzi.xyz"],
  "AllowedMethods": ["GET","PUT"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]`}</pre>
            <div className="text-[10px]">（<code>haiwangzi-public</code> 同樣設一次）</div>

            <div className="font-semibold mt-1">⑤ 設定環境變數到 Zeabur</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>到 Zeabur dashboard → haiwangzi-bot service → Variables tab</li>
              <li>新增以下 7 個變數：</li>
            </ol>
            <pre className="rounded bg-white/60 px-2 py-1 text-[10px] leading-relaxed">{`R2_ACCOUNT_ID=（步驟③ 的 Account ID）
R2_ACCESS_KEY_ID=（步驟③ 的 Access Key ID）
R2_SECRET_ACCESS_KEY=（步驟③ 的 Secret Access Key）
R2_PRIVATE_BUCKET=haiwangzi-private
R2_PUBLIC_BUCKET=haiwangzi-public
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev   ← 步驟② 的網址
R2_ENDPOINT=  （留空，會自動組）`}</pre>

            <div className="font-semibold mt-1">⑥ 重新部署 + 驗證</div>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>Zeabur 設完變數會自動重新部署（等 2-3 分鐘）</li>
              <li>回到這頁按「重新整理設定」→ 7 個欄位都該變綠 ✓</li>
              <li>按「執行測試」→ 4 個步驟全部 ✓ 就 OK</li>
              <li>之後 LIFF 客戶上傳付款證明就會走 R2 直傳，瞬間完成</li>
            </ol>

            <div className="mt-2 rounded bg-white/60 p-2 text-[10px]">
              💡 設定完成後告訴 Claude，我可以幫你用 CLI 一次塞 7 個變數到 Zeabur，免去手動點 7 次的麻煩。
              你只要把 Account ID / Access Key / Secret Access Key 給我。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-800 truncate">{v}</span>
    </div>
  );
}

// v302：儲存統計 + base64 → R2 遷移 Panel
interface StorageRow {
  storage: string;
  count: number;
  bytes: number;
  kb: number;
  mb: number;
}
interface StorageStats {
  paymentProofs: StorageRow[];
  signatures: StorageRow[];
}
interface BackfillResult {
  paymentProofs: { scanned: number; migrated: number; failed: number; kbFreed: number };
  signatures: { scanned: number; migrated: number; failed: number; kbFreed: number };
  hint?: string;
}
function StorageStatsPanel() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);

  async function reload() {
    setLoading(true);
    setMsg(null);
    try {
      const r = await adminFetch<StorageStats>("/api/admin/storage-stats");
      setStats(r);
    } catch (e) {
      setMsg("載入失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }
  React.useEffect(() => { void reload(); }, []);

  async function dryRun() {
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const r = await adminFetch<{ paymentProofs: { count: number }; signatures: { count: number } }>(
        "/api/admin/backfill-base64-to-r2?dryRun=1",
        { method: "POST" },
      );
      setMsg(`📋 DRY RUN 預覽：付款證明 ${r.paymentProofs.count} 筆 base64 待遷移，簽名圖 ${r.signatures.count} 筆。\n沒問題就按「正式遷移」`);
    } catch (e) {
      setMsg("預覽失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!confirm("確定要把所有 base64 圖片遷移到 R2 嗎？\n（不會破壞資料，只是把 imageKey 從 base64 字串改成 R2 key）")) return;
    setBusy(true);
    setMsg(null);
    setResult(null);
    try {
      const r = await adminFetch<BackfillResult>(
        "/api/admin/backfill-base64-to-r2",
        { method: "POST" },
      );
      setResult(r);
      const totalKb = r.paymentProofs.kbFreed + r.signatures.kbFreed;
      setMsg(`✅ 完成！付款證明遷移 ${r.paymentProofs.migrated} 筆、簽名圖 ${r.signatures.migrated} 筆，DB 釋放 ${totalKb} KB。${r.hint ?? ""}`);
      // 重新載入統計
      void reload();
    } catch (e) {
      setMsg("遷移失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  function StorageTable({ title, rows }: { title: string; rows: StorageRow[] }) {
    const labels: Record<string, { label: string; color: string }> = {
      r2: { label: "✅ R2 雲端", color: "text-emerald-700 bg-emerald-50" },
      base64: { label: "⚠ Base64 (DB 內嵌)", color: "text-amber-700 bg-amber-50" },
      no_image: { label: "無圖", color: "text-slate-500 bg-slate-50" },
      other: { label: "其他", color: "text-slate-700 bg-slate-100" },
    };
    return (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-[var(--muted-foreground)]">{title}</div>
        {rows.length === 0 ? (
          <div className="text-xs text-[var(--muted-foreground)]">尚無資料</div>
        ) : (
          <div className="rounded-md overflow-hidden border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full text-xs">
              <thead className="bg-[var(--muted)]">
                <tr>
                  <th className="text-left px-2 py-1.5">類型</th>
                  <th className="text-right px-2 py-1.5">筆數</th>
                  <th className="text-right px-2 py-1.5">DB 容量</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const meta = labels[r.storage] ?? { label: r.storage, color: "" };
                  return (
                    <tr key={r.storage} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 ${meta.color}`}>{meta.label}</span>
                      </td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-mono">{r.count}</td>
                      <td className="text-right px-2 py-1.5 tabular-nums font-mono">
                        {r.mb > 1 ? `${r.mb} MB` : `${r.kb} KB`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  const hasBase64 = stats && (
    stats.paymentProofs.some((r) => r.storage === "base64" && r.count > 0) ||
    stats.signatures.some((r) => r.storage === "base64" && r.count > 0)
  );

  return (
    <div className="space-y-3 text-sm">
      <p className="-mt-2 text-[11px] text-[var(--muted-foreground)]">
        圖片預設上 R2 雲端（DB 只存 key）。若 R2 暫時不可用，會 fallback 存 base64 直接進 DB（DB 會變肥）。<br />
        此面板統計目前狀況，並可一鍵把舊的 base64 遷移到 R2，釋放 DB 容量。
      </p>

      {loading ? (
        <p className="text-xs text-[var(--muted-foreground)]">載入中...</p>
      ) : stats ? (
        <div className="space-y-3">
          <StorageTable title="付款證明 (payment_proofs)" rows={stats.paymentProofs} />
          <StorageTable title="客戶簽名 (bookings.signature_image_key)" rows={stats.signatures} />
        </div>
      ) : (
        <p className="text-xs text-[var(--color-coral)]">無法載入</p>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" variant="outline" onClick={reload} disabled={loading || busy}>
          🔄 重新統計
        </Button>
        {hasBase64 && (
          <>
            <Button size="sm" variant="outline" onClick={dryRun} disabled={busy}>
              📋 預覽遷移筆數
            </Button>
            <Button size="sm" onClick={execute} disabled={busy}>
              {busy ? "處理中..." : "🚀 正式遷移 base64 → R2"}
            </Button>
          </>
        )}
        {!hasBase64 && stats && (
          <span className="text-[11px] text-emerald-700">
            ✅ 沒有 base64 殘留，DB 已是最佳狀態
          </span>
        )}
      </div>

      {msg && (
        <div className="rounded-lg p-2 text-xs whitespace-pre-wrap"
          style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>
          {msg}
        </div>
      )}
      {result && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted-foreground)]">查看詳細結果 JSON</summary>
          <pre className="mt-1 rounded bg-slate-50 p-2 text-[10px] overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ─── v403：首頁「最新動態」影片清單 + 模式管理 ─────────────── */
function HomeVideosCard({
  cfg, setCfg, save, saving,
}: {
  cfg: Config;
  setCfg: React.Dispatch<React.SetStateAction<Config | null>>;
  save: (section: string, patch: Partial<Config>) => Promise<void>;
  saving: string | null;
}) {
  const mode = cfg.homeVideosMode ?? "curated";
  const vids = cfg.homeVideos ?? [];
  const [bulkInput, setBulkInput] = useState("");
  const [errMsg, setErrMsg] = useState("");

  function update(next: Array<{ id: string; title: string; isShort: boolean }>) {
    setCfg((c) => (c ? { ...c, homeVideos: next } : c));
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = [...vids];
    const tgt = idx + dir;
    if (tgt < 0 || tgt >= next.length) return;
    [next[idx], next[tgt]] = [next[tgt], next[idx]];
    update(next);
  }
  function delItem(idx: number) {
    update(vids.filter((_, i) => i !== idx));
  }
  function addOne() {
    const parsed = parseYtUrl(bulkInput);
    if (!parsed) { setErrMsg("無法解析 URL — 請貼 YouTube 連結（含 watch / shorts / youtu.be）或 11 碼影片 ID。"); return; }
    if (vids.some((v) => v.id === parsed.id)) { setErrMsg(`已存在：${parsed.id}`); return; }
    update([...vids, { id: parsed.id, title: "", isShort: parsed.isShort }]);
    setBulkInput("");
    setErrMsg("");
  }
  function bulkParse() {
    const lines = bulkInput.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) { setErrMsg("請貼一或多個 URL，每行一個（或用空白/逗號分隔）"); return; }
    const next = [...vids];
    const failed: string[] = [];
    let added = 0;
    for (const ln of lines) {
      const p = parseYtUrl(ln);
      if (!p) { failed.push(ln); continue; }
      if (next.some((v) => v.id === p.id)) continue;
      next.push({ id: p.id, title: "", isShort: p.isShort });
      added++;
    }
    update(next);
    setBulkInput("");
    setErrMsg(
      `已加入 ${added} 支` +
      (failed.length ? `；無法解析 ${failed.length} 行：${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}` : "")
    );
  }

  return (
    <SectionCard title="🎬 首頁「最新動態」YouTube 影片">
      <p className="-mt-2 mb-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
        老闆可在這裡管理首頁「最新動態」區塊顯示的影片清單與抓取模式。儲存後最多 5 分鐘內生效（前端有快取）。
      </p>

      {/* 模式選擇 */}
      <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <Label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">抓取模式</Label>
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="hvm" checked={mode === "curated"}
              onChange={() => setCfg((c) => c ? { ...c, homeVideosMode: "curated" } : c)}
              className="mt-1 h-4 w-4 accent-[var(--color-phosphor)]" />
            <div>
              <div className="font-medium">策展模式（curated）</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">用下方清單固定顯示這些影片，依順序排版（第一支大格、其餘 4 小格）</div>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="hvm" checked={mode === "auto"}
              onChange={() => setCfg((c) => c ? { ...c, homeVideosMode: "auto" } : c)}
              className="mt-1 h-4 w-4 accent-[var(--color-phosphor)]" />
            <div>
              <div className="font-medium">自動模式（auto）</div>
              <div className="text-[11px] text-[var(--muted-foreground)]">自動抓 YouTube 頻道最新影片（套用下方「進階」的精選置頂／數量／排除／長片濾鏡）；API 失敗時用下方清單備用</div>
            </div>
          </label>
        </div>
      </div>

      {/* v406：進階（精選置頂 / 數量 / 排除 / 長片濾鏡）*/}
      <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">🎯 進階（auto 模式生效）</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <Label className="mb-1 block text-[11px] text-[var(--muted-foreground)]">⭐ 精選置頂影片 ID（放大格，留空＝自動用最新）</Label>
            <Input value={cfg.homeVideoFeaturedId ?? ""} placeholder="例：04q6aMx_4U4"
              onChange={(e) => setCfg((c) => c ? { ...c, homeVideoFeaturedId: e.target.value.trim() } : c)} />
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-[var(--muted-foreground)]">顯示數量</Label>
            <select value={cfg.homeVideoCount ?? 5}
              onChange={(e) => setCfg((c) => c ? { ...c, homeVideoCount: Number(e.target.value) } : c)}
              className="w-full rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>
              {[3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} 支</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-[11px] text-[var(--muted-foreground)]">影片類型</Label>
            <select value={cfg.homeVideoFilter ?? "all"}
              onChange={(e) => setCfg((c) => c ? { ...c, homeVideoFilter: e.target.value as "all" | "long" } : c)}
              className="w-full rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>
              <option value="all">長片 + Shorts（全部）</option>
              <option value="long">只要正式長片（排除 Shorts）</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-[11px] text-[var(--muted-foreground)]">🚫 排除的影片 ID（不想上首頁的素材片，一行一個或逗號分隔）</Label>
            <textarea rows={2} className="w-full rounded-md border p-2 text-xs font-mono" style={{ borderColor: "var(--border)" }}
              value={(cfg.homeVideoExcludeIds ?? []).join("\n")}
              placeholder={"abc123\ndef456"}
              onChange={(e) => setCfg((c) => c ? { ...c, homeVideoExcludeIds: e.target.value.split(/[\n,，\s]+/).map((s) => s.trim()).filter(Boolean) } : c)} />
          </div>
        </div>
      </div>

      {/* 影片清單 */}
      <div className="mb-3">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-xs font-semibold text-[var(--foreground)]">影片清單（{vids.length} 支）</Label>
          {vids.length > 0 && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
              onClick={() => { if (window.confirm("清空整個清單？")) update([]); }}>
              清空
            </Button>
          )}
        </div>
        {vids.length === 0 ? (
          <p className="rounded border border-dashed px-3 py-4 text-center text-[11px] text-[var(--muted-foreground)]"
            style={{ borderColor: "var(--border)" }}>
            還沒有影片，請從下方加入。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--muted)]">
                  <th className="border px-2 py-1.5 text-left whitespace-nowrap" style={{ borderColor: "var(--border)" }}>順序</th>
                  <th className="border px-2 py-1.5 text-left whitespace-nowrap" style={{ borderColor: "var(--border)" }}>類型</th>
                  <th className="border px-2 py-1.5 text-left whitespace-nowrap" style={{ borderColor: "var(--border)" }}>影片 ID</th>
                  <th className="border px-2 py-1.5 text-left" style={{ borderColor: "var(--border)" }}>標題（hover tooltip）</th>
                  <th className="border px-2 py-1.5 whitespace-nowrap" style={{ borderColor: "var(--border)" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {vids.map((v, i) => (
                  <tr key={`${v.id}-${i}`} className={i === 0 ? "bg-amber-50" : ""}>
                    <td className="border px-2 py-1 whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                      <span className="font-mono">{i + 1}</span>
                      {i === 0 && <span className="ml-1 rounded bg-amber-200 px-1 text-[9px] font-bold text-amber-900">大格</span>}
                    </td>
                    <td className="border px-2 py-1 whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                      <label className="flex cursor-pointer items-center gap-1 text-[11px]">
                        <input type="checkbox" checked={v.isShort}
                          onChange={(e) => {
                            const next = [...vids];
                            next[i] = { ...v, isShort: e.target.checked };
                            update(next);
                          }}
                          className="h-3 w-3" />
                        Shorts
                      </label>
                    </td>
                    <td className="border px-2 py-1 font-mono text-[11px]" style={{ borderColor: "var(--border)" }}>
                      <a href={`https://www.youtube.com/${v.isShort ? "shorts/" : "watch?v="}${v.id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-blue-700 hover:underline">
                        {v.id} ↗
                      </a>
                    </td>
                    <td className="border px-2 py-1" style={{ borderColor: "var(--border)" }}>
                      <Input value={v.title}
                        onChange={(e) => {
                          const next = [...vids];
                          next[i] = { ...v, title: e.target.value };
                          update(next);
                        }}
                        placeholder="(選填) 例：202606 萊萊鶯歌石剪輯"
                        className="h-7 text-xs" />
                    </td>
                    <td className="border px-1 py-1 whitespace-nowrap" style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveItem(i, -1)} disabled={i === 0}
                          className="rounded border px-1 text-[10px] disabled:opacity-30">↑</button>
                        <button onClick={() => moveItem(i, 1)} disabled={i === vids.length - 1}
                          className="rounded border px-1 text-[10px] disabled:opacity-30">↓</button>
                        <button onClick={() => delItem(i)}
                          className="rounded border border-red-300 px-1 text-[10px] text-red-700 hover:bg-red-50">刪</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 加入新影片 */}
      <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
        <Label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">加入新影片</Label>
        <textarea
          rows={3}
          className="w-full rounded-md border p-2 text-xs font-mono"
          style={{ borderColor: "var(--border)" }}
          placeholder={"貼 YouTube 連結，每行一個。支援：\nhttps://www.youtube.com/watch?v=XXXX\nhttps://www.youtube.com/shorts/XXXX\nhttps://youtu.be/XXXX\n或直接貼 11 碼影片 ID"}
          value={bulkInput}
          onChange={(e) => { setBulkInput(e.target.value); setErrMsg(""); }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={addOne}>+ 加入單筆</Button>
          <Button size="sm" variant="outline" onClick={bulkParse}>📋 批次解析</Button>
          {errMsg && <span className="text-[11px] text-amber-700">{errMsg}</span>}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          onClick={() => save("首頁影片", {
            homeVideosMode: mode,
            homeVideos: vids,
            homeVideoFeaturedId: cfg.homeVideoFeaturedId ?? "",
            homeVideoCount: cfg.homeVideoCount ?? 5,
            homeVideoExcludeIds: cfg.homeVideoExcludeIds ?? [],
            homeVideoFilter: cfg.homeVideoFilter ?? "all",
          })}
          disabled={saving === "首頁影片"}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving === "首頁影片" ? "儲存中..." : "儲存首頁影片設定"}
        </Button>
      </div>
    </SectionCard>
  );
}

