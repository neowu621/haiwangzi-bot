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
  // v264：自動發送（每日天氣回報）
  dailyWeatherReportEnabled?: boolean;
  dailyWeatherReportRecipients?: string[];
  dailyWeatherReportLastSentAt?: string | null;
  // v315：訂單日報
  dailyBriefingEnabled?: boolean;
  dailyBriefingIncludeCoaches?: boolean;
}

const DEFAULT_GEAR: GearPrices = {
  BCD: 200, regulator: 200, wetsuit: 300, fins: 100,
  mask: 100, computer: 300, full_set: 800,
};
const GEAR_LABELS: Record<keyof GearPrices, string> = {
  BCD: "BCD", regulator: "調節器", wetsuit: "防寒衣",
  fins: "蛙鞋", mask: "面鏡", computer: "潛水電腦錶", full_set: "整套(七折)",
};
const DEFAULT_TRIP: TripPricing = {
  baseTrip: 1200, extraTank: 500, nightDive: 0, scooterRental: 0,
};
// v184：移除夜潛加成 + 水上摩托車（v155 已停用業務功能）
const TRIP_LABELS: Record<string, string> = {
  baseTrip: "基本潛水費", extraTank: "額外氣瓶",
};

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

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
      <Label className="text-sm text-[var(--foreground)]">{label}</Label>
      {children}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function SettingsPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
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

        {/* v255：8 大分類改用 Tab 切換（原本一直捲容易漏 — 例如 VIP 升等獎金藏在金額底部找不到） */}
        <Tabs defaultValue="home" className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-1 sm:grid-cols-9">
            <TabsTrigger value="home">🏠 首頁</TabsTrigger>
            <TabsTrigger value="links">🔗 連結</TabsTrigger>
            <TabsTrigger value="payment">💳 付款</TabsTrigger>
            <TabsTrigger value="money">💰 金額</TabsTrigger>
            <TabsTrigger value="upload">📤 上傳</TabsTrigger>
            <TabsTrigger value="policy">📋 政策</TabsTrigger>
            <TabsTrigger value="autosend">📨 發送</TabsTrigger>
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
              客戶選 LINE Pay 時，會看到下方 QR 圖片 + Lite ID。客戶完成轉帳後需上傳截圖。
            </p>
            <div className="space-y-3">
              <FieldRow label="LINE Pay QR 圖片 URL">
                <Input
                  value={cfg?.paymentInfo?.linepay?.qrUrl ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), linepay: { ...(c.paymentInfo?.linepay ?? {}), qrUrl: e.target.value } } } : c)}
                  placeholder="https://i.imgur.com/xxxxx.png 或其他圖床網址"
                />
              </FieldRow>
              <FieldRow label="LINE Pay Lite ID">
                <Input
                  value={cfg?.paymentInfo?.linepay?.liteId ?? ""}
                  onChange={(e) => setCfg((c) => c ? { ...c, paymentInfo: { ...(c.paymentInfo ?? {}), linepay: { ...(c.paymentInfo?.linepay ?? {}), liteId: e.target.value } } } : c)}
                  placeholder="例：@haiwangzi 或您的個人 LINE Pay ID"
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

          {/* B1 裝備租借 */}
          <div className="mb-5">
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">裝備租借費率（NT$）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(Object.keys(GEAR_LABELS) as Array<keyof GearPrices>).map(key => (
                <div key={key}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">{GEAR_LABELS[key]}</Label>
                  <NumberInput min={0} value={gear[key]}
                    onChange={(n) => setCfg(c => c ? { ...c, gearRentalPrices: { ...gear, [key]: n } } : c)} />
                </div>
              ))}
            </div>
          </div>

          {/* B2 場次預設定價 — v184: 移除夜潛加成 + 水上摩托車 */}
          <div className="mb-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">場次預設定價（新增場次時的預設值，NT$）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["baseTrip", "extraTank"] as const).map(key => (
                <div key={key}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">{TRIP_LABELS[key]}</Label>
                  <NumberInput min={0} value={trip[key as keyof TripPricing]}
                    onChange={(n) => setCfg(c => c ? { ...c, defaultTripPricing: { ...trip, [key]: n } } : c)} />
                </div>
              ))}
            </div>
          </div>

          {/* B3 其他費用 */}
          <div className="mb-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">其他費用</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">教練預設費用/潛（NT$）</Label>
                <NumberInput min={0} value={cfg.defaultCoachFee}
                  onChange={(n) => setCfg(c => c ? { ...c, defaultCoachFee: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">生日抵用金（NT$，0=停用）</Label>
                <NumberInput min={0} value={cfg.birthdayCreditAmount}
                  onChange={(n) => setCfg(c => c ? { ...c, birthdayCreditAmount: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">生日抵用金有效天數（0=永不過期）</Label>
                <NumberInput min={0} value={cfg.birthdayCreditExpiryDays ?? 360}
                  onChange={(n) => setCfg(c => c ? { ...c, birthdayCreditExpiryDays: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">天氣取消風速門檻（m/s）</Label>
                <NumberInput min={0} value={cfg.weatherWindThreshold}
                  onChange={(n) => setCfg(c => c ? { ...c, weatherWindThreshold: n || 10 } : c)} />
              </div>
            </div>
          </div>

          {/* B3.5 抵用金有效天數 — v185 */}
          <div className="mb-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">
              🎁 抵用金有效天數（從發放日起算，0 = 永不過期）
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">生日抵用金</Label>
                <NumberInput min={0} max={3650} value={cfg.birthdayCreditExpiryDays ?? 360}
                  onChange={(n) => setCfg(c => c ? { ...c, birthdayCreditExpiryDays: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">VIP 升等獎勵</Label>
                <NumberInput min={0} max={3650} value={cfg.vipUpgradeCreditExpiryDays ?? 360}
                  onChange={(n) => setCfg(c => c ? { ...c, vipUpgradeCreditExpiryDays: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">Admin 手動發放（預設）</Label>
                <NumberInput min={0} max={3650} value={cfg.adminGrantCreditExpiryDays ?? 360}
                  onChange={(n) => setCfg(c => c ? { ...c, adminGrantCreditExpiryDays: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">退款轉抵用金</Label>
                <NumberInput min={0} max={3650} value={cfg.refundCreditExpiryDays ?? 0}
                  onChange={(n) => setCfg(c => c ? { ...c, refundCreditExpiryDays: n } : c)} />
              </div>
            </div>
            <p className="mt-2 text-[10px] text-[var(--muted-foreground)]">
              ※ 設 0 = 永不過期。退款轉抵用金通常設 0（不限期）。Admin 手動發放可在發放時個別覆寫。
            </p>
          </div>

          {/* B4 VIP 升等獎金 */}
          <div className="mb-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">VIP 升等獎金（NT$，0=停用）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["2","3","4","5"] as const).map(lv => (
                <div key={lv}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">升到 LV{lv}</Label>
                  <NumberInput min={0} value={vipCredits[lv] ?? 0}
                    onChange={(n) => setCfg(c => c ? { ...c, vipUpgradeCredits: { ...vipCredits, [lv]: n } } : c)} />
                </div>
              ))}
            </div>
          </div>

          {/* v261 B5：首單付款獎勵 */}
          <div className="mb-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-1 text-sm font-medium text-[var(--foreground)]">🎁 首單付款獎勵</p>
            <p className="mb-3 text-[11px] text-[var(--muted-foreground)]">
              客戶第一筆訂單付款完成 + Email 已驗證 → 自動發抵用金（一人僅一次）。
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">金額（NT$，0=停用）</Label>
                <NumberInput min={0} value={cfg.firstOrderRewardAmount ?? 100}
                  onChange={(n) => setCfg(c => c ? { ...c, firstOrderRewardAmount: n } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">有效天數（0=永不過期）</Label>
                <NumberInput min={0} max={3650} value={cfg.firstOrderRewardExpiryDays ?? 360}
                  onChange={(n) => setCfg(c => c ? { ...c, firstOrderRewardExpiryDays: n } : c)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("金額設定", {
                gearRentalPrices: gear,
                defaultTripPricing: trip,
                defaultCoachFee: cfg.defaultCoachFee,
                birthdayCreditAmount: cfg.birthdayCreditAmount,
                birthdayCreditExpiryDays: cfg.birthdayCreditExpiryDays ?? 360,
                vipUpgradeCreditExpiryDays: cfg.vipUpgradeCreditExpiryDays ?? 360,
                adminGrantCreditExpiryDays: cfg.adminGrantCreditExpiryDays ?? 360,
                refundCreditExpiryDays: cfg.refundCreditExpiryDays ?? 0,
                weatherWindThreshold: cfg.weatherWindThreshold,
                vipUpgradeCredits: vipCredits,
                firstOrderRewardAmount: cfg.firstOrderRewardAmount ?? 100,
                firstOrderRewardExpiryDays: cfg.firstOrderRewardExpiryDays ?? 360,
              })}
              disabled={saving === "金額設定"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "金額設定" ? "儲存中..." : "儲存金額設定"}
            </Button>
          </div>
        </SectionCard>

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

  React.useEffect(() => {
    setUsersLoading(true);
    adminFetch<{ users: AutoSendUser[] }>("/api/admin/users?role=admin,boss,coach")
      .then((d) => {
        // 只留有真實 role 的（admin/boss/coach）
        const filtered = (d.users ?? []).filter((u) => {
          const rs = u.roles && u.roles.length > 0 ? u.roles : [u.role];
          return rs.some((r) => r === "admin" || r === "boss" || r === "coach");
        });
        setUsers(filtered);
      })
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const recipients = cfg.dailyWeatherReportRecipients ?? [];
  const recipientSet = new Set(recipients);

  function toggleLine(userId: string) {
    const tag = `line:${userId}`;
    const next = recipientSet.has(tag)
      ? recipients.filter((r) => r !== tag)
      : [...recipients, tag];
    setCfg((c) => (c ? { ...c, dailyWeatherReportRecipients: next } : c));
  }
  function toggleEmail(email: string) {
    const tag = `email:${email}`;
    const next = recipientSet.has(tag)
      ? recipients.filter((r) => r !== tag)
      : [...recipients, tag];
    setCfg((c) => (c ? { ...c, dailyWeatherReportRecipients: next } : c));
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

      <div className="rounded-lg border p-4 mb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">🌊 每日天氣回報</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              抓中央氣象署 CWA 即時測站（466940 基隆 + 467080 宜蘭）的風速 / 氣溫 + 今日 / 明日場次摘要 → LINE / Email 推送。
            </p>
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

        {/* v268：收件人 picker — 從 admin/boss/coach 用戶挑 */}
        <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">
          收件人（從管理員 / 教練清單勾選）
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

        <div className="mt-2 rounded bg-[var(--muted)]/30 p-2 text-[10px] text-[var(--muted-foreground)]">
          已選 {recipients.length} 個目標。最後一次發送：
          {cfg.dailyWeatherReportLastSentAt
            ? new Date(cfg.dailyWeatherReportLastSentAt).toLocaleString("zh-TW")
            : "（尚未發送）"}
        </div>

        {/* v268：測試按鈕 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
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
              if (!confirm(`真的要立即發送給 ${recipients.length} 個收件人嗎？`)) return;
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
          <pre className="mt-2 max-h-72 overflow-y-auto rounded bg-white border p-3 text-[11px] whitespace-pre-wrap font-mono text-[var(--foreground)]" style={{ borderColor: "var(--border)" }}>
            {testResult}
          </pre>
        )}
      </div>

      {/* v315：訂單日報設定 */}
      <div className="mt-4 rounded-xl border-2 p-4" style={{ borderColor: "var(--border)", background: "rgba(96,165,250,0.06)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">📋 每晚 21:00 預報明日</p>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              每天 21:00 自動發送「明日預報」（建議 Cronicle 排程 cron: <span className="font-mono">0 21 * * *</span>，timezone: Asia/Taipei）。<br/>
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

      <div className="flex justify-end">
        <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
          onClick={() => save("自動發送", {
            dailyWeatherReportEnabled: cfg.dailyWeatherReportEnabled ?? false,
            dailyWeatherReportRecipients: cfg.dailyWeatherReportRecipients ?? [],
            dailyBriefingEnabled: cfg.dailyBriefingEnabled ?? true,
            dailyBriefingIncludeCoaches: cfg.dailyBriefingIncludeCoaches ?? true,
          })}
          disabled={saving === "自動發送"}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving === "自動發送" ? "儲存中..." : "儲存自動發送設定"}
        </Button>
      </div>

      <div className="mt-3 rounded bg-[var(--muted)]/40 p-3 text-[11px] text-[var(--muted-foreground)] leading-relaxed">
        📋 <b>Cronicle 兩個排程</b>（一天兩次）：<br />
        晚上 10:00 台灣時間 → UTC 14:00 → <code>0 14 * * *</code><br />
        早上 05:00 台灣時間 → UTC 21:00 → <code>0 21 * * *</code><br />
        Command（兩個 event 共用）：<br />
        <code className="block mt-1 break-all">
          curl -fsS -X POST -H &quot;Authorization: Bearer $HAIWANGZI_CRON_SECRET&quot; &quot;$HAIWANGZI_BASE_URL/api/cron/daily-weather-report&quot;
        </code>
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
  "AllowedOrigins": ["https://haiwangzi.zeabur.app"],
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
