"use client";
// 手機簡版後台「會員快查」（/admin/m/users）
//   頂部搜尋框 + VIP 篩選 chips + 列表（一次抓全部，本地分頁；滑到底再多顯示 30 筆）。
//   走既有 /api/admin/users（回 { users: [...] }，含 stats），ready 後抓一次、客戶端篩。
//   點一筆導去 /admin/users 做細節操作（編輯 / 抵用金 / 潛水紀錄）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { getVipTier } from "@/lib/vip-tier";
import { toTaipeiDateString } from "@/lib/utils";
import { Search, ExternalLink } from "lucide-react";

// 只取手機卡片需要的欄位（API 回的是完整 User，多餘欄位忽略即可）
interface MUser {
  lineUserId: string;
  code: string | null;
  displayName: string;
  realName: string | null;
  phone: string | null;
  vipLevel: number;
  creditBalance: number;
  logCount: number;
  haiwangziLogCount: number;
  lastActiveAt: string;
}
interface Resp {
  users: MUser[];
}

// 一次只渲染這麼多卡片，滑到底再加一批（手機顧 DOM 量 / 流量）
const PAGE = 30;

// VIP 篩選 chips。"vip5plus" = 鐵血會員：vipLevel>=5 且 海王子潛次>=300（對齊桌機版）
type VipFilter = "all" | "vip1" | "vip2" | "vip3" | "vip4" | "vip5" | "vip5plus";
const VIP_CHIPS: Array<{ key: VipFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "vip1", label: "VIP1" },
  { key: "vip2", label: "VIP2" },
  { key: "vip3", label: "VIP3" },
  { key: "vip4", label: "VIP4" },
  { key: "vip5", label: "VIP5" },
  { key: "vip5plus", label: "VIP5+ 鐵血" },
];

function matchVip(u: MUser, f: VipFilter): boolean {
  if (f === "all") return true;
  // 鐵血：LV5 且潛水 ≥300 支（與 src/app/admin/users/page.tsx 一致）
  if (f === "vip5plus") return u.vipLevel >= 5 && u.haiwangziLogCount >= 300;
  return u.vipLevel === Number(f.slice(3));
}

export default function MobileUsersPage() {
  const { ready } = useAdminAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [vip, setVip] = useState<VipFilter>("all");
  const [users, setUsers] = useState<MUser[]>([]);
  const [visible, setVisible] = useState(PAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 搜尋去抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // ready 後抓一次全部會員（API 不分頁，回 { users: [...] }）
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    adminFetch<Resp>("/api/admin/users")
      .then((d) => {
        if (!alive) return;
        setUsers(d.users ?? []);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "載入失敗");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ready]);

  // 客戶端篩選（VIP + 關鍵字：姓名 / 電話 / 會員編號）
  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (!matchVip(u, vip)) return false;
      if (debouncedQ) {
        const hay = [
          u.realName ?? "",
          u.displayName,
          u.phone ?? "",
          u.code ?? "",
        ]
          .join("|")
          .toLowerCase();
        if (!hay.includes(debouncedQ)) return false;
      }
      return true;
    });
  }, [users, vip, debouncedQ]);

  // 篩選條件變更 → 重置可見數量
  useEffect(() => {
    setVisible(PAGE);
  }, [debouncedQ, vip]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  const loadMore = useCallback(() => {
    setVisible((v) => v + PAGE);
  }, []);

  // 滑到底自動多顯示一批
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  return (
    <MobileAdminShell title="會員管理" back="/admin/m">
      <div className="mb-3 flex items-center justify-end">
        <Link
          href="/admin/users"
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          完整版 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* 搜尋框 */}
      <div
        className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}
      >
        <Search className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋姓名 / 電話 / 會員編號"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          inputMode="search"
        />
      </div>

      {/* VIP 篩選 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VIP_CHIPS.map((c) => {
          const active = vip === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setVip(c.key)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: active ? "var(--color-ocean-deep)" : "rgba(0,0,0,0.05)",
                color: active ? "#fff" : "var(--foreground)",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="mb-3 rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(255,107,107,0.12)", color: "var(--color-coral)" }}
        >
          載入失敗：{error}
        </div>
      )}

      {/* 列表 */}
      <div className="space-y-2">
        {shown.map((u) => {
          const name = u.realName ?? u.displayName;
          const tier = getVipTier(u.vipLevel);
          return (
            <Link
              key={u.lineUserId}
              href="/admin/users"
              className="block rounded-xl border px-3 py-2.5 active:scale-[0.99]"
              style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold">{name}</span>
                {u.vipLevel > 0 && (
                  <span
                    className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={{ background: "rgba(0,0,0,0.05)", color: "var(--color-ocean-deep)" }}
                  >
                    LV{u.vipLevel} {tier.name}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {u.code ? u.code : "未編號"}
                {u.phone ? `・${u.phone}` : ""}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                <span style={{ color: "var(--muted-foreground)" }}>
                  抵用金{" "}
                  <span
                    className="font-mono tabular-nums font-semibold"
                    style={{ color: u.creditBalance > 0 ? "var(--color-coral)" : "inherit" }}
                  >
                    {u.creditBalance.toLocaleString()}
                  </span>
                </span>
                <span style={{ color: "var(--muted-foreground)" }}>
                  潛水{" "}
                  <span className="font-mono tabular-nums font-semibold" style={{ color: "var(--color-ocean-deep)" }}>
                    {u.haiwangziLogCount ?? 0}
                  </span>
                  {u.logCount ? <span className="opacity-60">/{u.logCount}</span> : ""} 次
                </span>
                {u.lastActiveAt && (
                  <span className="font-mono tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                    {toTaipeiDateString(u.lastActiveAt)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* 載入 / 空狀態 / 載更多 */}
      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有符合的會員
        </div>
      )}
      <div ref={sentinelRef} className="h-1" />
      {!loading && hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="mt-1 w-full py-2 text-center text-[11px]"
          style={{ color: "var(--muted-foreground)" }}
        >
          顯示更多（{filtered.length - visible}）
        </button>
      )}
    </MobileAdminShell>
  );
}
