"use client";
/**
 * v334: 前台客戶活動紀錄
 *
 * 顯示 audit_log where actor_role='customer' 的所有紀錄
 * 含 IP / User Agent / metadata，方便老闆查證
 */
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-web/AdminShell";
import { adminFetch } from "@/lib/admin-web-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { memberName } from "@/lib/member-name"; // v1038：暱稱（姓名）
import { CustomerDetailDialog } from "@/components/admin-web/CustomerDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// v1036：摘要統計
// v1040：摘要卡除了數字，還帶「是哪些人」的名單
interface Person { userId: string; name: string; count: number; createdAt?: string }
interface Summary {
  activeUsers: number; loginCount: number; bookingCount: number; excludedStaff: number; newMembers?: number;
  people?: { active: Person[]; login: Person[]; booking: Person[]; newMembers: Person[] };
}

// v1048：活躍度欄的單一數字。標籤在上、數字在下，四個並排才不會糊成一長串
function Metric({ label, value, unit, hot, accent }: { label: string; value: number; unit: string; hot?: boolean; accent?: boolean }) {
  const on = value > 0 && (hot || accent);
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className="text-[9px] opacity-70">{label}</span>
      <span className="tabular text-[11.5px] font-bold" style={{ color: on ? (hot ? "#0a8f86" : "var(--color-ocean-deep)") : undefined }}>
        {value}
        <span className="ml-px text-[9px] font-normal opacity-70">{unit}</span>
      </span>
    </span>
  );
}

type CardKey = "active" | "newMembers" | "login" | "booking";
const CARD_TITLE: Record<CardKey, string> = {
  active: "這段期間有動作的客戶（數字＝活動筆數）",
  newMembers: "7 天內註冊的新客戶",
  login: "這段期間登入過的客戶（數字＝登入次數）",
  booking: "這段期間建立預約的客戶（數字＝筆數）",
};

function SumCard({
  label, value, unit, hint, accent, newAccent, people, open, onToggle,
}: {
  label: string; value: number; unit: string; hint?: string; accent?: boolean; newAccent?: boolean;
  people?: Person[]; open?: boolean; onToggle?: () => void;
}) {
  const hot = newAccent && value > 0;
  const clickable = !!people && people.length > 0;
  return (
    /* v1040：滑過先偷看名字，點下去在卡片下方展開完整名單 */
    <div className="group relative">
      <button
        type="button"
        onClick={clickable ? onToggle : undefined}
        className={cn("w-full rounded-xl border px-3 py-2.5 text-left transition-colors", clickable && "hover:border-[var(--color-ocean-deep)]", !clickable && "cursor-default")}
        style={{ borderColor: open ? "var(--color-ocean-deep)" : hot ? "#f0b48c" : "var(--border)", background: hot ? "#fff7f2" : "#fff" }}
      >
        <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
        <div className="font-mono text-[21px] font-extrabold leading-tight tabular-nums" style={{ color: hot ? "#b3562c" : accent ? "var(--color-ocean-deep)" : undefined }}>
          {value.toLocaleString()}<span className="ml-0.5 text-[11px] font-normal text-[var(--muted-foreground)]">{unit}</span>
        </div>
        {hint && <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div>}
        {clickable && (
          <div className="mt-0.5 text-[10px] font-medium" style={{ color: "var(--color-ocean-deep)" }}>
            {open ? "▲ 收起名單" : "▼ 看是誰"}
          </div>
        )}
      </button>
      {clickable && !open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-max max-w-[260px] -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed text-white shadow-lg group-hover:block"
          style={{ background: "rgba(15,42,58,0.94)" }}
        >
          {people!.slice(0, 8).map((p) => p.name).join("、")}
          {people!.length > 8 && ` …等 ${people!.length} 位`}
        </span>
      )}
    </div>
  );
}

interface Row {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  user: { lineUserId: string; displayName: string; realName: string | null; nickname?: string | null; phone: string | null } | null;
  actorIp: string | null;
  actorUserAgent: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  metadata: unknown;
  // v1037：客戶登入概況
  loginTotal?: number;
  login14d?: number;
  isNewMember?: boolean;
  // v1048：活躍度欄
  orderTotal?: number;
  tankTotal?: number;
}

