"use client";
/**
 * v225：抵用金管理頁 — 完整 CRUD + 編碼 + 經辦人
 */
import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit3, Trash2 } from "lucide-react";

interface CreditTx {
  id: string;
  code: string | null;
  userId: string;
  amount: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  balanceAfter: number;
  createdBy: string | null;
  actorName: string | null;
  expiresAt: string | null;
  createdAt: string;
  user?: { displayName: string; realName: string | null; code: string | null };
}

interface Stats {
  totalGranted: number;
  totalUsed: number;
  circulating: number;
  expiringSoon: number;
  expired: number;
}

interface AdminUser {
  lineUserId: string;
  code?: string | null;
  displayName: string;
  realName: string | null;
}

const REASON_LABEL: Record<string, string> = {
  birthday: "🎂 生日抵用金",
  vip_upgrade: "⭐ VIP 升等",
  admin_adjust: "🛠 管理員調整",
  refund: "💰 退款",
  used: "🛒 使用",
};

const ADJUST_NOTE_QUICK = [
  "生日紅包", "活動補償", "推薦獎勵", "客訴補償", "系統錯誤校正",
  "老闆贈送", "競賽獎金", "潛友見證紅包",
];

export default function CreditsPage() {
  const [txs, setTxs] = useState<CreditTx[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // ── 新增 dialog ─────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [addUserKeyword, setAddUserKeyword] = useState("");
  const [addAmount, setAddAmount] = useState(0);
  const [addNote, setAddNote] = useState("");
  const [addExpiryDays, setAddExpiryDays] = useState(360);
  const [addBusy, setAddBusy] = useState(false);

  // ── 編輯 dialog ─────────────────────────────────────
  const [editing, setEditing] = useState<CreditTx | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (reasonFilter !== "all") qs.set("reason", reasonFilter);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      qs.set("limit", "500");
      const r = await adminFetch<{ txs: CreditTx[]; stats: Stats }>(
        `/api/admin/credits?${qs.toString()}`,
      );
      setTxs(r.txs);
      setStats(r.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, [reasonFilter, from, to]);

  useEffect(() => { load(); }, [load]);

  // 開啟新增 dialog 時順便載 user list
  async function openAdd() {
    setAddOpen(true);
    setAddUserId("");
    setAddUserKeyword("");
    setAddAmount(0);
    setAddNote("");
    setAddExpiryDays(360);
    if (users.length === 0) {
      try {
        const r = await adminFetch<{ users: AdminUser[] }>("/api/admin/users");
        setUsers(r.users);
      } catch { /* silent */ }
    }
  }

  const userOptions = users.filter((u) => {
    if (!addUserKeyword) return true;
    const k = addUserKeyword.toLowerCase();
    return (u.realName ?? u.displayName).toLowerCase().includes(k) || (u.code ?? "").toLowerCase().includes(k);
  }).slice(0, 30);

  async function submitAdd() {
    if (!addUserId) return alert("請選會員");
    if (!addAmount) return alert("請輸入金額");
    setAddBusy(true);
    try {
      await adminFetch("/api/admin/credits", {
        method: "POST",
        body: JSON.stringify({
          userId: addUserId,
          amount: addAmount,
          reason: "admin_adjust",
          note: addNote || null,
          expiryDays: addExpiryDays,
        }),
      });
      setAddOpen(false);
      await load();
    } catch (e) {
      alert("新增失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAddBusy(false);
    }
  }

  function openEdit(t: CreditTx) {
    setEditing(t);
    setEditNote(t.note ?? "");
    setEditExpiresAt(t.expiresAt ? new Date(t.expiresAt).toISOString().slice(0, 10) : "");
  }

  async function submitEdit() {
    if (!editing) return;
    setEditBusy(true);
    try {
      await adminFetch(`/api/admin/credits/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          note: editNote || null,
          expiresAt: editExpiresAt ? new Date(editExpiresAt + "T23:59:59+08:00").toISOString() : null,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      alert("修改失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setEditBusy(false);
    }
  }

  async function deleteTx(t: CreditTx) {
    if (!confirm(`確定刪除「${t.code ?? t.id.slice(0, 8)}」？\n金額 ${t.amount > 0 ? "+" : ""}${t.amount.toLocaleString()}\n會員餘額會自動重算。`)) return;
    try {
      await adminFetch(`/api/admin/credits/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert("刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  function expiryStatus(tx: CreditTx): { label: string; color: string } | null {
    if (tx.amount <= 0) return null;
    if (!tx.expiresAt) return { label: "永不過期", color: "#64748b" };
    const days = Math.floor((new Date(tx.expiresAt).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: `已過期 ${-days} 天`, color: "#dc2626" };
    if (days <= 30) return { label: `${days} 天內到期`, color: "#d97706" };
    return { label: `${days} 天後到期`, color: "#16a34a" };
  }

  return (
    <AdminShell title="抵用金管理">
      <div className="space-y-4">
        {/* 統計卡 */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard title="總發放" value={stats.totalGranted} color="#16a34a" />
            <StatCard title="總使用" value={stats.totalUsed} color="#0891b2" />
            <StatCard title="目前流通" value={stats.circulating} color="#0a2342" />
            <StatCard title="30 天內到期" value={stats.expiringSoon} color="#d97706" unit="筆" />
            <StatCard title="已過期" value={stats.expired} color="#dc2626" unit="筆" />
          </div>
        )}

        {/* Filters + 新增 */}
        <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">類別</Label>
              <select
                value={reasonFilter}
                onChange={(e) => setReasonFilter(e.target.value)}
                className="ml-2 rounded-md border border-[var(--border)] px-2 py-1 text-sm"
              >
                <option value="all">全部</option>
                <option value="birthday">生日抵用金</option>
                <option value="vip_upgrade">VIP 升等</option>
                <option value="admin_adjust">管理員調整</option>
                <option value="refund">退款</option>
                <option value="used">使用</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">起</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inline-block ml-2 w-36" />
            </div>
            <div>
              <Label className="text-[10px] text-[var(--muted-foreground)]">迄</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inline-block ml-2 w-36" />
            </div>
            <span className="text-xs text-[var(--muted-foreground)]">共 {txs.length} 筆</span>
            <Button size="sm" className="ml-auto" onClick={openAdd}>
              <Plus className="mr-1 h-4 w-4" /> 新增抵用金
            </Button>
          </div>
        </div>

        {err && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 border border-rose-200">{err}</div>}

        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">編碼</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">時間</th>
                    <th className="px-3 py-2 font-medium">會員</th>
                    <th className="px-3 py-2 font-medium">類別</th>
                    <th className="px-3 py-2 font-medium">名義</th>
                    <th className="px-3 py-2 font-medium text-right">金額</th>
                    <th className="px-3 py-2 font-medium text-right">餘額</th>
                    <th className="px-3 py-2 font-medium">到期</th>
                    <th className="px-3 py-2 font-medium">經辦人</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t, i) => {
                    const exp = expiryStatus(t);
                    return (
                      <tr key={t.id} className="border-t" style={{
                        borderColor: "var(--border)",
                        background: i % 2 === 0 ? "#ffffff" : "rgba(240,242,245,0.4)",
                      }}>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {t.code ? (
                            <span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                              ${t.code}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          {new Date(t.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }).slice(0, 16)}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          <span className="font-semibold">{t.user?.realName ?? t.user?.displayName ?? "—"}</span>
                          {t.user?.code && <span className="ml-1 text-[10px] text-[var(--muted-foreground)] font-mono">{t.user.code}</span>}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-xs">
                          <Badge variant="muted" className="text-[10px]">
                            {REASON_LABEL[t.reason] ?? t.reason}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-xs truncate">{t.note ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold whitespace-nowrap" style={{ color: t.amount > 0 ? "#16a34a" : "#dc2626" }}>
                          {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-xs whitespace-nowrap text-[var(--muted-foreground)]">
                          {t.balanceAfter.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap text-[10px]" style={{ color: exp?.color ?? "var(--muted-foreground)" }}>
                          {exp ? exp.label : "—"}
                          {t.expiresAt && (
                            <div className="text-[9px] opacity-70">
                              {new Date(t.expiresAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-[11px] whitespace-nowrap">
                          {t.actorName === "系統發" ? (
                            <span className="text-slate-500">🤖 系統發</span>
                          ) : t.actorName ? (
                            <span className="font-medium text-slate-700">{t.actorName}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <div className="flex gap-0.5">
                            <button onClick={() => openEdit(t)}
                              className="rounded p-1 text-slate-600 hover:bg-slate-100"
                              title="修改備註/到期日">
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button onClick={() => deleteTx(t)}
                              className="rounded p-1 text-rose-600 hover:bg-rose-50"
                              title="刪除（會員餘額重算）">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {txs.length === 0 && (
                    <tr><td colSpan={10} className="py-12 text-center text-sm text-[var(--muted-foreground)]">無資料</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* === 新增 dialog === */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新增抵用金</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">會員（輸入姓名或編號搜尋）</Label>
              <Input value={addUserKeyword} onChange={(e) => setAddUserKeyword(e.target.value)} placeholder="搜尋..." />
              <div className="mt-2 max-h-40 overflow-y-auto rounded border" style={{ borderColor: "var(--border)" }}>
                {userOptions.map((u) => (
                  <button key={u.lineUserId}
                    onClick={() => setAddUserId(u.lineUserId)}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-xs text-left hover:bg-slate-50 ${u.lineUserId === addUserId ? "bg-cyan-50 font-semibold" : ""}`}>
                    <span>{u.realName ?? u.displayName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{u.code ?? u.lineUserId.slice(0, 10)}</span>
                  </button>
                ))}
                {userOptions.length === 0 && <div className="px-2 py-2 text-xs text-slate-500">輸入關鍵字搜尋...</div>}
              </div>
            </div>
            <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">金額 (NT$)</Label>
              <NumberInput min={1} value={addAmount} onChange={setAddAmount} placeholder="100" />
            </div>
            <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">名義</Label>
              <Input value={addNote} onChange={(e) => setAddNote(e.target.value)} placeholder="會顯示給會員，例：客訴補償" />
            </div>
            <div className="flex flex-wrap gap-1">
              {ADJUST_NOTE_QUICK.map((q) => (
                <button key={q} onClick={() => setAddNote(q)}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 hover:border-cyan-400 hover:text-cyan-600">
                  {q}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
              <Label className="text-xs">有效天數</Label>
              <NumberInput min={0} max={3650} value={addExpiryDays} onChange={setAddExpiryDays} />
            </div>
            <p className="text-[10px] text-slate-500">
              0 = 永不過期；建立後 N 天內若未使用會自動過期
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>取消</Button>
              <Button size="sm" onClick={submitAdd} disabled={addBusy || !addUserId || !addAmount}>
                {addBusy ? "儲存中..." : "✓ 新增"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* === 編輯 dialog === */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>修改抵用金</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="rounded-md bg-slate-50 p-2 text-xs space-y-0.5">
                <div>編碼：<span className="font-mono font-bold text-amber-800">${editing.code ?? "—"}</span></div>
                <div>會員：{editing.user?.realName ?? editing.user?.displayName}</div>
                <div>金額：<span className="font-bold" style={{ color: editing.amount > 0 ? "#16a34a" : "#dc2626" }}>
                  {editing.amount > 0 ? "+" : ""}{editing.amount.toLocaleString()}
                </span> <span className="text-slate-500">（不可修改，要改請刪除重發）</span></div>
              </div>
              <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <Label className="text-xs">名義</Label>
                <Input value={editNote} onChange={(e) => setEditNote(e.target.value)} />
              </div>
              <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <Label className="text-xs">到期日</Label>
                <Input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
              </div>
              <p className="text-[10px] text-slate-500">留空 = 永不過期</p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)}>取消</Button>
                <Button size="sm" onClick={submitEdit} disabled={editBusy}>
                  {editBusy ? "儲存中..." : "✓ 儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function StatCard({ title, value, color, unit = "" }: { title: string; value: number; color: string; unit?: string }) {
  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--border)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>{title}</div>
      <div className="text-xl font-bold tabular-nums" style={{ color }}>
        {unit ? value : value.toLocaleString()}
        {unit && <span className="ml-1 text-xs">{unit}</span>}
      </div>
    </div>
  );
}
