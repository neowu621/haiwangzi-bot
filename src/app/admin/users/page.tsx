"use client";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Edit3,
  Search,
  Trash2,
  Ban,
  Crown,
  ChevronUp,
  ChevronDown,
  Mail,
  Archive,
  RotateCcw,
} from "lucide-react";
import { cn, toTaipeiDateString } from "@/lib/utils";
import { formatPhoneTW } from "@/lib/phone";
import { VIP_TIERS, getVipTier } from "@/lib/vip-tier";

type Role = "customer" | "coach" | "boss" | "admin";
type Cert = "OW" | "AOW" | "Rescue" | "DM" | "Instructor";
type SortKey =
  | "displayName"
  | "lastActiveAt"
  | "haiwangziLogCount"
  | "creditBalance"
  | "totalSpend";

interface AdminUser {
  lineUserId: string;
  code?: string | null;
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
  deletedAt?: string | null;
  deletedBy?: string | null;
  deletedReason?: string | null;
  stats?: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    noShow: number;
    revenue: number;
    potential: number;
  };
  // v208：教練資料（當 role = coach 時有值）
  coach?: {
    id: string;
    cert: "DM" | "Instructor" | "CourseDirector";
    specialty: string[];
    feePerDive: number;
    note: string | null;
    active: boolean;
  } | null;
}

interface CreditTx {
  id: string;
  amount: number;
  reason: string;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
}

interface DiveBookingRef {
  date?: string;
  startTime?: string;
  sites?: string[];
  title?: string;
  dateStart?: string;
  dateEnd?: string;
}

interface DiveBooking {
  id: string;
  code?: string | null;
  type: "daily" | "tour";
  participants: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
  createdAt: string;
  ref: DiveBookingRef;
}

// v211：UI picker 移除 Rescue（但既有資料仍可顯示 — see CERT_LABEL_CN）
const CERTS: Cert[] = ["OW", "AOW", "DM", "Instructor"];
const ROLES: Role[] = ["customer", "coach", "boss", "admin"];

