"use client";
import { useEffect, useMemo, useState } from "react";
import { Edit3, Ban, Crown, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Role = "customer" | "coach" | "admin";
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
const ROLES: Role[] = ["customer", "coach", "admin"];

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
    return lv === 2 ? "Gold" : lv === 1 ? "VIP" : "—";
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing({ ...u })}
                title="編輯"
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
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
                  value={editing.phone ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, phone: e.target.value || null })
                  }
                  placeholder="0912-345-678"
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

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">VIP 等級</Label>
                <div className="flex gap-1">
                  {[
                    [0, "—"],
                    [1, "VIP"],
                    [2, "Gold"],
                  ].map(([lv, label]) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() =>
                        setEditing({ ...editing, vipLevel: lv as number })
                      }
                      className={cn(
                        "flex-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                        editing.vipLevel === lv
                          ? "bg-[var(--color-gold)] text-[var(--color-ocean-deep)]"
                          : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
