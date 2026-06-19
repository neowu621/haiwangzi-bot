"use client";
// v590：後台「節慶優惠」管理 — 優惠代碼 CRUD + 日潛早鳥回饋設定。
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Plus, Trash2, Dice5, RotateCw } from "lucide-react";

interface Promo {
  id: string;
  title: string;
  code: string;
  discountType: "per_tank" | "percent";
  discountValue: number;
  startAt: string;
  endAt: string;
  isPublic: boolean;
  appliesTo: "daily" | "tour" | "both";
  minAmount: number;
  perUserLimit: number;
  totalLimit: number;
  audienceTag: string | null;
  enabled: boolean;
  usedCount: number;
  note: string;
}
interface Tier { weeks: number; credit: number }
interface EarlyBird { earlyBirdEnabled: boolean; earlyBirdMinAmount: number; earlyBirdTiers: Tier[] }

const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : "");
const toStart = (d: string) => new Date(`${d}T00:00:00`).toISOString();
const toEnd = (d: string) => new Date(`${d}T23:59:59`).toISOString();

type Form = Omit<Promo, "id" | "usedCount"> & { id?: string };
const blankForm = (): Form => ({
  title: "", code: "", discountType: "per_tank", discountValue: 50,
  startAt: toStart(dateOnly(new Date().toISOString())), endAt: toEnd(dateOnly(new Date().toISOString())),
  isPublic: true, appliesTo: "daily", minAmount: 0, perUserLimit: 1, totalLimit: 0, audienceTag: null, enabled: true, note: "",
});