const REASON_LABELS: Record<string, string> = {
  birthday: "生日禮金",
  vip_upgrade: "VIP升等",
  refund: "退款",
  used: "使用",
  admin_adjust: "管理員調整",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  completed: "已完成",
  cancelled_by_user: "用戶取消",
  cancelled_by_weather: "天氣取消",
  no_show: "未到",
};

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
  const [creditExpiryDays, setCreditExpiryDays] = useState("");  // v185：發放有效天數覆寫（空＝用 default 360）
  const [creditBusy, setCreditBusy] = useState(false);

  // ── 禮金紀錄 popup ──────────────────────────────────────────────────────────
  const [creditHistUser, setCreditHistUser] = useState<AdminUser | null>(null);
  const [creditTxs, setCreditTxs] = useState<CreditTx[]>([]);
  const [creditTxsLoading, setCreditTxsLoading] = useState(false);

  // ── 潛水紀錄 popup ──────────────────────────────────────────────────────────
  const [diveHistUser, setDiveHistUser] = useState<AdminUser | null>(null);
  const [diveBookings, setDiveBookings] = useState<DiveBooking[]>([]);
  const [diveHistLoading, setDiveHistLoading] = useState(false);

  // ── 傳送訊息 popup ──────────────────────────────────────────────────────────
  const [notifyUser, setNotifyUser] = useState<AdminUser | null>(null);
  const [notifyChannel, setNotifyChannel] = useState<"line" | "email" | "both">("line");
  const [notifyLineText, setNotifyLineText] = useState("");
  const [notifyEmailSubject, setNotifyEmailSubject] = useState("");
  const [notifyEmailBody, setNotifyEmailBody] = useState("");
  const [notifyBusy, setNotifyBusy] = useState(false);

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
      } else if (sortKey === "totalSpend") {
        va = a.totalSpend ?? 0;
        vb = b.totalSpend ?? 0;
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

  async function softDeleteUser(u: AdminUser) {
    const reason = window.prompt(
      `軟刪除（封存）會員「${u.realName ?? u.displayName}」？\n\n` +
      `會員帳號保留，但無法登入 LIFF；所有訂單/付款紀錄保留以利查帳。\n\n` +
      `（選填）封存原因：`,
      "",
    );
    if (reason === null) return; // 取消
    try {
      const r = await adminFetch<{ ok: boolean; preserved: { bookings: number; activeBookings: number; paidBookings: number } }>(
        `/api/admin/users/${encodeURIComponent(u.lineUserId)}/soft-delete`,
        { method: "POST", body: JSON.stringify({ reason: reason || undefined }) },
      );
      alert(
        `✓ 已軟刪除「${u.realName ?? u.displayName}」\n\n` +
        `保留資料：\n` +
        `• 訂單 ${r.preserved.bookings} 筆\n` +
        `• 進行中訂單 ${r.preserved.activeBookings} 筆\n` +
        `• 未退款已付款訂單 ${r.preserved.paidBookings} 筆`,
      );
      setUsers((arr) => arr.map((x) => x.lineUserId === u.lineUserId ? { ...x, deletedAt: new Date().toISOString() } : x));
    } catch (e) {
      alert("軟刪除失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function restoreUser(u: AdminUser) {
    if (!confirm(`還原會員「${u.realName ?? u.displayName}」？\n還原後該會員可重新登入 LIFF。`)) return;
    try {
      await adminFetch(
        `/api/admin/users/${encodeURIComponent(u.lineUserId)}/soft-delete?action=restore`,
        { method: "POST", body: "{}" },
      );
      setUsers((arr) => arr.map((x) => x.lineUserId === u.lineUserId ? { ...x, deletedAt: null } : x));
    } catch (e) {
      alert("還原失敗：" + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function removeUser(u: AdminUser) {
    const hasBookings = (u.stats?.totalBookings ?? 0) > 0;
    if (
      !confirm(
        `永久刪除會員「${u.realName ?? u.displayName}」？\n\n` +
          (hasBookings ? `⚠️ 此會員有 ${u.stats?.totalBookings} 筆訂單將一併刪除。\n\n` : "") +
          `如果只是要停用該會員，請改用「封存」(軟刪除)，保留所有訂單。\n\n` +
          `永久刪除 = 全部消失，無法復原。`,
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
            // v208：若 role 是 coach，帶上 coach 設定
            ...((editing.effectiveRoles ?? [editing.role]).includes("coach") && editing.coach
              ? { coach: {
                  cert: editing.coach.cert,
                  specialty: editing.coach.specialty,
                  feePerDive: editing.coach.feePerDive,
                  note: editing.coach.note,
                  active: editing.coach.active,
                }}
              : {}),
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
      const expiryDays = creditExpiryDays.trim() ? Math.max(0, parseInt(creditExpiryDays, 10) || 0) : undefined;
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
            ...(expiryDays !== undefined ? { expiryDays } : {}),
          }),
        },
      );
      setEditing({ ...editing, creditBalance: r.newBalance });
      // 更新 users list
      setUsers((arr) =>
        arr.map((x) =>
          x.lineUserId === editing.lineUserId ? { ...x, creditBalance: r.newBalance } : x,
        ),
      );
      setCreditAmount("");
      setCreditNote("");
      setCreditExpiryDays("");
    } catch (e) {
      alert("操作失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreditBusy(false);
    }
  }

  // ── 禮金紀錄 popup ──────────────────────────────────────────────────────────
  async function openCreditHistory(u: AdminUser) {
    setCreditHistUser(u);
    setCreditTxsLoading(true);
    setCreditTxs([]);
    try {
      const d = await adminFetch<{ txs: CreditTx[] }>(
        `/api/admin/credits?userId=${encodeURIComponent(u.lineUserId)}`,
      );
      setCreditTxs(d.txs);
    } catch (e) {
      alert("載入禮金紀錄失敗：" + (e instanceof Error ? e.message : String(e)));
      setCreditHistUser(null);
    } finally {
      setCreditTxsLoading(false);
    }
  }

  // ── 潛水紀錄 popup ──────────────────────────────────────────────────────────
  async function openDiveHistory(u: AdminUser) {
    setDiveHistUser(u);
    setDiveHistLoading(true);
    setDiveBookings([]);
    try {
      const d = await adminFetch<{ bookings: DiveBooking[] }>(
        `/api/admin/bookings?userId=${encodeURIComponent(u.lineUserId)}`,
      );
      setDiveBookings(d.bookings);
    } catch (e) {
      alert("載入潛水紀錄失敗：" + (e instanceof Error ? e.message : String(e)));
      setDiveHistUser(null);
    } finally {
      setDiveHistLoading(false);
    }
  }

  // ── 傳送訊息 ────────────────────────────────────────────────────────────────
  function openNotify(u: AdminUser) {
    setNotifyUser(u);
    setNotifyChannel("line");
    setNotifyLineText("");
    setNotifyEmailSubject("");
    setNotifyEmailBody("");
  }

  async function sendNotify() {
    if (!notifyUser) return;
    const needLine = notifyChannel === "line" || notifyChannel === "both";
    const needEmail = notifyChannel === "email" || notifyChannel === "both";
    if (needLine && !notifyLineText.trim()) {
      alert("請填寫 LINE 訊息");
      return;
    }
    if (needEmail && !notifyEmailBody.trim()) {
      alert("請填寫 Email 內容");
      return;
    }
    setNotifyBusy(true);
    try {
      const r = await adminFetch<{
        lineSent: boolean;
        emailSent: boolean;
        lineError: string | null;
        emailError: string | null;
      }>("/api/admin/notify", {
        method: "POST",
        body: JSON.stringify({
          userId: notifyUser.lineUserId,
          channel: notifyChannel,
          lineText: notifyLineText,
          emailSubject: notifyEmailSubject,
          emailBody: notifyEmailBody,
        }),
      });
      const msgs: string[] = [];
      if (r.lineSent) msgs.push("LINE 推播成功");
      if (r.emailSent) msgs.push("Email 發送成功");
      if (r.lineError) msgs.push(`LINE 失敗：${r.lineError}`);
      if (r.emailError) msgs.push(`Email 失敗：${r.emailError}`);
      alert(msgs.join("\n") || "發送完成");
      if (r.lineSent || r.emailSent) setNotifyUser(null);
    } catch (e) {
      alert("發送失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setNotifyBusy(false);
    }
  }

  function vipLabel(lv: number) {
    const tier = getVipTier(lv);
    return `${tier.emoji} ${tier.name}`;
  }

  function diveLabel(b: DiveBooking) {
    if (b.type === "daily") {
      const sites = b.ref.sites?.join("、") ?? "—";
      return `${b.ref.date ?? ""} ${b.ref.startTime ?? ""} ${sites}`;
    }
    return `${b.ref.title ?? "潛水團"} ${b.ref.dateStart ?? ""} ~ ${b.ref.dateEnd ?? ""}`;
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
                  `會員 (${users.filter((u) => u.effectiveRoles?.includes("customer")).length})`,
                ],
                [
                  "coach",
                  `教練 (${users.filter((u) => u.effectiveRoles?.includes("coach")).length})`,
                ],
                [
                  "boss",
                  `老闆 (${users.filter((u) => u.effectiveRoles?.includes("boss")).length})`,
                ],
                [
                  "admin",
                  `管理員 (${users.filter((u) => u.effectiveRoles?.includes("admin")).length})`,
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
                    <th className="px-4 py-3 font-medium">會員編號</th>
                    <th
                      className="cursor-pointer pl-2 pr-3 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("displayName")}
                    >
                      姓名
                      <SortIcon k="displayName" />
                    </th>
                    <th className="px-2 py-3 font-medium" style={{ width: "1%" }}>角色</th>
                    <th className="px-4 py-3 font-medium">電話</th>
                    <th className="px-4 py-3 font-medium">Email / LINE ID</th>
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
                      潛水次數
                      <SortIcon k="haiwangziLogCount" />
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium hover:text-[var(--foreground)]"
                      onClick={() => toggleSort("totalSpend")}
                    >
                      累計消費
                      <SortIcon k="totalSpend" />
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
                      {/* 會員編號 — 縮字 + 不換行 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.code ? (
                          <span className="inline-block rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-teal-800 whitespace-nowrap">
                            {u.code}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">—</span>
                        )}
                      </td>
                      {/* 姓名 — 強制不換行 + LINE 名字縮字（左 padding 縮小靠左） */}
                      <td className="pl-2 pr-3 py-3 whitespace-nowrap">
                        <div className={cn("font-medium whitespace-nowrap", u.deletedAt && "line-through text-[var(--muted-foreground)]")}>
                          {u.realName ?? u.displayName}
                        </div>
                        {u.realName && (
                          <div className="text-[10px] text-[var(--muted-foreground)] whitespace-nowrap truncate max-w-[10rem]">
                            {u.displayName}
                          </div>
                        )}
                        {u.deletedAt && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <Archive className="h-3 w-3 text-amber-600" />
                            <span className="text-[10px] text-amber-600 font-semibold">
                              已封存
                            </span>
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
                      {/* 角色 — 縮小欄寬 */}
                      <td className="px-2 py-3 whitespace-nowrap" style={{ width: "1%" }}>
                        <div className="flex flex-col gap-0.5">
                          {u.effectiveRoles.map((r) => {
                            const ROLE_LABELS_CN = { customer: "會員", coach: "教練", boss: "老闆", admin: "管理員" };
                            return (
                              <Badge
                                key={r}
                                variant={roleBadgeVariant(r)}
                                className="text-[9px] inline-block w-fit"
                              >
                                {ROLE_LABELS_CN[r as keyof typeof ROLE_LABELS_CN] ?? r}
                              </Badge>
                            );
                          })}
                        </div>
                      </td>
                      {/* 電話 — 不換行 */}
                      <td className="px-4 py-3 tabular-nums text-xs whitespace-nowrap">
                        {u.phone ?? "—"}
                      </td>
                      {/* Email + LINE ID 合併欄 — 點擊開啟傳送視窗 */}
                      <td className="px-4 py-3 text-xs">
                        {u.email ? (
                          <button
                            type="button"
                            onClick={() => openNotify(u)}
                            className="flex items-center gap-1 text-[var(--color-ocean-deep)] underline decoration-dotted hover:opacity-70 transition-opacity"
                            title="點擊傳送訊息"
                          >
                            <Mail className="h-3 w-3 shrink-0" />
                            {u.email}
                          </button>
                        ) : (
                          <span className="text-[var(--muted-foreground)]">—</span>
                        )}
                        <div className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
                          {u.lineUserId.slice(0, 10)}...
                        </div>
                      </td>
                      {/* 證照 */}
                      <td className="px-4 py-3">
                        {u.cert ? (
                          <Badge variant="muted" className="text-[10px]" title={u.cert}>
                            {({ OW: "開放水域", AOW: "進階", Rescue: "救援", DM: "潛水長", Instructor: "潛水教練" } as Record<string, string>)[u.cert] ?? u.cert}
                          </Badge>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      {/* VIP — 純文字「LV1 鯨鯊」格式，不換行 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {u.vipLevel > 0 ? (
                          <span className="text-xs font-medium tabular-nums whitespace-nowrap" style={{ color: "var(--foreground)" }}>
                            LV{u.vipLevel} {getVipTier(u.vipLevel).name}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            —
                          </span>
                        )}
                      </td>
                      {/* 禮金 — 點擊看紀錄 */}
                      <td className="px-4 py-3 tabular-nums text-xs">
                        <button
                          type="button"
                          onClick={() => openCreditHistory(u)}
                          className="tabular-nums underline decoration-dotted hover:opacity-70 transition-opacity"
                          style={{
                            color: u.creditBalance > 0 ? "var(--color-coral)" : "inherit",
                          }}
                          title="點擊查看禮金紀錄"
                        >
                          {u.creditBalance > 0
                            ? `NT$${u.creditBalance.toLocaleString()}`
                            : "0"}
                        </button>
                      </td>
                      {/* 潛水次數 — 點擊看詳情 */}
                      <td className="px-4 py-3 tabular-nums text-xs text-center">
                        <button
                          type="button"
                          onClick={() => openDiveHistory(u)}
                          className="tabular-nums underline decoration-dotted hover:opacity-70 transition-opacity font-medium"
                          style={{ color: "var(--color-ocean-deep)" }}
                          title="點擊查看潛水紀錄"
                        >
                          {u.haiwangziLogCount ?? 0}
                        </button>
                      </td>
                      {/* 累計消費 */}
                      <td className="px-4 py-3 tabular-nums text-xs">
                        {(u.totalSpend ?? 0) > 0
                          ? `NT$${(u.totalSpend ?? 0).toLocaleString()}`
                          : "—"}
                      </td>
                      {/* 最後活躍 */}
                      <td className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                        {u.lastActiveAt
                          ? toTaipeiDateString(u.lastActiveAt)
                          : "—"}
                      </td>
                      {/* 操作 */}
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
                          {u.deletedAt ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => restoreUser(u)}
                              title="還原（取消封存）"
                              className="border-blue-400 text-blue-600 hover:bg-blue-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => softDeleteUser(u)}
                              title="封存（軟刪除）— 保留訂單，會員無法登入"
                              className="border-amber-400 text-amber-600 hover:bg-amber-50"
                            >
                              <Archive className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeUser(u)}
                            title="永久刪除（不可復原）"
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
                        colSpan={12}
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

      {/* ── Edit dialog ──────────────────────────────────────────────────────── */}
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
                <Label className="text-xs pt-1">角色</Label>
                <div>
                  <div className="flex gap-1">
                    {(["customer", "coach", "boss", "admin"] as const).map((r) => {
                      const cur = editing.role;
                      const on = cur === r;
                      const ROLE_LABELS = { customer: "會員", coach: "教練", boss: "老闆", admin: "管理員" };
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            // v209：單選（不可複選）
                            setEditing({
                              ...editing,
                              effectiveRoles: [r],
                              role: r,
                              coach: r === "coach"
                                ? (editing.coach ?? {
                                    id: editing.lineUserId.slice(0, 32),
                                    cert: "DM",
                                    specialty: [],
                                    feePerDive: 0,
                                    note: null,
                                    active: true,
                                  })
                                : editing.coach,
                            });
                          }}
                          className={cn(
                            "flex-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                            on
                              ? "bg-[var(--color-phosphor)] text-[var(--color-ocean-deep)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)]",
                          )}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* v208：教練設定（角色含 coach 時顯示）*/}
              {(editing.effectiveRoles ?? [editing.role]).includes("coach") && editing.coach && (
                <div className="rounded-lg border-2 p-3 space-y-2.5"
                  style={{ borderColor: "rgba(8,145,178,0.35)", background: "rgba(8,145,178,0.05)" }}>
                  <div className="flex items-center gap-2 text-sm font-bold text-cyan-700">
                    🤿 教練設定
                    <span className="ml-auto text-[10px] font-normal text-slate-500">儲存後自動同步教練清單</span>
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                    <Label className="text-xs pt-1">教練等級</Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["DM", "Instructor", "CourseDirector"] as const).map((c) => {
                        const labels: Record<typeof c, { title: string; desc: string }> = {
                          DM:             { title: "潛水長",   desc: "助教 / 協助" },
                          Instructor:     { title: "潛水教練", desc: "導潛 / OW・AOW" },
                          CourseDirector: { title: "課程總監", desc: "培訓・考核" },
                        };
                        const sel = editing.coach!.cert === c;
                        return (
                          <button
                            key={c} type="button"
                            onClick={() => setEditing({ ...editing, coach: { ...editing.coach!, cert: c } })}
                            className={cn(
                              "rounded-md border-2 p-1.5 text-left",
                              sel ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:border-slate-300",
                            )}>
                            <div className="text-xs font-bold">{labels[c].title}</div>
                            <div className="text-[10px] text-slate-500">{labels[c].desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                    <Label className="text-xs">特長</Label>
                    <Input
                      value={editing.coach.specialty.join(", ")}
                      onChange={(e) => setEditing({
                        ...editing,
                        coach: { ...editing.coach!, specialty: e.target.value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean) },
                      })}
                      placeholder="攝影、夜潛、技術潛水（逗號分隔）"
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                    <Label className="text-xs">費用/潛 (NT$)</Label>
                    <NumberInput
                      min={0}
                      value={editing.coach.feePerDive}
                      onChange={(n) => setEditing({ ...editing, coach: { ...editing.coach!, feePerDive: n } })}
                      className="h-8 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] items-start gap-2">
                    <Label className="text-xs pt-1">教練備註</Label>
                    <textarea
                      value={editing.coach.note ?? ""}
                      onChange={(e) => setEditing({ ...editing, coach: { ...editing.coach!, note: e.target.value || null } })}
                      rows={2}
                      placeholder="排班限制、特殊狀況..."
                      className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-[7rem_1fr] items-center gap-2">
                    <Label className="text-xs">啟用</Label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editing.coach.active}
                        onChange={(e) => setEditing({ ...editing, coach: { ...editing.coach!, active: e.target.checked } })}
                        className="h-3.5 w-3.5 accent-cyan-600"
                      />
                      <span className="text-xs text-slate-600">{editing.coach.active ? "可排班" : "暫停（不出現在場次教練選單）"}</span>
                    </label>
                  </div>
                </div>
              )}

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
                  {CERTS.map((c) => {
                    const CERT_LABELS_CN: Record<Cert, string> = {
                      OW: "開放水域",
                      AOW: "進階",
                      Rescue: "救援",
                      DM: "潛水長",
                      Instructor: "潛水教練",
                    };
                    return (
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
                      title={c}
                    >
                      {CERT_LABELS_CN[c]}
                    </button>);
                  })}
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
                    <NumberInput
                      min={0}
                      value={editing.logCount}
                      onChange={(n) =>
                        setEditing({ ...editing, logCount: n })
                      }
                    />
                  </div>
                  <div>
                    <div className="mb-0.5 text-[10px] text-[var(--muted-foreground)]">
                      潛水次數
                    </div>
                    <NumberInput
                      min={0}
                      value={editing.haiwangziLogCount ?? 0}
                      onChange={(n) =>
                        setEditing({ ...editing, haiwangziLogCount: n })
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
                <NumberInput
                  min={0}
                  value={editing.totalSpend ?? 0}
                  onChange={(n) =>
                    setEditing({ ...editing, totalSpend: n })
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
                    type="text"
                    inputMode="numeric"
                    placeholder="金額"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1"))}
                  />
                  <Input
                    placeholder="名義（會顯示給會員看，例：客訴補償）"
                    value={creditNote}
                    onChange={(e) => setCreditNote(e.target.value)}
                  />
                </div>
                {/* v185：有效天數覆寫 */}
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="有效天數（留空 = 用後台預設值，0 = 永不過期）"
                  value={creditExpiryDays}
                  onChange={(e) => setCreditExpiryDays(e.target.value.replace(/\D/g, "").replace(/^0+(\d)/, "$1"))}
                  className="text-xs"
                />
                {/* 快捷名義 — 點擊填入「原因」欄 */}
                <div className="flex flex-wrap gap-1">
                  {[
                    "生日紅包",
                    "活動補償",
                    "推薦獎勵",
                    "客訴補償",
                    "系統錯誤校正",
                    "老闆贈送",
                    "競賽獎金",
                    "潛友見證紅包",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCreditNote(preset)}
                      className="rounded-full border px-2 py-0.5 text-[10px] transition-colors hover:bg-teal-50"
                      style={{
                        borderColor: creditNote === preset ? "var(--color-phosphor)" : "var(--border)",
                        color: creditNote === preset ? "var(--color-ocean-deep)" : "var(--muted-foreground)",
                        background: creditNote === preset ? "rgba(0,217,203,0.1)" : "transparent",
                      }}
                    >
                      {preset}
                    </button>
                  ))}
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

      {/* ── 禮金紀錄 dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={creditHistUser !== null}
        onOpenChange={(o) => !o && setCreditHistUser(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>
              禮金紀錄 —{" "}
              {creditHistUser?.realName ?? creditHistUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          {creditTxsLoading ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              載入中...
            </div>
          ) : creditTxs.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              無禮金紀錄
            </div>
          ) : (
            <div>
              {/* 餘額 */}
              <div
                className="mb-3 flex items-center justify-between rounded-lg px-4 py-2"
                style={{
                  background: "rgba(255,123,90,0.08)",
                  border: "1px solid rgba(255,123,90,0.25)",
                }}
              >
                <span className="text-xs text-[var(--muted-foreground)]">目前餘額</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: "var(--color-coral)" }}>
                  NT$ {(creditHistUser?.creditBalance ?? 0).toLocaleString()}
                </span>
              </div>
              <div
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      className="text-left text-[var(--muted-foreground)]"
                      style={{ background: "var(--muted)" }}
                    >
                      <th className="px-3 py-2 font-medium">日期</th>
                      <th className="px-3 py-2 font-medium">類型</th>
                      <th className="px-3 py-2 font-medium">金額</th>
                      <th className="px-3 py-2 font-medium">餘額</th>
                      <th className="px-3 py-2 font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditTxs.map((tx, i) => (
                      <tr
                        key={tx.id}
                        className={cn(
                          "border-t",
                          i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20",
                        )}
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="px-3 py-2 tabular-nums text-[var(--muted-foreground)]">
                          {toTaipeiDateString(tx.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          {REASON_LABELS[tx.reason] ?? tx.reason}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 tabular-nums font-semibold",
                            tx.amount > 0
                              ? "text-green-600"
                              : "text-[var(--color-coral)]",
                          )}
                        >
                          {tx.amount > 0 ? "+" : ""}
                          {tx.amount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {tx.balanceAfter.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-[var(--muted-foreground)]">
                          {tx.note ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 潛水紀錄 dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={diveHistUser !== null}
        onOpenChange={(o) => !o && setDiveHistUser(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              潛水紀錄 —{" "}
              {diveHistUser?.realName ?? diveHistUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          {diveHistLoading ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              載入中...
            </div>
          ) : diveBookings.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
              無潛水訂單紀錄
            </div>
          ) : (
            <div>
              {/* 統計 */}
              {(() => {
                const totalPaid = diveBookings.reduce((s, b) => s + b.paidAmount, 0);
                const totalParticipants = diveBookings.reduce(
                  (s, b) => s + b.participants,
                  0,
                );
                return (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    {[
                      ["訂單數", `${diveBookings.length} 筆`],
                      ["總人次", `${totalParticipants} 人`],
                      ["已付款", `NT$${totalPaid.toLocaleString()}`],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg px-3 py-2 text-center"
                        style={{
                          background: "rgba(0,67,118,0.06)",
                          border: "1px solid rgba(0,67,118,0.15)",
                        }}
                      >
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {label}
                        </div>
                        <div
                          className="text-sm font-bold tabular-nums"
                          style={{ color: "var(--color-ocean-deep)" }}
                        >
                          {value}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div
                className="overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--border)" }}
              >
                <table className="w-full text-xs">
                  <thead>
                    <tr
                      className="text-left text-[var(--muted-foreground)]"
                      style={{ background: "var(--muted)" }}
                    >
                      <th className="px-3 py-2 font-medium">日期 / 行程</th>
                      <th className="px-3 py-2 font-medium">類型</th>
                      <th className="px-3 py-2 font-medium">人數</th>
                      <th className="px-3 py-2 font-medium">費用</th>
                      <th className="px-3 py-2 font-medium">已付</th>
                      <th className="px-3 py-2 font-medium">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diveBookings.map((b, i) => (
                      <tr
                        key={b.id}
                        className={cn(
                          "border-t",
                          i % 2 === 0 ? "bg-white" : "bg-[var(--muted)]/20",
                        )}
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium">{diveLabel(b)}</div>
                          {b.code && (
                            <div className="font-mono text-[10px] text-[var(--muted-foreground)]">
                              {b.code}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background:
                                b.type === "daily"
                                  ? "rgba(0,67,118,0.1)"
                                  : "rgba(255,123,90,0.1)",
                              color:
                                b.type === "daily"
                                  ? "var(--color-ocean-deep)"
                                  : "var(--color-coral)",
                            }}
                          >
                            {b.type === "daily" ? "日潛" : "潛水團"}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-center">
                          {b.participants}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          NT${b.totalAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          NT${b.paidAmount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px]",
                              b.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : b.status.startsWith("cancelled") || b.status === "no_show"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700",
                            )}
                          >
                            {STATUS_LABELS[b.status] ?? b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 傳送訊息 dialog ───────────────────────────────────────────────────── */}
      <Dialog
        open={notifyUser !== null}
        onOpenChange={(o) => !o && setNotifyUser(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              傳送訊息 —{" "}
              {notifyUser?.realName ?? notifyUser?.displayName}
            </DialogTitle>
          </DialogHeader>
          {notifyUser && (
            <div className="space-y-3">
              {/* 收件人資訊 */}
              <div className="rounded-md bg-[var(--muted)]/40 p-2 text-xs text-[var(--muted-foreground)] space-y-0.5">
                <div>📧 Email：{notifyUser.email ?? "（未填）"}</div>
                <div>💬 LINE：{notifyUser.lineUserId.slice(0, 14)}...</div>
              </div>

              {/* 通道選擇 */}
              <div>
                <Label className="text-xs mb-1.5 block">傳送管道</Label>
                <div className="flex gap-2">
                  {(["line", "email", "both"] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setNotifyChannel(ch)}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                        notifyChannel === ch
                          ? "border-[var(--color-ocean-deep)] bg-[var(--color-ocean-deep)] text-white"
                          : "border-[var(--border)] hover:border-[var(--color-ocean-deep)]",
                      )}
                    >
                      {ch === "line" ? "LINE" : ch === "email" ? "Email" : "兩者"}
                    </button>
                  ))}
                </div>
              </div>

              {/* LINE 文字 */}
              {(notifyChannel === "line" || notifyChannel === "both") && (
                <div>
                  <Label className="text-xs mb-1 block">LINE 訊息</Label>
                  <textarea
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                    rows={4}
                    placeholder="訊息內容..."
                    value={notifyLineText}
                    onChange={(e) => setNotifyLineText(e.target.value)}
                  />
                </div>
              )}

              {/* Email 欄位 */}
              {(notifyChannel === "email" || notifyChannel === "both") && (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs mb-1 block">Email 主旨</Label>
                    <Input
                      placeholder="（留空則用 LINE 訊息代替）"
                      value={notifyEmailSubject}
                      onChange={(e) => setNotifyEmailSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Email 內容</Label>
                    <textarea
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
                      rows={5}
                      placeholder="Email 正文..."
                      value={notifyEmailBody}
                      onChange={(e) => setNotifyEmailBody(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setNotifyUser(null)}
                >
                  取消
                </Button>
                <Button
                  className="flex-1"
                  disabled={notifyBusy}
                  onClick={sendNotify}
                >
                  {notifyBusy ? "發送中..." : "發送"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
