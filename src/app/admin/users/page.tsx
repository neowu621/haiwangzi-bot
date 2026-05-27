"use client";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Edit3, Search, Trash2, Ban, Crown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhoneTW } from "@/lib/phone";
import { VIP_TIERS, getVipTier } from "@/lib/vip-tier";

type Role = "customer" | "coach" | "boss" | "admin";
type Cert = "OW" | "AOW" | "Rescue" | "DM" | "Instructor";
type SortKey = "displayName" | "lastActiveAt" | "haiwangziLogCount" | "creditBalance";

interface AdminUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  phone: string | null;
  email: string | null;
  role: Role;
  effectiveRoles: Role[];
  roles?: Role[];
  cert: Cert | null;
  certNumber: string | null;
  logCount: number;
  haiwangziLogCount: number;
  birthday: string | null;
  creditBalance: number;
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

function roleBadgeVariant(r: Role): "coral" | "ocean" | "muted" {
  if (r === "admin") return "coral";
  if (r === "coach" || r === "boss") return "ocean";
  return "muted";
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<"all" | Role | "blacklist" | "vip">("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastActiveAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);

  async function load() {
    try {
      const d = await adminFetch<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(d.users);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    let arr = users.filter((u) => {
      if (filter === "blacklist" && !u.blacklisted) return false;
      if (filter === "vip" && u.vipLevel === 0) return false;
      if (
        filter !== "all" &&
        filter !== "blacklist" &&
        filter !== "vip" &&
        !u.effectiveRoles?.includes(filter)
      )
        return false;
      if (k) {
        const hay = [
          u.displayName,
          u.realName ?? "",
          u.phone ?? "",
          u.email ?? "",
          u.certNumber ?? "",
          u.lineUserId,
        ]
          .join("|")
          .toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });

    arr = [...arr].sort((a, b) => {
      let va: string | number = 0;
      let vb: string | number = 0;
      if (sortKey === "displayName") {
        va = (a.realName ?? a.displayName).toLowerCase();
        vb = (b.realName ?? b.displayName).toLowerCase();
      } else if (sortKey === "lastActiveAt") {
        va = a.lastActiveAt;
        vb = b.lastActiveAt;
      } else if (sortKey === "haiwangziLogCount") {
        va = a.haiwangziLogCount;
        vb = b.haiwangziLogCount;
      } else if (sortKey === "creditBalance") {
        va = a.creditBalance;
        vb = b.creditBalance;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return arr;
  }, [users, keyword, filter, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((x) => !x);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k)
      return (
        <span className="ml-1 opacity-30">
          <ChevronUp className="inline h-3 w-3" />
        </span>
      );
    return sortAsc ? (
      <ChevronUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ChevronDown className="ml-1 inline h-3 w-3" />
    );
  }

  async function removeUser(u: AdminUser) {
    const hasBookings = (u.stats?.totalBookings ?? 0) > 0;
    if (
      !confirm(
        `刪除會員「${u.realName ?? u.displayName}」？` +
          (hasBookings ? `\n此會員有 ${u.stats?.totalBookings} 筆訂單。` : ""),
      )
    )
      return;
    const ok2 = prompt("輸入「DELETE」確認：");
    if (ok2 !== "DELETE") return;
    try {
      await adminFetch(
        `/api/admin/users/${encodeURIComponent(u.lineUserId)}`,
        { method: "DELETE" },
      );
      setUsers((arr) => arr.filter((x) => x.lineUserId !== u.lineUserId));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("409")) {
        if (
          confirm("此會員有訂單，是否強制刪除（連訂單一起清掉）？")
        ) {
          try {
            await adminFetch(
              `/api/admin/users/${encodeURIComponent(u.lineUserId)}?force=true`,
              { method: "DELETE" },
            );
            setUsers((arr) =>
              arr.filter((x) => x.lineUserId !== u.lineUserId),
            );
          } catch (e2) {
            alert("強制刪除失敗：" + (e2 instanceof Error ? e2.message : String(e2)));
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
      const r = await adminFetch<{ ok: boolean; user: AdminUser }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            lineUserId: editing.lineUserId,
            roles: editing.effectiveRoles ?? [editing.role],
            realName: editing.realName,
            phone: editing.phone,
            email: editing.email,
            cert: editing.cert,
            certNumber: editing.certNumber,
            logCount: editing.logCount,
            haiwangziLogCount: editing.haiwangziLogCount,
            birthday: editing.birthday
              ? String(editing.birthday).slice(0, 10)
              : null,
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
      alert("儲存失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  async function grantCredit(sign: 1 | -1) {
    if (!editing) return;
    const n = Math.abs(Number(creditAmount));
    if (!n || isNaN(n)) {
      alert("請輸入金額");
      return;
    }
    setCreditBusy(true);
    try {
      const r = await adminFetch<{ newBalance: number }>(
        "/api/admin/credits",
        {
          method: "POST",
          body: JSON.stringify({
            userId: editing.lineUserId,
            amount: n * sign,
            reason: "admin_adjust",
            note:
              creditNote || (sign > 0 ? "管理員發放" : "管理員扣回"),
          }),
        },
      );
      setEditing({ ...editing, creditBalance: r.newBalance });
      setCreditAmount("");
      setCreditNote("");
    } catch (e) {
      alert("操作失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreditBusy(false);
    }
  }

  function vipLabel(lv: number) {
    const tier = getVipTier(lv);
    return `${tier.emoji} ${tier.name}`;
  }

  return (
    <AdminShell title="會員管理">
      <div className="space-y-4">
        {err && (
          <div
            className="rounded-lg p-3 text-sm"
            style={{
              background: "rgba(255,123,90,0.1)",
              color: "var(--color-coral)",
              border: "1px solid rgba(255,123,90,0.3)",
            }}
          >
            {err}
          </div>
        )}

        {/* Search + filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              placeholder="搜尋姓名 / 電話 / 證號 / LINE userId"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["all", `全部 (${users.length})`],
                [
                  "customer",
                  `客戶 (${users.filter((u) => u.effectiveRoles?.includes("customer")).length})`,
                ],
                [
                  "coach",
                  `教練 (${users.filter((u) => u.effectiveRoles?.includes("coach")).length})`,
                ],
                [
                  "admin",
                  `Admin (${users.filter((u) => u.effectiveRoles?.includes("admin")).length})`,
                ],
                ["vip", `VIP (${users.filter((u) => u.vipLevel > 0).length})`],
                [
                  "blacklist",
                  `黑名單 (${users.filter((u) => u.blacklisted).length})`,
                ],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === v
                    ? "bg-[var(--color-ocean-deep)] text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
            載入中...
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs text-[var(--muted-foreground)]"
                    style={{ background: "var(--muted)" }}
                  >
                    <th
                      className="cursor-pointer px-4 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("displayName")}
                    >
                      姓名
                      <SortIcon k="displayName" />
                    </th>
                    <th className="px-4 py-3 font-medium">LINE ID</th>
                    <th className="px-4 py-3 font-medium">角色</th>
                    <th className="px-4 py-3 font-medium">電話</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">證照</th>
                    <th className="px-4 py-3 font-medium">VIP</th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("creditBalance")}
                    >
                      禮金
                      <SortIcon k="creditBalance" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("haiwangziLogCount")}
                    >
                      海王子次數
                      <SortIcon k="haiwangziLogCount" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("lastActiveAt")}
                    >
                      最後活躍
                      <SortIcon k="lastActiveAt" />
                    </th>
                    <th className="px-4 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <tr
                      key={u.lineUserId}
                      className={cn(
                        "border-t",
                        i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20",
                        u.blacklisted && "opacity-60",
                      )}
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {u.realName ?? u.displayName}
                        </div>
                        {u.realName && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {u.displayName}
                          </div>
                        )}
                        {u.blacklisted && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <Ban className="h-3 w-3 text-[var(--color-coral)]" />
                            <span className="text-[10px] text-[var(--color-coral)]">
                              黑名單
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-[var(--muted-foreground)]">
                          {u.lineUserId.slice(0, 10)}...
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.effectiveRoles.map((r) => (
                            <Badge
                              key={r}
                              variant={roleBadgeVariant(r)}
                              className="text-[9px]"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {u.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                        {u.email ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {u.cert ? (
                          <Badge variant="muted" className="text-[10px]">
                            {u.cert}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.vipLevel > 0 ? (
                          <Badge variant="gold" className="gap-0.5 text-[10px]">
                            <Crown className="h-2.5 w-2.5" />
                            {vipLabel(u.vipLevel)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {u.creditBalance > 0 ? (
                          <span style={{ color: "var(--color-coral)" }}>
                            NT${u.creditBalance.toLocaleString()}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {u.haiwangziLogCount ?? 0}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                        {u.lastActiveAt
                          ? new Date(u.lastActiveAt).toLocaleDateString("zh-TW")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing({ ...u })}
                            title="編輯"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeUser(u)}
                            title="刪除"
                            className="border-[var(--color-coral)]"
                          >
                            <Trash2 className="h-3 w-3 text-[var(--color-coral)]" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]"
                      >
                        沒有符合條件的會員
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit dialog */}
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
                    setEditing({ ...editing, realName: e.target.value || null })
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
                            if (next.length === 0) return;
                            setEditing({
                              ...editing,
                              effectiveRoles: next,
                              role:
                                (
                                  ["admin", "boss", "coach", "customer"] as const
                                ).find((x) => next.includes(x)) ?? "customer",
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

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">潛水紀錄</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                      自填總經驗
                    </div>
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
                  <div>
                    <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                      海王子累積
                    </div>
                    <Input
                      type="number"
                      min={0}
                      value={editing.haiwangziLogCount ?? 0}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          haiwangziLogCount: Math.max(
                            0,
                            Number(e.target.value),
                          ),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">VIP 等級</Label>
                <div className="grid grid-cols-5 gap-1">
                  {VIP_TIERS.map((tier) => (
                    <button
                      key={tier.level}
                      type="button"
                      onClick={() =>
                        setEditing({ ...editing, vipLevel: tier.level })
                      }
                      className={cn(
                        "rounded-md border-2 px-1 py-1.5 text-[10px] font-semibold",
                        editing.vipLevel === tier.level
                          ? "border-[var(--color-gold)] bg-[var(--color-gold)]/15"
                          : "border-[var(--border)] bg-[var(--muted)]",
                      )}
                      style={
                        editing.vipLevel === tier.level
                          ? { borderColor: tier.color }
                          : undefined
                      }
                    >
                      <div className="text-base">{tier.emoji}</div>
                      <div>LV{tier.level}</div>
                    </button>
                  ))}
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

              <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                <Label className="text-xs">生日</Label>
                <Input
                  type="date"
                  value={
                    editing.birthday
                      ? String(editing.birthday).slice(0, 10)
                      : ""
                  }
                  onChange={(e) =>
                    setEditing({ ...editing, birthday: e.target.value || null })
                  }
                />
              </div>

              {/* Credit adjustment */}
              <div
                className="rounded-md p-2.5 space-y-2"
                style={{
                  border: "1px solid rgba(255,123,90,0.4)",
                  background: "rgba(255,123,90,0.05)",
                }}
              >
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold" style={{ color: "var(--color-coral)" }}>
                    禮金餘額
                  </Label>
                  <span
                    className="text-base font-bold tabular-nums"
                    style={{ color: "var(--color-coral)" }}
                  >
                    NT$ {(editing.creditBalance ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="金額"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                  />
                  <Input
                    placeholder="原因（選填）"
                    value={creditNote}
                    onChange={(e) => setCreditNote(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    style={{ borderColor: "var(--color-phosphor)", color: "var(--color-phosphor)" }}
                    disabled={creditBusy || !creditAmount}
                    onClick={() => grantCredit(1)}
                  >
                    + 發放
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    style={{ borderColor: "var(--color-coral)", color: "var(--color-coral)" }}
                    disabled={creditBusy || !creditAmount}
                    onClick={() => grantCredit(-1)}
                  >
                    - 扣回
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                <Label className="text-xs pt-1">Admin 備註</Label>
                <textarea
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                  rows={2}
                  value={editing.notes ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value || null })
                  }
                  placeholder="只有 admin 看得到"
                />
              </div>

              <div
                className="rounded-md p-2 space-y-1.5"
                style={{
                  border: "1px solid rgba(255,123,90,0.4)",
                  background: "rgba(255,123,90,0.05)",
                }}
              >
                <label
                  className="flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--color-coral)" }}
                >
                  <input
                    type="checkbox"
                    checked={editing.blacklisted}
                    onChange={(e) =>
                      setEditing({ ...editing, blacklisted: e.target.checked })
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
                    placeholder="加黑原因"
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
    </AdminShell>
  );
}
