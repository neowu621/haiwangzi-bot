"use client";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save, RotateCcw } from "lucide-react";

interface VipTier {
  level: number;
  key: string;
  name: string;
  enName: string;
  emoji: string;
  color: string;
  minLogs: number;
  minSpend: number;
  benefits: string[];
}

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

export default function VipTiersPage() {
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await adminFetch<{ tiers: VipTier[]; isDefault: boolean }>("/api/admin/vip-tiers");
      setTiers(data.tiers);
      setIsDefault(data.isDefault);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateTier(idx: number, patch: Partial<VipTier>) {
    setTiers(ts => ts.map((t, i) => i === idx ? { ...t, ...patch } : t));
  }

  function updateBenefit(tierIdx: number, benefitIdx: number, val: string) {
    setTiers(ts => ts.map((t, i) => {
      if (i !== tierIdx) return t;
      const benefits = [...t.benefits];
      benefits[benefitIdx] = val;
      return { ...t, benefits };
    }));
  }

  function addBenefit(tierIdx: number) {
    setTiers(ts => ts.map((t, i) => i === tierIdx ? { ...t, benefits: [...t.benefits, ""] } : t));
  }

  function removeBenefit(tierIdx: number, benefitIdx: number) {
    setTiers(ts => ts.map((t, i) => i === tierIdx ? { ...t, benefits: t.benefits.filter((_, j) => j !== benefitIdx) } : t));
  }

  async function save() {
    setSaving(true); setErr(null); setOk(null);
    try {
      await adminFetch("/api/admin/vip-tiers", { method: "POST", body: JSON.stringify({ tiers }) });
      setOk("VIP 設定已儲存，並重新計算所有會員等級");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!window.confirm("還原預設 VIP 設定？此操作會覆蓋目前設定。")) return;
    setSaving(true); setErr(null);
    try {
      await adminFetch("/api/admin/vip-tiers", { method: "DELETE" });
      setOk("已還原預設 VIP 設定");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "還原失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl space-y-4">
        {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
        {ok && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "var(--color-phosphor)", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {ok}</div>}

        {isDefault && (
          <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,200,100,0.12)", color: "#fbbf24", border: "1px solid rgba(255,200,100,0.25)" }}>
            ⚠️ 目前使用內建預設設定，儲存後將寫入資料庫
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="space-y-4">
            {tiers.map((tier, idx) => (
              <div key={tier.level} className="rounded-xl border p-5 bg-white" style={{ borderColor: "var(--border)" }}>
                <div className="mb-4 flex items-center gap-3">
                  <Input className="w-12 text-center text-lg" value={tier.emoji}
                    onChange={e => updateTier(idx, { emoji: e.target.value })} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm" style={{ color: tier.color || "var(--color-phosphor)" }}>LV{tier.level}</span>
                      <Input className="h-7 text-sm" value={tier.name} placeholder="中文名稱"
                        onChange={e => updateTier(idx, { name: e.target.value })} />
                      <Input className="h-7 text-sm" value={tier.enName} placeholder="English name"
                        onChange={e => updateTier(idx, { enName: e.target.value })} />
                    </div>
                  </div>
                  <Input className="w-24 h-7 text-xs" value={tier.color} placeholder="#ffffff"
                    onChange={e => updateTier(idx, { color: e.target.value })} />
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">最低潛水次數</Label>
                    <Input type="number" value={tier.minLogs}
                      onChange={e => updateTier(idx, { minLogs: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">最低消費 (NT$)</Label>
                    <Input type="number" value={tier.minSpend}
                      onChange={e => updateTier(idx, { minSpend: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">Key</Label>
                    <Input value={tier.key} placeholder="shrimp"
                      onChange={e => updateTier(idx, { key: e.target.value })} />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Label className="text-xs text-[var(--muted-foreground)]">會員福利</Label>
                    <button onClick={() => addBenefit(idx)} className="rounded p-0.5 hover:bg-[var(--muted)]" style={{ color: "var(--color-phosphor)" }}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {tier.benefits.map((b, j) => (
                      <div key={j} className="flex gap-2">
                        <Input className="text-sm" value={b} placeholder="福利描述"
                          onChange={e => updateBenefit(idx, j, e.target.value)} />
                        <button onClick={() => removeBenefit(idx, j)} className="rounded p-1.5 hover:bg-[var(--muted)] flex-shrink-0" style={{ color: "var(--color-coral)" }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {tier.benefits.length === 0 && (
                      <p className="text-xs text-[var(--muted-foreground)]">尚無福利，點 + 新增</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-between">
          <Button variant="outline" size="sm" onClick={resetToDefault} disabled={saving}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />還原預設
          </Button>
          <Button size="sm" style={primaryBtn} onClick={save} disabled={saving || loading}>
            <Save className="mr-1.5 h-4 w-4" />
            {saving ? "儲存並重算中..." : "儲存 VIP 設定"}
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
