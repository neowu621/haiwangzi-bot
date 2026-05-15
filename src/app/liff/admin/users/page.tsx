"use client";
import { useEffect, useMemo, useState } from "react";
import { Edit3, Ban, Crown, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { formatPhoneTW } from "@/lib/phone";
import { VIP_TIERS, getVipTier } from "@/lib/vip-tier";
import { cn } from "@/lib/utils";

type Role = "customer" | "coach" | "boss" | "admin";
type Cert = "OW" | "AOW" | "Rescue" | "DM" | "Instructor";

interface AdminUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  email: string | null;
  // legacy primary role
  role: Role;
  // 新版多重身分 — 後端 GET 一定會 fallback 為 [role]，不會是空陣列
  effectiveRoles: Role[];
  roles?: Role[];
  cert: Cert | null;
  certNumber: string | null;
  logCount: number;
  notes: string | null;
  blacklisted: boolean;
  blacklistReason: string | null;
  vipLevel: number;
  totalSpend?: number;
  lastActiveAt: string;
  createdAt: string;
  stats?: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    noShow: number;
    revenue: number;
    potential: number;
  };
}

const CERTS: Cert[] = ["OW", "AOW", "Rescue", "DM", "Instructor"];
const ROLES: Role[] = ["customer", "coach", "boss", "admin"];

