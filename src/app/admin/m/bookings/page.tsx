"use client";
// 手機簡版後台「訂單快查」（/admin/m/bookings）
//   頂部搜尋框 + 狀態 chips + 列表（滑到底載更多，一次 20）。
//   走輕量 /api/admin/m/bookings（q/status/limit/cursor），每筆只回必要欄位。
//   點一筆導去 /admin/bookings 做細節操作。
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MobileAdminShell } from "@/components/admin-web/MobileAdminShell";
import { useAdminAuth, adminFetch } from "@/lib/admin-web-auth";
import { Search } from "lucide-react";

interface MBooking {
  id: string;
  code: string | null;
  customerName: string;
  status: string;
  statusLabel: string;
  amount: number;
  date: string | null;
  title: string;
}
interface Resp {
  items: MBooking[];
  nextCursor: string | null;
}

// 取現有主要狀態（對齊 DB BookingStatus）
const STATUS_CHIPS: Array<{ key: string; label: string }> = [
  { key: "", label: "全部" },
  { key: "awaiting_verify", label: "待審付款" },
  { key: "confirmed", label: "已確認" },
  { key: "completed", label: "已完成" },
  { key: "cancelled_by_user", label: "已取消" },
];

export default function MobileBookingsPage() {
  const { ready } = useAdminAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<MBooking[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 搜尋去抖 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const buildUrl = useCallback(
    (cur: string | null) => {
      const p = new URLSearchParams();
      if (debouncedQ) p.set("q", debouncedQ);
      if (status) p.set("status", status);
      p.set("limit", "20");
      if (cur) p.set("cursor", cur);
      return `/api/admin/m/bookings?${p.toString()}`;
    },
    [debouncedQ, status],
  );

  // 條件變更 → 重抓第一頁
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setError(null);
    adminFetch<Resp>(buildUrl(null))
      .then((d) => {
        if (!alive) return;
        setItems(d.items);
        setCursor(d.nextCursor);
        setHasMore(!!d.nextCursor);
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
  }, [ready, buildUrl]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || !cursor) return;
    setLoading(true);
    adminFetch<Resp>(buildUrl(cursor))
      .then((d) => {
        setItems((prev) => [...prev, ...d.items]);
        setCursor(d.nextCursor);
        setHasMore(!!d.nextCursor);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [loading, hasMore, cursor, buildUrl]);

  // 滑到底自動載更多
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <MobileAdminShell title="訂單管理" back="/admin/m">
      {/* 搜尋框 */}
      <div
        className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: "rgba(0,0,0,0.1)", background: "var(--card, #fff)" }}
      >
        <Search className="h-4 w-4 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋客戶姓名或訂單編號"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          inputMode="search"
        />
      </div>

      {/* 狀態 chips */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((c) => {
          const active = status === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setStatus(c.key)}
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
        {items.map((b) => (
          <Link
            key={b.id}
            href={`/admin/m/bookings/${b.id}?from=/admin/m/bookings`}
            className="block rounded-xl border px-3 py-2.5 active:scale-[0.99]"
            style={{ borderColor: "rgba(0,0,0,0.08)", background: "var(--card, #fff)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-bold">{b.customerName}</span>
              <span className="flex-shrink-0 font-mono text-sm font-bold tabular-nums">
                ${b.amount.toLocaleString()}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              {b.title}
              {b.date ? `・${b.date}` : ""}
              {b.code ? `・${b.code}` : ""}
            </div>
            <div className="mt-1 text-[11px] font-medium">{b.statusLabel}</div>
          </Link>
        ))}
      </div>

      {/* 載入 / 載更多 / 空狀態 */}
      {loading && (
        <div className="py-4 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
          載入中...
        </div>
      )}
      {!loading && items.length === 0 && (
        <div className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          沒有符合的訂單
        </div>
      )}
      <div ref={sentinelRef} className="h-1" />
      {!loading && hasMore && (
        <div className="py-2 text-center text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          往下滑載入更多
        </div>
      )}
    </MobileAdminShell>
  );
}
