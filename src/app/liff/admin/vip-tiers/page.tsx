"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, RotateCcw, Save, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import type { VipTier } from "@/lib/vip-tier";

const EMOJI_OPTIONS = [
  "🦐", "🦞", "🦀", "🐢", "🐠", "🐡", "🐙", "🦑", "🪼", "🐬",
  "🐋", "🦈", "🐳", "🦭", "🦦", "⭐", "💎", "🏆", "👑", "🌊",
];

const COLOR_PRESET = [
  { name: "粉紅", value: "#FFB1B1" },
  { name: "珊瑚", value: "#FF7B5A" },
  { name: "螢光綠", value: "#00D9CB" },
  { name: "深藍", value: "#1B3A5C" },
  { name: "金", value: "#FFB800" },
  { name: "紫", value: "#A78BFA" },
];

function emptyTier(level: number): VipTier {
  return {
    level: level as VipTier["level"],
    key: `tier_${level}`,
    name: `LV ${level}`,
    enName: `Tier ${level}`,
    emoji: "🐠",
    minLogs: 0,
    minSpend: 0,
    benefits: [],
    color: "#999999",
  };
}

export default function AdminVipTiersPage() {
  const liff = useLiff();
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const r = await liff.fetchWithAuth<{ tiers: VipTier[] }>(
        "/api/admin/vip-tiers",
      );
      setTiers(r.tiers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  function updateTier(i: number, patch: Partial<VipTier>) {
    setTiers((arr) => {
      const next = [...arr];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addBenefit(i: number) {
    updateTier(i, { benefits: [...(tiers[i].benefits ?? []), ""] });
  }

  function updateBenefit(i: number, bi: number, val: string) {
    const next = [...(tiers[i].benefits ?? [])];
    next[bi] = val;
    updateTier(i, { benefits: next });
  }

  function removeBenefit(i: number, bi: number) {
    const next = (tiers[i].benefits ?? []).filter((_, idx) => idx !== bi);
    updateTier(i, { benefits: next });
  }

  function addTier() {
    const nextLevel = Math.max(0, ...tiers.map((t) => t.level)) + 1;
    if (nextLevel > 10) {
      alert("最多 10 個等級");
      return;
    }
    setTiers([...tiers, emptyTier(nextLevel)]);
  }

  function removeTier(i: number) {
    if (tiers.length <= 1) {
      alert("至少要保留 1 個等級");
      return;
    }
    if (!confirm(`刪除 LV ${tiers[i].level} ${tiers[i].name}？`)) return;
    setTiers((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const r = await liff.fetchWithAuth<{
        ok: boolean;
        recalculated: number;
        promoted: number;
      }>("/api/admin/vip-tiers", {
        method: "POST",
        body: JSON.stringify({ tiers }),
      });
      setResult(
        `✓ 已儲存。重算 ${r.recalculated} 位會員等級，其中 ${r.promoted} 位變動了等級。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!confirm("確定還原為內建預設（小蝦/龍蝦/海龜/鬼蝠魟/鯨鯊）？")) return;
    try {
      await liff.fetchWithAuth("/api/admin/vip-tiers", { method: "DELETE" });
      await reload();
      setResult("✓ 已還原為內建預設");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) {
    return (
      <LiffShell title="會員等級設定" backHref="/liff/admin/dashboard">
        <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
          載入中...
        </div>
      </LiffShell>
    );
  }

  return (
    <LiffShell title="會員等級設定" backHref="/liff/admin/dashboard">
      <div className="space-y-2 px-4 pt-4">
        <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
          設定海王子潛水會員的等級門檻。升等條件是「<b>OR</b>」：潛水次數 <b>或</b>{" "}
          累計消費金額，<b>任一達標</b>就升等。
          <br />
          儲存後系統會自動重算所有會員等級。
        </div>

        {error && (
          <Card className="bg-[var(--color-coral)]/15 p-3 text-sm">
            <AlertTriangle className="inline h-4 w-4" /> {error}
          </Card>
        )}
        {result && (
          <Card className="bg-[var(--color-phosphor)]/15 p-3 text-sm">
            {result}
          </Card>
        )}

        {tiers.map((t, i) => (
          <Card key={i} style={{ borderLeft: `4px solid ${t.color}` }}>
            <CardContent className="p-3 space-y-2.5">
              {/* Level + Emoji 主視覺 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{t.emoji}</span>
                  <div>
                    <div className="text-sm font-bold">
                      LV {t.level} · {t.name}
                    </div>
                    <div className="text-[10px] text-[var(--muted-foreground)]">
                      {t.enName}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeTier(i)}
                  title="刪除此等級"
                >
                  <Trash2 className="h-3 w-3 text-[var(--color-coral)]" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">等級數字</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={t.level}
                    onChange={(e) =>
                      updateTier(i, {
                        level: Math.max(1, Math.min(10, Number(e.target.value))) as VipTier["level"],
                      })
                    }
                  />
                </div>
                <div>
                  <Label className="text-[10px]">識別 key</Label>
                  <Input
                    value={t.key}
                    onChange={(e) => updateTier(i, { key: e.target.value })}
                    placeholder="shrimp"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">中文名稱</Label>
                  <Input
                    value={t.name}
                    onChange={(e) => updateTier(i, { name: e.target.value })}
                    placeholder="小蝦"
                  />
                </div>
                <div>
                  <Label className="text-[10px]">英文名稱</Label>
                  <Input
                    value={t.enName}
                    onChange={(e) => updateTier(i, { enName: e.target.value })}
                    placeholder="Shrimp"
                  />
                </div>
              </div>

              <div>
                <Label className="text-[10px]">Emoji</Label>
                <div className="flex flex-wrap gap-1">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => updateTier(i, { emoji: e })}
                      className={
                        t.emoji === e
                          ? "h-8 w-8 rounded-md border-2 border-[var(--color-phosphor)] bg-[var(--color-phosphor)]/15 text-lg"
                          : "h-8 w-8 rounded-md border border-[var(--border)] text-lg hover:bg-[var(--muted)]"
                      }
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-[10px]">主題色</Label>
                <div className="flex flex-wrap gap-1">
                  {COLOR_PRESET.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => updateTier(i, { color: c.value })}
                      style={{ backgroundColor: c.value }}
                      className={
                        t.color === c.value
                          ? "h-8 px-2 rounded-md border-2 border-white shadow-md text-[10px] text-white font-bold"
                          : "h-8 px-2 rounded-md text-[10px] text-white opacity-70 hover:opacity-100"
                      }
                    >
                      {c.name}
                    </button>
                  ))}
                  <Input
                    type="color"
                    value={t.color}
                    onChange={(e) => updateTier(i, { color: e.target.value })}
                    className="h-8 w-12 cursor-pointer p-0"
                  />
                </div>
              </div>

              <div className="rounded-md bg-[var(--muted)]/30 p-2 space-y-2">
                <div className="text-[10px] font-bold text-[var(--muted-foreground)]">
                  升級條件 (OR 任一達標)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">最低潛水數</Label>
                    <Input
                      type="number"
                      min={0}
                      value={t.minLogs}
                      onChange={(e) =>
                        updateTier(i, {
                          minLogs: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">最低累計消費 (NT$)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={t.minSpend}
                      onChange={(e) =>
                        updateTier(i, {
                          minSpend: Math.max(0, Number(e.target.value)),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-[10px]">會員福利清單</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addBenefit(i)}
                  >
                    <Plus className="h-3 w-3" />
                    加一條
                  </Button>
                </div>
                <div className="mt-1 space-y-1">
                  {(t.benefits ?? []).map((b, bi) => (
                    <div key={bi} className="flex gap-1">
                      <Input
                        value={b}
                        onChange={(e) => updateBenefit(i, bi, e.target.value)}
                        placeholder="例：潛水裝備租借 95 折"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => removeBenefit(i, bi)}
                      >
                        <Trash2 className="h-3 w-3 text-[var(--color-coral)]" />
                      </Button>
                    </div>
                  ))}
                  {(t.benefits ?? []).length === 0 && (
                    <div className="text-[10px] text-[var(--muted-foreground)] italic">
                      還沒加任何福利
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <Button onClick={addTier} variant="outline" className="w-full">
          <Plus className="h-4 w-4" />
          新增一個等級
        </Button>

        <div className="sticky bottom-2 z-10 grid grid-cols-2 gap-2 rounded-md bg-[var(--background)] p-2 shadow-lg ring-1 ring-[var(--border)]">
          <Button variant="outline" onClick={resetDefault}>
            <RotateCcw className="h-4 w-4" />
            還原預設
          </Button>
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "儲存中..." : "儲存 + 重算所有會員"}
          </Button>
        </div>
      </div>
    </LiffShell>
  );
}
