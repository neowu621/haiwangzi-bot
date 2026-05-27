"use client";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_VERSION } from "@/lib/version";
import { ExternalLink, Save, Send, RefreshCw } from "lucide-react";

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

  // ── 補發編號 ──
  const [backfillPending, setBackfillPending] = useState<{ users: number; trips: number; tours: number; bookings: number; total: number } | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  async function checkBackfill() {
    setBackfillLoading(true);
    setBackfillResult(null);
    try {
      const d = await adminFetch<{ users: number; trips: number; tours: number; bookings: number; total: number }>("/api/admin/backfill-codes");
      setBackfillPending(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "查詢失敗");
    } finally {
      setBackfillLoading(false);
    }
  }

  async function runBackfill() {
    if (!confirm(`確定要為所有缺少編號的記錄（${backfillPending?.total ?? "?"}筆）補發新格式編號？`)) return;
    setBackfillRunning(true);
    setBackfillResult(null);
    try {
      const r = await adminFetch<{ users: number; trips: number; tours: number; bookings: number; errors: number }>("/api/admin/backfill-codes", { method: "POST" });
      setBackfillResult(`✓ 補發完成：會員 ${r.users} 筆、日潛 ${r.trips} 筆、潛水團 ${r.tours} 筆、訂單 ${r.bookings} 筆${r.errors > 0 ? `（失敗 ${r.errors} 筆）` : ""}`);
      setBackfillPending(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "補發失敗");
    } finally {
      setBackfillRunning(false);
    }
  }

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

        {/* ── C. 系統工具 ──────────────────── */}
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

        {/* ── D. 補發編號 ──────────────────── */}
        <SectionCard title="🔢 補發編號">
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            將所有尚未有編號的會員、日潛場次、潛水團、訂單，依各筆資料的建立日期補發新格式編號
            （<span className="font-mono text-xs">M/D/T/O&#x7b;YYYYMMDD&#x7d;-XX</span>）。每次執行只補發缺少的，不會覆蓋已有編號的資料。
          </p>

          {/* 查詢缺少筆數 */}
          {backfillPending === null && !backfillResult && (
            <Button size="sm" variant="outline" onClick={checkBackfill} disabled={backfillLoading}>
              {backfillLoading ? "查詢中..." : "查詢缺少編號的筆數"}
            </Button>
          )}

          {/* 顯示查詢結果 */}
          {backfillPending !== null && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                  {[
                    ["會員", backfillPending.users],
                    ["日潛場次", backfillPending.trips],
                    ["潛水團", backfillPending.tours],
                    ["訂單", backfillPending.bookings],
                  ].map(([label, count]) => (
                    <div key={label as string} className="flex justify-between">
                      <span className="text-[var(--muted-foreground)]">{label}</span>
                      <span className={`font-semibold tabular-nums ${Number(count) > 0 ? "text-[var(--color-coral)]" : "text-[var(--muted-foreground)]"}`}>
                        {count} 筆
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 border-t pt-2" style={{ borderColor: "var(--border)" }}>
                  <div className="flex justify-between font-semibold">
                    <span>合計</span>
                    <span className={backfillPending.total > 0 ? "text-[var(--color-coral)]" : "text-[var(--muted-foreground)]"}>
                      {backfillPending.total} 筆
                    </span>
                  </div>
                </div>
              </div>

              {backfillPending.total === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-phosphor)" }}>
                  ✓ 所有資料都已有編號，無需補發
                </p>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={runBackfill}
                    disabled={backfillRunning}
                    style={{ background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" }}
                  >
                    {backfillRunning ? "補發中，請稍候..." : `立即補發 ${backfillPending.total} 筆`}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setBackfillPending(null)}>
                    取消
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* 補發結果 */}
          {backfillResult && (
            <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>
              {backfillResult}
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={checkBackfill} disabled={backfillLoading}>
                  再次確認
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </AdminShell>
  );
}
