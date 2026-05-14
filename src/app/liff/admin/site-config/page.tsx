"use client";
import { useEffect, useState } from "react";
import { Save, RotateCcw, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiffShell } from "@/components/shell/LiffShell";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { useLiff } from "@/lib/liff/LiffProvider";
import {
  ACCENT_PALETTE,
  ICON_NAMES,
  DEFAULT_SITE_CONFIG,
  type SiteConfig,
  type SiteCard,
  type CardAccent,
  type CardIconName,
} from "@/lib/site-config";
import { cn } from "@/lib/utils";

export default function AdminSiteConfigPage() {
  const liff = useLiff();
  const [cfg, setCfg] = useState<SiteConfig>(DEFAULT_SITE_CONFIG);
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 折疊狀態
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    hero: false,
    sea: false,
    cards: false,
    footer: false,
    splash: false,
  });

  async function reload() {
    try {
      const d = await liff.fetchWithAuth<{
        config: SiteConfig;
        isDefault: boolean;
      }>("/api/admin/site-config");
      setCfg(d.config);
      setIsDefault(d.isDefault);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await liff.fetchWithAuth("/api/admin/site-config", {
        method: "POST",
        body: JSON.stringify(cfg),
      });
      setSavedAt(Date.now());
      setIsDefault(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!confirm("確定還原所有首頁設定為預設值？")) return;
    setSaving(true);
    try {
      await liff.fetchWithAuth("/api/admin/site-config", { method: "DELETE" });
      setCfg(DEFAULT_SITE_CONFIG);
      setIsDefault(true);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  // Card 操作 helpers
  function patchCard(idx: number, patch: Partial<SiteCard>) {
    setCfg((c) => ({
      ...c,
      cards: c.cards.map((card, i) => (i === idx ? { ...card, ...patch } : card)),
    }));
  }
  function moveCard(idx: number, dir: -1 | 1) {
    setCfg((c) => {
      const arr = [...c.cards];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return c;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      // 重算 order
      return { ...c, cards: arr.map((card, i) => ({ ...card, order: i + 1 })) };
    });
  }
  function removeCard(idx: number) {
    if (!confirm("確定刪除這張卡片？")) return;
    setCfg((c) => ({ ...c, cards: c.cards.filter((_, i) => i !== idx) }));
  }
  function addCard() {
    setCfg((c) => ({
      ...c,
      cards: [
        ...c.cards,
        {
          id: `card-${Date.now()}`,
          label: "新卡片",
          enLabel: "NEW",
          desc: "說明",
          href: "/liff/welcome",
          external: false,
          icon: "Anchor",
          accent: "phosphor",
          enabled: true,
          order: c.cards.length + 1,
        },
      ],
    }));
  }

  return (
    <LiffShell
      title="首頁設定"
      backHref="/liff/admin/dashboard"
      rightSlot={
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "儲存中..." : savedAt && Date.now() - savedAt < 3000 ? "已存" : "儲存"}
        </Button>
      }
    >
      <div className="space-y-3 px-4 pt-3">
        {err && (
          <div className="rounded-lg bg-[var(--color-coral)]/15 p-3 text-sm text-[var(--color-coral)]">
            {err}
          </div>
        )}

        <div className="rounded-lg bg-[var(--muted)] p-3 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          {isDefault ? (
            <>
              <Badge variant="muted" className="mr-1 text-[9px]">預設</Badge>
              還沒有自訂設定，下方為預設值。改完按右上儲存。
            </>
          ) : (
            <>已套用自訂設定。改完按儲存即時生效。</>
          )}
        </div>

        {/* Hero */}
        <CollapsibleCard
          title="主標題 (Hero)"
          complete
          open={openMap.hero}
          onToggle={() => setOpenMap((m) => ({ ...m, hero: !m.hero }))}
          summary={cfg.heroTitle}
        >
          <div className="space-y-2">
            <div>
              <Label className="text-xs">主標 (中文)</Label>
              <Input
                value={cfg.heroTitle}
                onChange={(e) => setCfg((c) => ({ ...c, heroTitle: e.target.value }))}
                placeholder="東 北 角 海 王 子"
              />
            </div>
            <div>
              <Label className="text-xs">副標 (英文)</Label>
              <Input
                value={cfg.heroSubtitle}
                onChange={(e) => setCfg((c) => ({ ...c, heroSubtitle: e.target.value }))}
                placeholder="NEIL OCEAN PRINCE"
              />
            </div>
            <div>
              <Label className="text-xs">問候語 (顯示在使用者名前)</Label>
              <Input
                value={cfg.heroGreeting}
                onChange={(e) => setCfg((c) => ({ ...c, heroGreeting: e.target.value }))}
                placeholder="嗨"
              />
            </div>
          </div>
        </CollapsibleCard>

        {/* 海況卡 */}
        <CollapsibleCard
          title="今日海況卡"
          complete
          open={openMap.sea}
          onToggle={() => setOpenMap((m) => ({ ...m, sea: !m.sea }))}
          summary={cfg.seaEnabled ? cfg.seaTitle : "已停用"}
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.seaEnabled}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, seaEnabled: e.target.checked }))
                }
              />
              啟用海況卡
            </label>
            <div>
              <Label className="text-xs">標題</Label>
              <Input
                value={cfg.seaTitle}
                onChange={(e) => setCfg((c) => ({ ...c, seaTitle: e.target.value }))}
                placeholder="明日海況沉穩 · 適合下水"
              />
            </div>
            <div>
              <Label className="text-xs">資訊行</Label>
              <Input
                value={cfg.seaInfo}
                onChange={(e) => setCfg((c) => ({ ...c, seaInfo: e.target.value }))}
                placeholder="北風 3 級｜浪高 1m｜水溫 24°C｜能見度 8-12m"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">按鈕文字</Label>
                <Input
                  value={cfg.seaCtaLabel ?? ""}
                  onChange={(e) =>
                    setCfg((c) => ({ ...c, seaCtaLabel: e.target.value || null }))
                  }
                  placeholder="查看明日場次"
                />
              </div>
              <div>
                <Label className="text-xs">按鈕連結</Label>
                <Input
                  value={cfg.seaCtaHref ?? ""}
                  onChange={(e) =>
                    setCfg((c) => ({ ...c, seaCtaHref: e.target.value || null }))
                  }
                  placeholder="/liff/calendar"
                />
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Cards 列表 */}
        <CollapsibleCard
          title="6 卡功能入口"
          complete
          open={openMap.cards}
          onToggle={() => setOpenMap((m) => ({ ...m, cards: !m.cards }))}
          summary={`${cfg.cards.filter((c) => c.enabled).length} 張啟用 / ${cfg.cards.length} 張`}
        >
          <div className="space-y-2">
            {cfg.cards.map((card, idx) => (
              <div
                key={card.id}
                className={cn(
                  "rounded-lg border-2 p-3",
                  card.enabled
                    ? "border-[var(--color-phosphor)]/40 bg-[var(--color-phosphor)]/5"
                    : "border-dashed border-[var(--border)] opacity-60",
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    #{card.order} {card.label}
                    {card.external && (
                      <Badge variant="muted" className="text-[9px]">外連</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveCard(idx, -1)}
                      disabled={idx === 0}
                      className="rounded p-0.5 hover:bg-[var(--muted)] disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCard(idx, 1)}
                      disabled={idx === cfg.cards.length - 1}
                      className="rounded p-0.5 hover:bg-[var(--muted)] disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCard(idx)}
                      className="rounded p-0.5 text-[var(--color-coral)] hover:bg-[var(--color-coral)]/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">中文標</Label>
                    <Input
                      value={card.label}
                      onChange={(e) => patchCard(idx, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">英文標</Label>
                    <Input
                      value={card.enLabel}
                      onChange={(e) => patchCard(idx, { enLabel: e.target.value })}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Label className="text-[10px]">說明</Label>
                  <Input
                    value={card.desc}
                    onChange={(e) => patchCard(idx, { desc: e.target.value })}
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-[10px]">
                    連結 URL{card.external && "（外連 https://...）"}
                  </Label>
                  <Input
                    value={card.href}
                    onChange={(e) => patchCard(idx, { href: e.target.value })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">圖示</Label>
                    <select
                      value={card.icon}
                      onChange={(e) =>
                        patchCard(idx, { icon: e.target.value as CardIconName })
                      }
                      className="h-9 w-full rounded-md border border-[var(--input)] bg-white px-2 text-xs"
                    >
                      {ICON_NAMES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px]">主色</Label>
                    <select
                      value={card.accent}
                      onChange={(e) =>
                        patchCard(idx, { accent: e.target.value as CardAccent })
                      }
                      className="h-9 w-full rounded-md border border-[var(--input)] bg-white px-2 text-xs"
                    >
                      {ACCENT_PALETTE.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={card.enabled}
                      onChange={(e) => patchCard(idx, { enabled: e.target.checked })}
                    />
                    啟用
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={card.external}
                      onChange={(e) => patchCard(idx, { external: e.target.checked })}
                    />
                    外部連結（用 /liff/go 加 splash）
                  </label>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={addCard}>
              + 新增卡片
            </Button>
          </div>
        </CollapsibleCard>

        {/* Footer */}
        <CollapsibleCard
          title="頁尾 slogan"
          complete
          open={openMap.footer}
          onToggle={() => setOpenMap((m) => ({ ...m, footer: !m.footer }))}
          summary={cfg.footerSloganZh}
        >
          <div className="space-y-2">
            <div>
              <Label className="text-xs">中文 slogan</Label>
              <Input
                value={cfg.footerSloganZh}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, footerSloganZh: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">英文 slogan</Label>
              <Input
                value={cfg.footerSloganEn}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, footerSloganEn: e.target.value }))
                }
              />
            </div>
          </div>
        </CollapsibleCard>

        {/* Splash */}
        <CollapsibleCard
          title="Splash 開場動畫"
          complete
          open={openMap.splash}
          onToggle={() => setOpenMap((m) => ({ ...m, splash: !m.splash }))}
          summary={
            cfg.splashEnabled
              ? `啟用 ‧ ${cfg.splashDurationMs / 1000}秒 ‧ 冷卻 ${Math.round(cfg.splashCooldownMs / 60000)}分`
              : "已停用"
          }
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.splashEnabled}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, splashEnabled: e.target.checked }))
                }
              />
              啟用 splash (直接進深層 link 時顯示)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">秒數 (ms)</Label>
                <Input
                  type="number"
                  value={cfg.splashDurationMs}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      splashDurationMs: Number(e.target.value) || 3000,
                    }))
                  }
                />
                <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                  目前 {cfg.splashDurationMs / 1000} 秒
                </div>
              </div>
              <div>
                <Label className="text-xs">冷卻 (ms)</Label>
                <Input
                  type="number"
                  value={cfg.splashCooldownMs}
                  onChange={(e) =>
                    setCfg((c) => ({
                      ...c,
                      splashCooldownMs: Number(e.target.value) || 3600000,
                    }))
                  }
                />
                <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                  目前 {Math.round(cfg.splashCooldownMs / 60000)} 分
                </div>
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* 天氣自動取消 */}
        <CollapsibleCard
          title="🌬 天氣自動取消"
          complete
          open={openMap.splash}
          onToggle={() => setOpenMap((m) => ({ ...m, splash: m.splash }))}
          summary={
            cfg.weatherAutoCancel
              ? "⚠ 開：cron 偵測風速超標自動取消所有客戶 + 推通知"
              : "✓ 關（推薦）：cron 只推警告給教練/admin，等手動決定"
          }
        >
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.weatherAutoCancel}
                onChange={(e) =>
                  setCfg((c) => ({ ...c, weatherAutoCancel: e.target.checked }))
                }
              />
              啟用全自動取消（不需教練確認）
            </label>
            <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[10px] leading-relaxed text-[var(--muted-foreground)]">
              <div className="font-bold text-[var(--foreground)] mb-1">
                {cfg.weatherAutoCancel ? "🔴 開啟模式" : "🟢 關閉模式（推薦）"}
              </div>
              {cfg.weatherAutoCancel ? (
                <>
                  cron 每天 06:00 抓 CWA 海況：若風速 &gt; 閾值，
                  <b className="text-[var(--color-coral)]">
                    自動把當日所有 open 場次設為 cancelled
                  </b>
                  ，並推 Flex + Email 通知客戶。
                  <br />
                  風險：cron 抓的是「凌晨」風速，跟出航時段可能差很多，可能誤殺。
                </>
              ) : (
                <>
                  cron 同樣抓 CWA 海況，但
                  <b className="text-[var(--color-phosphor)]">
                    只推 LINE 文字警告給場次教練 + admin
                  </b>
                  ，不動 DB、不通知客戶。教練/admin 決定後手動到「開團管理」取消場次。
                </>
              )}
            </div>
          </div>
        </CollapsibleCard>

        {/* 還原預設 */}
        <Button
          variant="outline"
          className="w-full"
          onClick={resetToDefault}
        >
          <RotateCcw className="h-4 w-4" />
          還原為預設首頁
        </Button>
      </div>
    </LiffShell>
  );
}
