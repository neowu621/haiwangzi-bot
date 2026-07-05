"use client";
// v779：手機 LIFF「老闆結帳／待收款」（老闆專用，LINE 登入免帳密）。
//   桌機 /admin/tonight 的手機版：不限今天，處理過期/現場付款/已到場未付清的收款。
//   一鍵「現場收現・結清」＝原子動作：收現金(+標 paymentMethod=cash) + 活動已到日則一併標到場。
import { useCallback, useEffect, useState } from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiverLoader } from "@/components/ui/DiverLoader";

interface SettleItem {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  type: "daily" | "tour";
  participants: number;
  totalAmount: number;
  paidAmount: number;
  creditUsed: number;
  status: string;
  paymentMethod: string | null;
  activityDate: string;
  label: string;
}

function todayTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
}

export default function LiffSettlePage() {
  const liff = useLiff();
  const [items, setItems] = useState<SettleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await liff.fetchWithAuth<{ today: string; items: SettleItem[] }>("/api/admin/settle-pending");
      setItems(d.items ?? []);
      setErr(null);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/role|admin|403/.test(m) ? "此頁限老闆使用（收款權限）。" : m);
    } finally {
      setLoading(false);
    }
  }, [liff]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);

  async function settle(b: SettleItem) {
    const owed = Math.max(0, b.totalAmount - b.paidAmount);
    const today = todayTaipei();
    const willAttend = b.status !== "completed" && b.activityDate !== "" && b.activityDate <= today;
    const steps: string[] = [];
    if (owed > 0) steps.push(`現場收現 NT$${owed.toLocaleString()}（現金）`);
    if (willAttend) steps.push("標記到場（累積潛數）");
    if (steps.length === 0) { setMsg(`${b.name} 已結清且已到場`); return; }
    if (!window.confirm(`${b.name}：\n${steps.map((s) => "• " + s).join("\n")}\n\n確認執行？`)) return;
    setBusy(b.id);
    setMsg(null);
    try {
      if (owed > 0) {
        await liff.fetchWithAuth(`/api/admin/bookings/${b.id}/payment-entry`, {
          method: "POST",
          body: JSON.stringify({ kind: "cash", amount: owed }),
        });
      }
      if (willAttend) {
        await liff.fetchWithAuth(`/api/coach/bookings/${b.id}/attendance`, {
          method: "POST",
          body: JSON.stringify({ action: "completed" }),
        });
      }
      await reload();
      setMsg(`✓ ${b.name} → 已結清${willAttend ? "＋到場" : ""}`);
    } catch (e) {
      setMsg("結清失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  const today = todayTaipei();
  const byDate = (a: SettleItem, b: SettleItem) => (a.activityDate < b.activityDate ? -1 : a.activityDate > b.activityDate ? 1 : 0);
  const isOverdue = (b: SettleItem) => b.activityDate !== "" && b.activityDate < today;
  const isOnsiteOrOverdue = (b: SettleItem) => b.paymentMethod === "cash" || isOverdue(b);

  const attended = items.filter((b) => b.status === "completed").sort(byDate);
  const pending = items.filter((b) => b.status === "pending");
  const onsiteOverdue = pending.filter(isOnsiteOrOverdue).sort(byDate);
  const awaitTransfer = pending.filter((b) => !isOnsiteOrOverdue(b)).sort(byDate);

  const Section = ({ title, hint, list }: { title: string; hint: string; list: SettleItem[] }) =>
    list.length === 0 ? null : (
      <div className="mb-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">{title}（{list.length} 筆）</h2>
        </div>
        <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">{hint}</p>
        <div className="space-y-2">
          {list.map((b) => {
            const owed = Math.max(0, b.totalAmount - b.paidAmount);
            return (
              <Card key={b.id} className="p-3">
                <div className="text-[12px] font-semibold text-slate-700">
                  {b.type === "tour" ? "✈️" : "🔱"} {b.activityDate} {b.label || "—"}
                  <span className="ml-1 font-normal text-[var(--muted-foreground)]">· {b.participants} 位</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{b.name}</span>
                  {b.code && <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-mono">{b.code}</span>}
                  {b.phone && <a href={`tel:${b.phone}`} className="text-[11px] text-[var(--color-ocean-deep)] underline">📞 {b.phone}</a>}
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular-nums text-[var(--color-coral)]">NT$ {owed.toLocaleString()}</span>
                    {b.creditUsed > 0 && <span className="text-[10px] text-[var(--muted-foreground)]">已折 NT$ {b.creditUsed.toLocaleString()}</span>}
                    {b.paymentMethod === "cash" && <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">💵 現場付款</span>}
                    {isOverdue(b) && b.status !== "completed" && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">⏰ 已過期</span>}
                    {b.status === "completed" && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">✅ 已到場</span>}
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-[12px]" disabled={busy === b.id} onClick={() => void settle(b)}>
                    {busy === b.id ? "處理中…" : "💵 現場收現・結清"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );

  return (
    <LiffShell title="老闆結帳・待收款" backHref="/liff/coach/today">
      <div className="px-4 pt-4">
        {msg && (
          <div className="mb-3 rounded-lg p-2.5 text-sm" style={{ background: "rgba(99,235,164,0.12)", color: "#047857", border: "1px solid rgba(99,235,164,0.25)" }}>
            {msg}
          </div>
        )}
        {err && (
          <Card className="mb-3 bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}
        {loading && <div className="flex justify-center py-8"><DiverLoader label="載入中…" size={96} /></div>}
        {!loading && !err && items.length === 0 && (
          <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">沒有待收款的訂單 🎉</Card>
        )}
        {!loading && !err && (
          <>
            <Section title="💵 現場付款 / 逾期待結案" hint="客戶選現場付款或活動已過期 → 現場收現/點名，勿催匯款" list={onsiteOverdue} />
            <Section title="✅ 已到場・未付清" hint="已標到場但錢未收 → 補收現結清" list={attended} />
            <Section title="🧾 待匯款（未過期・非現場付款）" hint="等客戶匯款；到場再收也可直接結清" list={awaitTransfer} />
            <div className="pb-8 pt-2 text-center">
              <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>重新整理</Button>
            </div>
          </>
        )}
      </div>
    </LiffShell>
  );
}