export default function PromoCodesPage() {
  const { ready } = useAdminAuth();
  const [items, setItems] = useState<Promo[]>([]);
  const [eb, setEb] = useState<EarlyBird>({ earlyBirdEnabled: false, earlyBirdMinAmount: 1000, earlyBirdTiers: [] });
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminFetch<{ items: Promo[] }>("/api/admin/promo"),
      adminFetch<EarlyBird>("/api/admin/site-config"),
    ]).then(([p, c]) => {
      setItems(p.items);
      setEb({ earlyBirdEnabled: c.earlyBirdEnabled, earlyBirdMinAmount: c.earlyBirdMinAmount, earlyBirdTiers: c.earlyBirdTiers ?? [] });
    }).catch((e) => setMsg(e instanceof Error ? e.message : "載入失敗")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function genCode() {
    const r = await adminFetch<{ code: string }>("/api/admin/promo?gen=1");
    setForm((f) => (f ? { ...f, code: r.code } : f));
  }
  async function savePromo() {
    if (!form) return;
    setBusy(true); setMsg(null);
    try {
      await adminFetch("/api/admin/promo", { method: "POST", body: JSON.stringify(form) });
      setForm(null); load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!window.confirm("確定刪除此優惠檔期？")) return;
    await adminFetch(`/api/admin/promo/${id}`, { method: "DELETE" }); load();
  }
  async function toggle(p: Promo) {
    await adminFetch("/api/admin/promo", { method: "POST", body: JSON.stringify({ ...p, enabled: !p.enabled }) }); load();
  }
  async function saveEarlyBird() {
    setBusy(true); setMsg(null);
    try {
      await adminFetch("/api/admin/site-config", { method: "POST", body: JSON.stringify(eb) });
      setMsg("✅ 早鳥設定已儲存");
    } catch (e) { setMsg(e instanceof Error ? e.message : "儲存失敗"); }
    finally { setBusy(false); }
  }

  const disc = (p: Promo) => p.discountType === "per_tank" ? `氣瓶 −$${p.discountValue}` : `訂單 −${p.discountValue}%`;
  const limitTxt = (p: Promo) => [p.perUserLimit ? `每人${p.perUserLimit}` : "", p.totalLimit ? `總量${p.totalLimit}` : "", p.minAmount ? `滿$${p.minAmount}` : "", p.audienceTag === "vip5" ? "VIP5" : ""].filter(Boolean).join("・") || "—";

  return (
    <AdminShell title="節慶優惠">
      <div className="mx-auto max-w-5xl space-y-5">
        {msg && <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm text-cyan-800">{msg}</div>}

        {/* 早鳥回饋設定 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-800">🐦 日潛早鳥回饋</div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={eb.earlyBirdEnabled} onChange={(e) => setEb({ ...eb, earlyBirdEnabled: e.target.checked })} /> 啟用
            </label>
          </div>
          <p className="mb-3 text-xs text-slate-500">提早預約 + 滿額 → 訂單<b>結案後</b>(完成、無退款)送抵用金,越早送越多。</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">最低消費門檻 NT$
              <input type="number" value={eb.earlyBirdMinAmount} onChange={(e) => setEb({ ...eb, earlyBirdMinAmount: Number(e.target.value) })}
                className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="text-xs text-slate-600">
              級距（提早幾週 → 送多少）
              <div className="mt-1 space-y-1.5">
                {eb.earlyBirdTiers.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span>提早</span>
                    <input type="number" value={t.weeks} onChange={(e) => { const ts = [...eb.earlyBirdTiers]; ts[i] = { ...t, weeks: Number(e.target.value) }; setEb({ ...eb, earlyBirdTiers: ts }); }} className="w-14 rounded border border-slate-300 px-2 py-1 text-sm" />
                    <span>週 → 送</span>
                    <input type="number" value={t.credit} onChange={(e) => { const ts = [...eb.earlyBirdTiers]; ts[i] = { ...t, credit: Number(e.target.value) }; setEb({ ...eb, earlyBirdTiers: ts }); }} className="w-16 rounded border border-slate-300 px-2 py-1 text-sm" />
                    <span>元</span>
                    <button onClick={() => setEb({ ...eb, earlyBirdTiers: eb.earlyBirdTiers.filter((_, j) => j !== i) })} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <button onClick={() => setEb({ ...eb, earlyBirdTiers: [...eb.earlyBirdTiers, { weeks: 3, credit: 50 }] })} className="text-xs text-cyan-700">+ 新增級距</button>
              </div>
            </div>
          </div>
          <button onClick={saveEarlyBird} disabled={busy} className="mt-3 rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white">儲存早鳥設定</button>
        </section>

        {/* 優惠代碼列表 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold text-slate-800">🎏 節慶優惠代碼</div>
            <div className="flex gap-2">
              <button onClick={load} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600"><RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> 重新整理</button>
              <button onClick={() => setForm(blankForm())} className="flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white"><Plus className="h-3.5 w-3.5" /> 新增檔期</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-slate-500">
                <th className="py-2 pr-2">主題</th><th className="pr-2">折扣</th><th className="pr-2">代碼</th><th className="pr-2">期間</th><th className="pr-2">適用</th><th className="pr-2">限制</th><th className="pr-2">已用</th><th className="pr-2">狀態</th><th></th>
              </tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 pr-2 font-medium">{p.title}</td>
                    <td className="pr-2">{disc(p)}</td>
                    <td className="pr-2"><code className="font-mono">{p.code}</code> <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${p.isPublic ? "bg-cyan-50 text-cyan-700" : "bg-amber-50 text-amber-700"}`}>{p.isPublic ? "公開" : "私密"}</span></td>
                    <td className="pr-2 whitespace-nowrap">{dateOnly(p.startAt).slice(5)}–{dateOnly(p.endAt).slice(5)}</td>
                    <td className="pr-2">{p.appliesTo === "both" ? "兩者" : p.appliesTo === "tour" ? "潛旅" : "日潛"}</td>
                    <td className="pr-2 text-slate-500">{limitTxt(p)}</td>
                    <td className="pr-2 tabular-nums">{p.usedCount}</td>
                    <td className="pr-2"><button onClick={() => toggle(p)} className={`rounded-full px-2 py-0.5 text-[10px] ${p.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{p.enabled ? "啟用" : "停用"}</button></td>
                    <td className="flex gap-1.5 py-2">
                      <button onClick={() => setForm({ ...p, startAt: p.startAt, endAt: p.endAt })} className="text-cyan-700">編輯</button>
                      <button onClick={() => del(p.id)} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                ))}
                {!loading && items.length === 0 && <tr><td colSpan={9} className="py-6 text-center text-slate-400">尚無優惠檔期,按「新增檔期」建立</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* 新增 / 編輯表單 */}
        {form && (
          <section className="rounded-2xl border-2 border-cyan-200 bg-white p-4">
            <div className="mb-3 text-sm font-bold text-slate-800">{form.id ? "編輯檔期" : "新增檔期"}</div>

            <FieldGroup title="基本">
              <Field label="主題"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="端午節" className="inp" /></Field>
              <Field label="折扣方式"><select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as Form["discountType"] })} className="inp"><option value="per_tank">每支氣瓶 NT$</option><option value="percent">訂單金額 %</option></select></Field>
              <Field label="數值"><input type="number" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })} className="inp" /></Field>
              <Field label="代碼"><div className="flex gap-1.5"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="留空自動產生" className="inp flex-1 font-mono" /><button onClick={genCode} className="rounded-lg border border-slate-300 px-2 text-cyan-700" title="自動產生"><Dice5 className="h-4 w-4" /></button></div></Field>
              <Field label="公開"><label className="flex h-9 items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> 公開(秀給客戶+一鍵套用)</label></Field>
            </FieldGroup>

            <FieldGroup title="期間">
              <Field label="開始"><input type="date" value={dateOnly(form.startAt)} onChange={(e) => setForm({ ...form, startAt: toStart(e.target.value) })} className="inp" /></Field>
              <Field label="結束"><input type="date" value={dateOnly(form.endAt)} onChange={(e) => setForm({ ...form, endAt: toEnd(e.target.value) })} className="inp" /></Field>
            </FieldGroup>

            <FieldGroup title="適用">
              <Field label="適用類型"><select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as Form["appliesTo"] })} className="inp"><option value="daily">日潛</option><option value="tour">潛旅</option><option value="both">兩者</option></select></Field>
            </FieldGroup>

            <FieldGroup title="限制（皆可空）">
              <Field label="每人限用(0=不限)"><input type="number" value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })} className="inp" /></Field>
              <Field label="總量上限(0=不限)"><input type="number" value={form.totalLimit} onChange={(e) => setForm({ ...form, totalLimit: Number(e.target.value) })} className="inp" /></Field>
              <Field label="滿額才折(0=不限)"><input type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: Number(e.target.value) })} className="inp" /></Field>
              <Field label="限定客群"><select value={form.audienceTag ?? ""} onChange={(e) => setForm({ ...form, audienceTag: e.target.value || null })} className="inp"><option value="">不限</option><option value="vip5">限 VIP5</option></select></Field>
            </FieldGroup>

            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600">取消</button>
              <button onClick={savePromo} disabled={busy || !form.title} className="rounded-lg bg-cyan-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">儲存檔期</button>
            </div>
          </section>
        )}
      </div>
      <style jsx>{`.inp{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:7px 9px;font-size:13px}`}</style>
    </AdminShell>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-xs font-medium text-cyan-700">{title}</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-[11px] text-slate-500">{label}</div>{children}</div>;
}
