"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/version";
import { ExternalLink, Save, Send, RefreshCw, Trash2 } from "lucide-react";

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
  vipUpgradeCredits: Partial<VipUpgradeCredits>;
  weatherWindThreshold: number;
  // 外部連結（Rich Menu / LIFF 用）
  externalLinks: ExternalLinks;
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
  baseTrip: 1200, extraTank: 500, nightDive: 300, scooterRental: 500,
};
const TRIP_LABELS: Record<keyof TripPricing, string> = {
  baseTrip: "基本潛水費", extraTank: "額外氣瓶", nightDive: "夜潛加成", scooterRental: "水上摩托車",
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
      setCfg(data.config);
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
      "🚨 系統初始重置：將清空所有營運資料（訂單、場次、潛水團、付款憑證、教練、潛點、提醒紀錄、訊息範本、操作紀錄、媒體照片）並把會員的衍生欄位（VIP 等級、累計消費、禮金餘額）歸零。\n\n保留：會員帳號（lineUserId, displayName, role 等）+ 系統設定。\n\n此操作不可復原！請輸入「系統初始重置」繼續："
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
        `• 禮金交易 ${r.deleted.creditTxs} 筆`,
        `• 提醒紀錄 ${r.deleted.reminderLogs} 筆`,
        `• 訊息範本 ${r.deleted.templates} 筆`,
        `• 操作紀錄 ${r.deleted.audits} 筆`,
        `• 媒體照片 ${r.deleted.tripPhotos + r.deleted.tripMedia} 張`,
        `• 已重設 ${r.deleted.usersReset} 位會員的衍生欄位（VIP/累計/禮金）`,
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
        {ok && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {ok}</div>}

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

        {/* ── B. 金額設定 ──────────────────── */}
        <SectionCard title="💰 金額設定">

          {/* B1 裝備租借 */}
          <div className="mb-5">
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">裝備租借費率（NT$）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(Object.keys(GEAR_LABELS) as Array<keyof GearPrices>).map(key => (
                <div key={key}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">{GEAR_LABELS[key]}</Label>
                  <Input type="number" value={gear[key]}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setCfg(c => c ? { ...c, gearRentalPrices: { ...gear, [key]: val } } : c);
                    }} />
                </div>
              ))}
            </div>
          </div>

          {/* B2 場次預設定價 */}
          <div className="mb-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">場次預設定價（新增場次時的預設值，NT$）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(TRIP_LABELS) as Array<keyof TripPricing>).map(key => (
                <div key={key}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">{TRIP_LABELS[key]}</Label>
                  <Input type="number" value={trip[key]}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setCfg(c => c ? { ...c, defaultTripPricing: { ...trip, [key]: val } } : c);
                    }} />
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
                <Input type="number" value={cfg.defaultCoachFee}
                  onChange={e => setCfg(c => c ? { ...c, defaultCoachFee: parseInt(e.target.value) || 0 } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">生日禮金（NT$，0=停用）</Label>
                <Input type="number" value={cfg.birthdayCreditAmount}
                  onChange={e => setCfg(c => c ? { ...c, birthdayCreditAmount: parseInt(e.target.value) || 0 } : c)} />
              </div>
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">天氣取消風速門檻（m/s）</Label>
                <Input type="number" value={cfg.weatherWindThreshold}
                  onChange={e => setCfg(c => c ? { ...c, weatherWindThreshold: parseInt(e.target.value) || 10 } : c)} />
              </div>
            </div>
          </div>

          {/* B4 VIP 升等獎金 */}
          <div className="mb-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-3 text-sm font-medium text-[var(--foreground)]">VIP 升等獎金（NT$，0=停用）</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["2","3","4","5"] as const).map(lv => (
                <div key={lv}>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">升到 LV{lv}</Label>
                  <Input type="number" value={vipCredits[lv] ?? 0}
                    onChange={e => {
                      const val = parseInt(e.target.value) || 0;
                      setCfg(c => c ? { ...c, vipUpgradeCredits: { ...vipCredits, [lv]: val } } : c);
                    }} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
              onClick={() => save("金額設定", {
                gearRentalPrices: gear,
                defaultTripPricing: trip,
                defaultCoachFee: cfg.defaultCoachFee,
                birthdayCreditAmount: cfg.birthdayCreditAmount,
                weatherWindThreshold: cfg.weatherWindThreshold,
                vipUpgradeCredits: vipCredits,
              })}
              disabled={saving === "金額設定"}>
              <Save className="mr-1.5 h-4 w-4" />
              {saving === "金額設定" ? "儲存中..." : "儲存金額設定"}
            </Button>
          </div>
        </SectionCard>

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

            {/* 系統初始重置 — 更徹底，連教練/潛點/禮金紀錄/訊息範本/操作紀錄都清掉，
                並把會員 VIP/累計/禮金歸零（保留會員帳號本身） */}
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3" style={{ borderColor: "var(--color-coral)" }}>
              <div>
                <div className="text-sm font-medium">系統初始重置（保留會員帳號）</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  把系統回到剛部署狀態：清空所有營運資料 + 教練/潛點 + 禮金紀錄 + 訊息範本 + 操作紀錄 + 媒體照片，並把會員的 VIP/累計消費/禮金餘額歸零。會員帳號本身保留。
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

        {/* ── D. 系統工具 ──────────────────── */}
        <SectionCard title="🔧 系統工具">
          <div className="space-y-4">
            {/* Version */}
            <FieldRow label="目前版本">
              <span className="rounded bg-[var(--muted)] px-2 py-1 font-mono text-sm" style={{ color: "var(--color-phosphor)" }}>
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
                  className="flex items-center gap-1 text-sm hover:underline" style={{ color: "var(--color-phosphor)" }}>
                  /api/healthz <ExternalLink className="h-3 w-3" />
                </a>
                <a href="/api/dbcheck" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm hover:underline" style={{ color: "var(--color-phosphor)" }}>
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

      </div>
    </AdminShell>
  );
}