// 動作 → 中文 + emoji
const ACTION_LABELS: Record<string, { label: string; emoji: string; group: string }> = {
  "customer.login":                  { label: "LIFF 登入",      emoji: "🔐", group: "login" },
  "customer.view.product":           { label: "瀏覽產品",       emoji: "👀", group: "view" },
  "customer.booking.create":         { label: "建立預約",       emoji: "📋", group: "booking" },
  "customer.booking.update":         { label: "修改預約",       emoji: "📋", group: "booking" },
  "customer.booking.cancel":         { label: "取消預約",       emoji: "📋", group: "booking" },
  "customer.payment_proof.upload":   { label: "上傳付款證明",   emoji: "💰", group: "payment" },
  "customer.pay_link.open":          { label: "開啟付款連結",   emoji: "💰", group: "payment" },
  "customer.refund.request":         { label: "申請退款",       emoji: "💸", group: "refund" },
  "customer.refund.decide":          { label: "回覆退款方案",   emoji: "💸", group: "refund" },
  "customer.wish.create":            { label: "提出願望單",     emoji: "📝", group: "wish" },
  "customer.wish.reply":             { label: "回覆願望單",     emoji: "📝", group: "wish" },
  "customer.wish.cancel":            { label: "取消願望單",     emoji: "📝", group: "wish" },
  "customer.profile.update":         { label: "修改個人資料",   emoji: "👤", group: "profile" },
  "customer.email.verify":           { label: "驗證 Email",     emoji: "👤", group: "profile" },
  "customer.terms.sign":             { label: "簽署同意聲明",   emoji: "👤", group: "profile" },
};

const FILTER_CHIPS = [
  { key: "all",     label: "全部" },
  { key: "login",   label: "🔐 登入" },
  { key: "view",    label: "👀 瀏覽" },
  { key: "booking", label: "📋 訂單" },
  { key: "payment", label: "💰 付款" },
  { key: "refund",  label: "💸 退款" },
  { key: "wish",    label: "📝 願望單" },
  { key: "profile", label: "👤 個資" },
];

// v1040：滑過動作按鈕時說明「這個分類包含哪些動作」——直接由 ACTION_LABELS 推導，加新動作不必再改這裡
const CHIP_HINT: Record<string, string> = FILTER_CHIPS.reduce((acc, c) => {
  if (c.key === "all") { acc.all = "不分類，顯示客戶在前台的所有動作"; return acc; }
  const items = Object.values(ACTION_LABELS).filter((a) => a.group === c.key).map((a) => a.label);
  acc[c.key] = items.length ? `包含：${items.join("、")}` : "目前沒有對應的動作";
  return acc;
}, {} as Record<string, string>);

const DATE_CHIPS = [
  { key: "today",  label: "今天" },
  { key: "3days",  label: "3 天內" },
  { key: "7days",  label: "7 天內" },
  { key: "30days", label: "30 天內" },
  { key: "all",    label: "全部" },
];

function shortAction(a: string): { label: string; emoji: string; group: string } {
  return ACTION_LABELS[a] ?? { label: a, emoji: "•", group: "other" };
}

