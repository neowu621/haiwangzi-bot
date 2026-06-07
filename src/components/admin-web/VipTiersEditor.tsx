"use client";
/**
 * v345：VIP 等級編輯器（從 /admin/vip-tiers 頁抽出成共用元件）
 *   嵌入到 系統設定 → ⭐ VIP tab。
 *   每個等級含「升級獎勵」(upgradeCredit) — 這才是真正生效的 VIP 升等金額。
 */
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Save, RotateCcw, Edit3 } from "lucide-react";

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
  upgradeCredit: number;
  gearDiscountPct?: number; // v388：裝備折扣%（100/未設=不折，90=9折）
}

const primaryBtn: React.CSSProperties = { background: "var(--color-phosphor)", color: "var(--color-ocean-deep)" };

export function VipTiersEditor() {
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<VipTier | null>(null);

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

  function openEdit(idx: number) {
    setEditIdx(idx);
    setEditDraft({ ...tiers[idx], benefits: [...tiers[idx].benefits] });
  }
  function applyEdit() {
    if (editIdx === null || !editDraft) return;
    setTiers(ts => ts.map((t, i) => i === editIdx ? editDraft : t));
    setEditIdx(null);
    setEditDraft(null);
  }
  function updateDraft(patch: Partial<VipTier>) {
    setEditDraft(d => d ? { ...d, ...patch } : d);
  }
  function updateBenefitInDraft(j: number, val: string) {
    setEditDraft(d => {
      if (!d) return d;
      const benefits = [...d.benefits];
      benefits[j] = val;
      return { ...d, benefits };
    });
  }
  function addBenefitInDraft() {
    setEditDraft(d => d ? { ...d, benefits: [...d.benefits, ""] } : d);
  }
  function removeBenefitInDraft(j: number) {
    setEditDraft(d => d ? { ...d, benefits: d.benefits.filter((_, i) => i !== j) } : d);
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
    <div className="space-y-4">
      {err && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,123,90,0.15)", color: "var(--color-coral)", border: "1px solid rgba(255,123,90,0.3)" }}>{err}</div>}
      {ok && <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>✓ {ok}</div>}

      <div className="rounded-lg p-3 text-xs" style={{ background: "rgba(99,235,164,0.08)", color: "#047857", border: "1px solid rgba(99,235,164,0.2)" }}>
        💡 每個等級的「升級獎勵」就是 VIP 升等金額 — 會員首次達到該 LV 時自動發放抵用金（每 LV 一次）。
      </div>

      {isDefault && (
        <div className="rounded-lg p-3 text-sm" style={{ background: "rgba(255,200,100,0.12)", color: "#b07c00", border: "1px solid rgba(255,200,100,0.4)" }}>
          ⚠️ 目前使用內建預設設定，儲存後將寫入資料庫
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                <th className="px-4 py-3 font-medium">等級</th>
                <th className="px-4 py-3 font-medium text-right">最低潛水次數</th>
                <th className="px-4 py-3 font-medium text-right">升級獎勵</th>
                <th className="px-4 py-3 font-medium">會員福利</th>
                <th className="px-4 py-3 font-medium w-16" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier, idx) => (
                <tr key={tier.level} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full text-lg flex-shrink-0"
                        style={{ background: tier.color ? `${tier.color}20` : "rgba(99,235,164,0.15)" }}>
                        {tier.emoji}
                      </div>
                      <div>
                        <div className="font-bold text-xs" style={{ color: tier.color || "var(--color-phosphor)" }}>LV{tier.level}</div>
                        <div className="font-semibold text-sm text-[var(--foreground)]">{tier.name}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)]">{tier.enName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{tier.minLogs}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {tier.upgradeCredit > 0 ? (
                      <span className="font-semibold" style={{ color: "#047857" }}>NT$ {tier.upgradeCredit.toLocaleString()}</span>
                    ) : (
                      <span className="text-xs text-[var(--muted-foreground)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {tier.benefits.length === 0 ? (
                      <span className="text-xs text-[var(--muted-foreground)]">尚無福利</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {tier.benefits.map((b, j) => (
                          <li key={j} className="flex items-start gap-1.5 text-xs">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--color-phosphor)] flex-shrink-0" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(idx)} className="rounded p-1.5 hover:bg-[var(--muted)]"
                      style={{ color: "var(--muted-foreground)" }} title="編輯">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {/* 編輯 VIP 等級 Dialog */}
      <Dialog open={editIdx !== null} onOpenChange={(open) => { if (!open) { setEditIdx(null); setEditDraft(null); } }}>
        <DialogContent className="max-w-lg bg-white text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">編輯 VIP 等級 — LV{editDraft?.level}</DialogTitle>
          </DialogHeader>
          {editDraft && (
            <div className="space-y-3 pt-2">
              <div className="grid grid-cols-[5rem_1fr_1fr] items-end gap-2">
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">圖示</Label>
                  <Input className="text-center text-lg" value={editDraft.emoji} onChange={e => updateDraft({ emoji: e.target.value })} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">中文名稱</Label>
                  <Input value={editDraft.name} onChange={e => updateDraft({ name: e.target.value })} placeholder="如：龍蝦" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">English Name</Label>
                  <Input value={editDraft.enName} onChange={e => updateDraft({ enName: e.target.value })} placeholder="Lobster" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">Key（程式用）</Label>
                  <Input value={editDraft.key} onChange={e => updateDraft({ key: e.target.value })} placeholder="lobster" />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">顏色</Label>
                  <div className="flex gap-2">
                    <Input value={editDraft.color} onChange={e => updateDraft({ color: e.target.value })} placeholder="#ff8866" />
                    <div className="h-9 w-9 flex-shrink-0 rounded-md border" style={{ background: editDraft.color || "transparent", borderColor: "var(--border)" }} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">最低潛水次數（升等唯一條件）</Label>
                  <Input type="text" inputMode="numeric" value={String(editDraft.minLogs)}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1");
                      updateDraft({ minLogs: clean === "" ? 0 : parseInt(clean, 10) });
                    }} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">升級獎勵抵用金 (NT$)</Label>
                  <Input type="text" inputMode="numeric" value={String(editDraft.upgradeCredit)}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1");
                      updateDraft({ upgradeCredit: clean === "" ? 0 : parseInt(clean, 10) });
                    }} />
                </div>
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)]">
                ※ 升等僅依「海王子累積潛水次數」。會員首次達到此 LV 時自動發放抵用金，每個 LV 僅一次。
              </p>
              {/* v388：裝備租借折扣（下單裝備區自動套用）*/}
              <div>
                <Label className="mb-1 block text-xs text-[var(--muted-foreground)]">裝備租借折扣 %（100=原價、90=9折；下單自動套用）</Label>
                <Input type="text" inputMode="numeric" value={String(editDraft.gearDiscountPct ?? 100)}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1");
                    let v = clean === "" ? 100 : parseInt(clean, 10);
                    if (v > 100) v = 100;
                    updateDraft({ gearDiscountPct: v });
                  }} />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Label className="text-xs text-[var(--muted-foreground)]">會員福利</Label>
                  <button onClick={addBenefitInDraft} className="rounded p-0.5 hover:bg-[var(--muted)]" style={{ color: "var(--color-phosphor)" }}>
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {editDraft.benefits.map((b, j) => (
                    <div key={j} className="flex gap-2">
                      <Input className="text-sm" value={b} placeholder="福利描述" onChange={e => updateBenefitInDraft(j, e.target.value)} />
                      <button onClick={() => removeBenefitInDraft(j)} className="rounded p-1.5 hover:bg-[var(--muted)] flex-shrink-0" style={{ color: "var(--color-coral)" }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {editDraft.benefits.length === 0 && (
                    <p className="text-xs text-[var(--muted-foreground)]">尚無福利，點 + 新增</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => { setEditIdx(null); setEditDraft(null); }}>取消</Button>
                <Button size="sm" style={primaryBtn} onClick={applyEdit}>套用變更</Button>
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] text-center">
                ※「套用變更」只暫存到表格，請記得按「儲存 VIP 設定」才會寫入資料庫
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