export default function AdminUsersPage() {
  const liff = useLiff();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | Role | "blacklist" | "vip">(
    "all",
  );

  async function load() {
    try {
      const d = await liff.fetchWithAuth<{ users: AdminUser[] }>(
        "/api/admin/users",
      );
      setUsers(d.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "blacklist" && !u.blacklisted) return false;
      if (filter === "vip" && u.vipLevel === 0) return false;
      if (filter !== "all" && filter !== "blacklist" && filter !== "vip") {
        // 多重身分：只要 user 有該角色就算入這個 tab
        if (!u.effectiveRoles?.includes(filter)) return false;
      }
      if (k) {
        const haystack = [
          u.displayName,
          u.realName ?? "",
          u.phone ?? "",
          u.email ?? "",
          u.certNumber ?? "",
          u.lineUserId,
        ]
          .join("|")
          .toLowerCase();
        if (!haystack.includes(k)) return false;
      }
      return true;
    });
  }, [users, keyword, filter]);

  async function removeUser(u: AdminUser) {
    const hasBookings = (u.stats?.totalBookings ?? 0) > 0;
    const ok1 = confirm(
      `⚠ 刪除會員「${u.realName ?? u.displayName}」？\n\n` +
        (hasBookings
          ? `此會員有 ${u.stats?.totalBookings} 筆訂單，預設不允許刪除。\n會詢問是否強制刪除（連訂單一起清掉）。`
          : `此會員沒有訂單，可直接刪除。`),
    );
    if (!ok1) return;
    const ok2 = prompt(`為了安全，請輸入「DELETE」確認：`);
    if (ok2 !== "DELETE") {
      alert("取消（未輸入 DELETE）");
      return;
    }
    try {
      await liff.fetchWithAuth(
        `/api/admin/users/${encodeURIComponent(u.lineUserId)}`,
        { method: "DELETE" },
      );
      setUsers((arr) => arr.filter((x) => x.lineUserId !== u.lineUserId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("HTTP 409")) {
        // 有 booking 引用，問是否強制
        if (
          confirm(
            `此會員有訂單，是否「強制刪除」（連訂單 / 轉帳截圖 / 提醒記錄一併刪掉）？`,
          )
        ) {
          try {
            await liff.fetchWithAuth(
              `/api/admin/users/${encodeURIComponent(u.lineUserId)}?force=true`,
              { method: "DELETE" },
            );
            setUsers((arr) => arr.filter((x) => x.lineUserId !== u.lineUserId));
          } catch (e2) {
            alert(
              "強制刪除失敗：" +
                (e2 instanceof Error ? e2.message : String(e2)),
            );
          }
        }
      } else {
        alert("刪除失敗：" + msg);
      }
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await liff.fetchWithAuth<{ ok: boolean; user: AdminUser }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            lineUserId: editing.lineUserId,
            // 改傳多重身分；後端會自動同步 primary role
            roles: editing.effectiveRoles ?? [editing.role],
            realName: editing.realName,
            phone: editing.phone,
            email: editing.email,
            cert: editing.cert,
            certNumber: editing.certNumber,
            logCount: editing.logCount,
            notes: editing.notes,
            blacklisted: editing.blacklisted,
            blacklistReason: editing.blacklistReason,
            vipLevel: editing.vipLevel,
            totalSpend: editing.totalSpend,
          }),
        },
      );
      setUsers((arr) =>
        arr.map((x) =>
          x.lineUserId === editing.lineUserId ? { ...x, ...r.user } : x,
        ),
      );
      setEditing(null);
    } catch (e) {
      alert("失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  function vipLabel(lv: number) {
    const tier = getVipTier(lv);
    return `${tier.emoji} ${tier.name}`;
  }

  return (
    <LiffShell title="會員管理" backHref="/liff/admin/dashboard">
      <div className="space-y-2 px-4 pt-4">
        {err && (
          <Card className="bg-[var(--color-coral)]/15 p-4 text-sm">{err}</Card>
        )}

        {/* 搜尋 + 篩選 */}
        <div className="space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              placeholder="搜尋姓名 / 電話 / 證號 / LINE userId"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-7 text-xs"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-full bg-[var(--muted)] p-0.5 text-[11px]">
            {(
              [
                ["all", `全部 (${users.length})`],
                ["customer", `客戶 (${users.filter((u) => u.effectiveRoles?.includes("customer")).length})`],
                ["coach", `教練 (${users.filter((u) => u.effectiveRoles?.includes("coach")).length})`],
                ["admin", `Admin (${users.filter((u) => u.effectiveRoles?.includes("admin")).length})`],
                ["vip", `VIP (${users.filter((u) => u.vipLevel > 0).length})`],
                ["blacklist", `黑名單 (${users.filter((u) => u.blacklisted).length})`],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={cn(
                  "flex-shrink-0 rounded-full px-2.5 py-1 font-medium transition-colors",
                  filter === v
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted-foreground)]">
            沒有符合條件的會員
          </div>
        )}

        {filtered.map((u) => (
          <Card
            key={u.lineUserId}
            className={cn(u.blacklisted && "opacity-60")}
          >
            <CardContent className="flex items-center gap-3 p-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {(u.realName ?? u.displayName).slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold">
                    {u.realName ?? u.displayName}
                  </span>
                  {u.realName && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      ({u.displayName})
                    </span>
                  )}
                  {u.effectiveRoles?.map((r) => (
                    <Badge
                      key={r}
                      variant={
                        r === "admin" ? "coral" : r === "coach" ? "ocean" : "muted"
                      }
                      className="text-[9px]"
                    >
                      {r}
                    </Badge>
                  ))}
                  {u.cert && (
                    <Badge variant="muted" className="text-[9px]">
                      {u.cert}
                    </Badge>
                  )}
                  {u.vipLevel > 0 && (
                    <Badge variant="gold" className="gap-0.5 text-[9px]">
                      <Crown className="h-2.5 w-2.5" /> {vipLabel(u.vipLevel)}
                    </Badge>
                  )}
                  {u.blacklisted && (
                    <Badge variant="coral" className="gap-0.5 text-[9px]">
                      <Ban className="h-2.5 w-2.5" /> 黑名單
                    </Badge>
                  )}
                </div>
                <div className="tabular text-[11px] text-[var(--muted-foreground)] truncate">
                  {u.phone ?? "—"} · {u.email ?? "—"}
                </div>
                <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                  {u.certNumber ? `${u.certNumber} · ` : ""}
                  {u.logCount} logs
                </div>
                {u.stats && u.stats.totalBookings > 0 && (
                  <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                    訂單 {u.stats.totalBookings} · 完成 {u.stats.completed} ·
                    no-show {u.stats.noShow} · 已付 NT$
                    {u.stats.revenue.toLocaleString()}
                  </div>
                )}
                {u.notes && (
                  <div className="mt-0.5 rounded bg-[var(--muted)]/50 px-1.5 py-0.5 text-[10px]">
                    📝 {u.notes}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing({ ...u })}
                  title="編輯"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeUser(u)}
                  title="刪除會員"
                  className="border-[var(--color-coral)]"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--color-coral)]" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 編輯 Dialog */}
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯會員</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-2.5">
              <div className="rounded-md bg-[var(--muted)]/40 p-2 text-[10px] font-mono break-all text-[var(--muted-foreground)]">
                LINE userId: {editing.lineUserId}
                <br />
                LINE 顯示名稱: {editing.displayName}
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">真實姓名</Label>
                <Input
                  value={editing.realName ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      realName: e.target.value || null,
                    })
                  }
                  placeholder="例：王小明"
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">電話</Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={formatPhoneTW(editing.phone ?? "")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      phone: formatPhoneTW(e.target.value) || null,
                    })
                  }
                  maxLength={11}
                  placeholder="0912-345678"
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={editing.email ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, email: e.target.value || null })
                  }
                  placeholder="you@example.com"
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">角色（可複選）</Label>
                <div>
                  <div className="flex gap-1">
                    {ROLES.map((r) => {
                      const cur = editing.effectiveRoles ?? [editing.role];
                      const on = cur.includes(r);
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            const next = on
                              ? cur.filter((x) => x !== r)
                              : [...cur, r];
                            // 至少要保留一個角色
                            if (next.length === 0) return;
                            setEditing({
                              ...editing,
                              effectiveRoles: next,
                              // role primary 取優先順序：admin > coach > customer
                              role:
                                (["admin", "coach", "customer"] as const).find(
                                  (x) => next.includes(x),
                                ) ?? "customer",
                            });
                          }}
                          className={cn(
                            "flex-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                            on
                              ? "bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                          )}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                    一個 user 可同時是 customer + coach + admin，至少要選一個
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">證照等級</Label>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, cert: null })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px]",
                      editing.cert === null
                        ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                        : "border-[var(--border)]",
                    )}
                  >
                    無
                  </button>
                  {CERTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing({ ...editing, cert: c })}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px]",
                        editing.cert === c
                          ? "border-[var(--color-phosphor)] bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                          : "border-[var(--border)]",
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">證照號碼</Label>
                <Input
                  value={editing.certNumber ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      certNumber: e.target.value || null,
                    })
                  }
                  placeholder="例：PADI #1234567"
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">潛水紀錄數</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.logCount}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      logCount: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">VIP 等級</Label>
                <div>
                  <div className="grid grid-cols-5 gap-1">
                    {VIP_TIERS.map((tier) => (
                      <button
                        key={tier.level}
                        type="button"
                        onClick={() =>
                          setEditing({ ...editing, vipLevel: tier.level })
                        }
                        className={cn(
                          "rounded-md px-1 py-1.5 text-[10px] font-semibold border-2",
                          editing.vipLevel === tier.level
                            ? "border-[var(--color-gold)] bg-[var(--color-gold)]/15"
                            : "border-[var(--border)] bg-[var(--muted)]",
                        )}
                        style={
                          editing.vipLevel === tier.level
                            ? { borderColor: tier.color }
                            : undefined
                        }
                        title={`${tier.emoji} ${tier.name} (${tier.enName})`}
                      >
                        <div className="text-base">{tier.emoji}</div>
                        <div>LV{tier.level}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                    手動調整等級會被系統「核可款項時」覆寫，建議改 logCount 或 totalSpend 觸發自動升等
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">累計消費 (NT$)</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.totalSpend ?? 0}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      totalSpend: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">Admin 備註</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      notes: e.target.value || null,
                    })
                  }
                  placeholder="只有 admin 看得到，例：VIP 客 / 注意暈船 / 與某教練熟..."
                />
              </div>

              <div className="rounded-md border border-[var(--color-coral)]/40 bg-[var(--color-coral)]/5 p-2 space-y-1.5">
                <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-coral)]">
                  <input
                    type="checkbox"
                    checked={editing.blacklisted}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        blacklisted: e.target.checked,
                      })
                    }
                  />
                  加入黑名單
                </label>
                {editing.blacklisted && (
                  <textarea
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs"
                    rows={2}
                    value={editing.blacklistReason ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        blacklistReason: e.target.value || null,
                      })
                    }
                    placeholder="加黑原因（內部記錄）"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  取消
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? "儲存中..." : "儲存"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </LiffShell>
  );
}