function formatTime(s: string): string {
  return new Date(s).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CustomerActivityPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterDate, setFilterDate] = useState("7days");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  // v1040：預設「包含管理人員」——先看到全部才不會漏掉事情；要專心看真實客戶行為時把勾取消即可
  const [includeStaff, setIncludeStaff] = useState(true);
  // v1040：排序。時間走後端(跨頁正確)，客戶/動作在目前這一頁內排（用來把同一個人的動作聚在一起）
  const [sortKey, setSortKey] = useState<"time" | "user" | "action">("time");
  const [sortAsc, setSortAsc] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  // v1040：目前展開的是哪張摘要卡
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const [openCustomerId, setOpenCustomerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const PAGE_SIZE = 50;

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (filterGroup !== "all") params.set("action", `customer.${filterGroup}.*`);
      if (includeStaff) params.set("includeStaff", "1"); // v1040：預設含管理人員
      if (sortKey === "time" && sortAsc) params.set("order", "asc"); // v1040：時間排序由後端做，跨頁才正確
      if (filterDate !== "all") {
        const days = filterDate === "today" ? 0 : filterDate === "3days" ? 3 : filterDate === "7days" ? 7 : 30;
        const from = new Date();
        from.setDate(from.getDate() - days);
        from.setHours(0, 0, 0, 0);
        params.set("from", from.toISOString());
      }
      const r = await adminFetch<{ total: number; rows: Row[]; summary?: Summary }>(`/api/admin/customer-activity?${params}`);
      setSummary(r.summary ?? null);
      let filtered = r.rows ?? [];
      if (search.trim()) {
        const k = search.trim().toLowerCase();
        filtered = filtered.filter((row) =>
          (row.user?.realName ?? "").toLowerCase().includes(k) ||
          (row.user?.nickname ?? "").toLowerCase().includes(k) || // v1038：暱稱也可搜
          (row.user?.displayName ?? "").toLowerCase().includes(k) ||
          (row.user?.phone ?? "").includes(k) ||
          (row.actorId ?? "").includes(k),
        );
      }
      // v1040：客戶 / 動作 在目前這一頁內排序（時間已由後端排好）
      if (sortKey !== "time") {
        const dir = sortAsc ? 1 : -1;
        const keyOf = (row: Row) =>
          sortKey === "user"
            ? `${row.user?.nickname ?? ""}${row.user?.realName ?? row.user?.displayName ?? row.actorName ?? ""}`
            : shortAction(row.action).label;
        filtered = [...filtered].sort((a, b) => keyOf(a).localeCompare(keyOf(b), "zh-TW") * dir);
      }
      setRows(filtered);
      setTotal(r.total ?? 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterGroup, filterDate, page, includeStaff, sortKey, sortAsc]);

  // v1040：點同一欄再按一次 → 反轉方向；換欄位 → 從預設方向開始（時間新→舊、其他 A→Z）
  const toggleSort = (key: "time" | "user" | "action") => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(key !== "time"); }
    setPage(1);
  };
  const SortTh = ({ k, children }: { k: "time" | "user" | "action"; children: React.ReactNode }) => (
    <th className="px-3 py-2.5 font-medium">
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-[var(--color-ocean-deep)]">
        {children}
        <span className={cn("text-[9px] leading-none", sortKey === k ? "text-[var(--color-ocean-deep)]" : "opacity-30")}>
          {sortKey === k ? (sortAsc ? "▲" : "▼") : "▼"}
        </span>
      </button>
    </th>
  );

  return (
    <AdminShell title="前台活動紀錄">
      {/* v1036：摘要——一眼看出這段期間有多少「真實客戶」在動 */}
      {summary && (
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SumCard label="活躍客戶" value={summary.activeUsers} unit="位" hint="這段期間有動作的人"
              people={summary.people?.active} open={openCard === "active"} onToggle={() => setOpenCard(openCard === "active" ? null : "active")} />
            <SumCard label="🆕 本週新客戶" value={summary.newMembers ?? 0} unit="位" hint="7 天內註冊，記得關心" newAccent
              people={summary.people?.newMembers} open={openCard === "newMembers"} onToggle={() => setOpenCard(openCard === "newMembers" ? null : "newMembers")} />
            <SumCard label="登入次數" value={summary.loginCount} unit="次"
              people={summary.people?.login} open={openCard === "login"} onToggle={() => setOpenCard(openCard === "login" ? null : "login")} />
            <SumCard label="建立預約" value={summary.bookingCount} unit="筆" accent
              people={summary.people?.booking} open={openCard === "booking"} onToggle={() => setOpenCard(openCard === "booking" ? null : "booking")} />
            <SumCard label="總活動筆數" value={total} unit="筆" hint={summary.excludedStaff > 0 ? `已排除 ${summary.excludedStaff} 位管理人員` : undefined} />
          </div>
          {/* v1040：點卡片 → 在下面列出是哪些人；再點名字可開客戶詳情 */}
          {openCard && summary.people && (
            <div className="mt-2 rounded-xl border bg-white p-3" style={{ borderColor: "var(--color-ocean-deep)" }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold">
                  {CARD_TITLE[openCard]}
                  <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">共 {summary.people[openCard].length} 位</span>
                </span>
                <button type="button" onClick={() => setOpenCard(null)} className="text-[11px] text-[var(--muted-foreground)] hover:underline">收起</button>
              </div>
              {summary.people[openCard].length === 0 ? (
                <p className="py-2 text-center text-[11px] text-[var(--muted-foreground)]">這段期間沒有符合的人。</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {summary.people[openCard].map((p) => (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => setOpenCustomerId(p.userId)}
                      className="rounded-full px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--border)]"
                      style={{ background: "var(--muted)" }}
                    >
                      {p.name}
                      {openCard === "newMembers"
                        ? p.createdAt && <span className="ml-1 tabular text-[10px] text-[var(--muted-foreground)]">{new Date(p.createdAt).toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })} 加入</span>
                        : <span className="ml-1 tabular text-[10px] font-bold" style={{ color: "var(--color-ocean-deep)" }}>{p.count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="space-y-3 mb-4">
        {/* 日期 filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] w-16">時間：</span>
          {DATE_CHIPS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setFilterDate(key); setPage(1); }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                filterDate === key
                  ? "bg-[var(--color-ocean-deep)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 動作 filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] w-16">動作：</span>
          {FILTER_CHIPS.map(({ key, label }) => (
            /* v1040：滑鼠移上去說明這個分類包含哪些動作 */
            <span key={key} className="group relative inline-block">
              <button
                type="button"
                onClick={() => { setFilterGroup(key); setPage(1); }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  filterGroup === key
                    ? "bg-[var(--color-ocean-deep)] text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--border)]",
                )}
              >
                {label}
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] leading-snug text-white shadow-lg group-hover:block"
                style={{ background: "rgba(15,42,58,0.94)" }}
              >
                {CHIP_HINT[key]}
              </span>
            </span>
          ))}
        </div>
        {/* 客戶搜尋 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)] w-16">客戶：</span>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void load(); }}
            placeholder="姓名 / 電話 / LINE userId"
            className="max-w-xs"
          />
          <Button size="sm" variant="outline" onClick={() => void load()}>🔍 搜尋</Button>
          <Button size="sm" variant="outline" onClick={() => { setSearch(""); void load(); }}>清除</Button>
          {/* v1036：預設只看真實客戶；需要時可把管理人員加回來 */}
          <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs text-[var(--muted-foreground)]">
            <input type="checkbox" checked={includeStaff} onChange={(e) => { setIncludeStaff(e.target.checked); setPage(1); }} className="h-3.5 w-3.5" />
            包含管理人員（老闆／IT／教練）
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]" style={{ background: "var(--muted)" }}>
                {/* v1040：時間 / 客戶 / 動作 可點欄名排序 */}
                <SortTh k="time">時間</SortTh>
                <SortTh k="user">客戶</SortTh>
                {/* v1048：登入／訂單／氣瓶獨立成一欄，不再擠在客戶名字後面 */}
                <th className="px-3 py-2.5 font-medium">活躍度</th>
                <SortTh k="action">動作</SortTh>
                <th className="px-3 py-2.5 font-medium">目標</th>
                <th className="px-3 py-2.5 font-medium">IP</th>
                <th className="px-3 py-2.5 font-medium text-right">詳情</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-[var(--muted-foreground)]">載入中...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-[var(--muted-foreground)]">沒有符合條件的活動紀錄</td></tr>
              ) : rows.map((r) => {
                const meta = shortAction(r.action);
                return (
                  <tr key={r.id} className="border-t hover:bg-sky-50" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] tabular text-[var(--muted-foreground)]">
                      {formatTime(r.createdAt)}
                    </td>
                    {/* v1038：客戶＝暱稱（姓名）＋新客戶標＋登入概況，全部同一行 */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        {r.user ? (
                          <button
                            type="button"
                            onClick={() => setOpenCustomerId(r.user!.lineUserId)}
                            className="text-sm font-medium underline decoration-dotted underline-offset-2 hover:text-[var(--color-ocean-deep)] hover:no-underline"
                          >
                            <span style={{ color: "#7c3aed", fontWeight: 800 }}>{r.user.nickname?.trim() || "?"}</span>
                            （{r.user.realName ?? r.user.displayName}）
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)]">{r.actorName ?? r.actorId ?? "—"}</span>
                        )}
                        {/* v1037：一週內註冊的新客戶 → 醒目提醒 */}
                        {r.isNewMember && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold" style={{ background: "#ffe8d9", color: "#b3562c" }}>
                            🆕 新客戶
                          </span>
                        )}
                      </div>
                    </td>
                    {/* v1048：活躍度＝近2週登入 / 總登入 / 訂單 / 氣瓶，四個數字獨立一欄 */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.user ? (
                        <div className="flex items-center gap-x-2.5 text-[10.5px] text-[var(--muted-foreground)]">
                          <Metric label="近2週" value={r.login14d ?? 0} unit="次" hot={(r.login14d ?? 0) > 0} />
                          <Metric label="總登入" value={r.loginTotal ?? 0} unit="次" />
                          <Metric label="訂單" value={r.orderTotal ?? 0} unit="筆" accent={(r.orderTotal ?? 0) > 0} />
                          <Metric label="氣瓶" value={r.tankTotal ?? 0} unit="支" accent={(r.tankTotal ?? 0) > 0} />
                        </div>
                      ) : (
                        <span className="text-[10.5px] text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant="muted" className="text-[10px]">
                        {meta.emoji} {meta.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {r.targetLabel ? (
                        <span className="font-mono rounded bg-teal-50 px-1.5 py-0.5 text-teal-800 text-[10px]">
                          {r.targetLabel}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] tabular text-[var(--muted-foreground)]">
                      {r.actorIp ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setDetail(r)}
                        className="text-[11px] text-[var(--color-ocean-deep)] underline hover:no-underline"
                      >
                        看詳情
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* v1040：說清楚排序的範圍，避免誤讀成全部資料重排 */}
      {sortKey !== "time" && (
        <p className="mt-2 text-[10.5px] text-[var(--muted-foreground)]">
          依「{sortKey === "user" ? "客戶" : "動作"}」排序只作用在目前這一頁（每頁 {PAGE_SIZE} 筆）；要跨全部資料排請用「時間」。
        </p>
      )}

      {/* 分頁 */}
      {total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-[var(--muted-foreground)]">
            共 {total} 筆，第 {page} / {Math.ceil(total / PAGE_SIZE)} 頁
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ 上一頁</Button>
            <Button size="sm" variant="outline" disabled={page >= Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)}>下一頁 ›</Button>
          </div>
        </div>
      )}

      {/* 客戶詳情 modal (全站統一) */}
      <CustomerDetailDialog userId={openCustomerId} onClose={() => setOpenCustomerId(null)} />

      {/* 紀錄詳情 modal */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>活動紀錄詳情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 text-xs">
              <Row k="時間" v={new Date(detail.createdAt).toLocaleString("zh-TW")} />
              <Row k="動作" v={`${shortAction(detail.action).emoji} ${shortAction(detail.action).label}（${detail.action}）`} />
              <Row k="客戶" v={detail.user ? `${memberName(detail.user.nickname, detail.user.realName ?? detail.user.displayName)} (${detail.user.lineUserId.slice(0, 20)}...)` : detail.actorId ?? "—"} />
              <Row k="IP" v={detail.actorIp ?? "—"} />
              <Row k="User Agent" v={detail.actorUserAgent ?? "—"} />
              <Row k="目標" v={`${detail.targetType ?? "—"} ${detail.targetLabel ?? detail.targetId ?? ""}`} />
              <div>
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] mb-1">Metadata</div>
                <pre className="rounded-md bg-[var(--muted)]/40 p-2 text-[11px] overflow-x-auto">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2">
      <div className="text-[10px] text-[var(--muted-foreground)] pt-0.5">{k}</div>
      <div className="text-xs break-all">{v}</div>
    </div>
  );
}
