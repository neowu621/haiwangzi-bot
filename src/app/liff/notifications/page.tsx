"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { LiffShell } from "@/components/shell/LiffShell";
import { LiffLoading } from "@/components/shell/LiffLoading";
import { BottomNav } from "@/components/shell/BottomNav";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  templateKey: string;
  title: string;
  body: string;
  linkUrl: string | null;
  icon: string | null;
  isRead: boolean;
  createdAt: string;
}

const PAGE_SIZE = 15;
const CACHE_KEY = "haiwangzi:notifications:v1";

// 相對時間（純前端、零依賴）。剛剛 / N 分鐘前 / N 小時前 / N 天前 / 日期
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
}

export default function NotificationsPage() {
  const liff = useLiff();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<NotificationItem | null>(null); // v467：點開看完整內容
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const readMarkedRef = useRef(false); // 確保「進頁標已讀」只打一次

  // 首屏載入（取代任何 cache）
  const loadFirst = useCallback(() => {
    liff
      .fetchWithAuth<{ items: NotificationItem[]; nextCursor: string | null }>(
        `/api/me/notifications?limit=${PAGE_SIZE}`,
      )
      .then((d) => {
        const list = d.items ?? [];
        setItems(list);
        setNextCursor(d.nextCursor ?? null);
        try {
          // 只快取前一頁，下次先顯舊值再背景刷新
          window.localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(0, PAGE_SIZE)));
        } catch {
          /* quota / disabled */
        }
        // 進頁對已載入的未讀打一次 read（只一次）
        if (!readMarkedRef.current) {
          const unreadIds = list.filter((n) => !n.isRead).map((n) => n.id);
          readMarkedRef.current = true;
          if (unreadIds.length > 0) {
            liff
              .fetchWithAuth("/api/me/notifications/read", {
                method: "POST",
                body: JSON.stringify({ ids: unreadIds }),
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => {
        /* 失敗保留 cache */
      })
      .finally(() => {
        setLoading(false);
        setHydrated(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // mount 後同步讀 cache，避免 SSR mismatch
    let hasCache = false;
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setItems(parsed as NotificationItem[]);
        hasCache = true;
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
    if (!hasCache) setLoading(true);
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 載入更多（滑到底）
  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    liff
      .fetchWithAuth<{ items: NotificationItem[]; nextCursor: string | null }>(
        `/api/me/notifications?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      )
      .then((d) => {
        setItems((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const n of d.items ?? []) if (!seen.has(n.id)) merged.push(n);
          return merged;
        });
        setNextCursor(d.nextCursor ?? null);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore]);

  // IntersectionObserver 觸發載入更多
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !nextCursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, loadMore]);

  return (
    <LiffShell title="通知中心" backHref="/liff/welcome" bottomNav={<BottomNav />}>
      <div className="px-4 pt-4 space-y-2">
        {hydrated && loading && items.length === 0 && (
          <LiffLoading variant="skeleton" count={4} label="正在載入通知..." />
        )}
        {hydrated && !loading && items.length === 0 && <EmptyState />}

        {items.map((n) => (
          <NotificationCard key={n.id} n={n} onOpen={() => setSelected(n)} />
        ))}

        {/* 無限載入 sentinel */}
        {nextCursor && <div ref={sentinelRef} className="h-1" />}
        {loadingMore && (
          <div className="py-3 text-center text-xs text-[var(--muted-foreground)]">載入更多⋯</div>
        )}
      </div>
      {selected && <NotificationModal n={selected} onClose={() => setSelected(null)} />}
    </LiffShell>
  );
}

// v467：點通知 → 彈窗顯示完整內容；有連結 → 一顆「前往」鈕點了才跳轉（確認後才執行）
function NotificationModal({ n, onClose }: { n: NotificationItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--card)] border border-[var(--border)] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 p-4 border-b border-[var(--border)]">
          <span className="text-2xl leading-none flex-shrink-0">{n.icon ?? "🔔"}</span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-snug">{n.title}</div>
            <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">{relativeTime(n.createdAt)}</div>
          </div>
          <button onClick={onClose} aria-label="關閉" className="flex-shrink-0 text-[var(--muted-foreground)] text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--foreground)]">
          {n.body}
        </div>
        {n.linkUrl && (
          <div className="p-4 pt-0">
            <a
              href={n.linkUrl}
              className="block w-full rounded-xl bg-[var(--color-coral)] py-3 text-center text-sm font-bold text-white"
            >
              前往查看 →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationCard({ n, onOpen }: { n: NotificationItem; onOpen: () => void }) {
  // v467：整張卡點擊 → 開詳情視窗看完整內容（不再直接跳轉，改在視窗內按鈕確認後才前往）
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn(
        "relative p-3 transition-colors cursor-pointer hover:bg-[var(--muted)]/30",
        !n.isRead && "bg-[var(--color-coral)]/[0.04]",
      )}
    >
      {/* 未讀左側 coral 點 */}
      {!n.isRead && (
        <span
          className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[var(--color-coral)]"
          aria-hidden
        />
      )}
      <div className="flex items-start gap-2 pl-2">
        <span className="text-lg leading-none flex-shrink-0">{n.icon ?? "🔔"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className={cn("text-sm truncate", !n.isRead ? "font-bold" : "font-semibold")}>
              {n.title}
            </div>
            <span className="flex-shrink-0 text-[10px] text-[var(--muted-foreground)] tabular">
              {relativeTime(n.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)] line-clamp-2">
            {n.body}
          </p>
          <span className="mt-1 inline-block text-[10px] text-[var(--color-coral)]">點擊看完整內容{n.linkUrl ? " · 含連結" : ""} →</span>
        </div>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="p-8 text-center text-sm text-[var(--muted-foreground)]">
      <div className="mb-2 text-3xl">🔔</div>
      目前沒有任何通知
      <div className="mt-4 flex justify-center">
        <Link
          href="/liff/my"
          className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-bold"
        >
          看我的預約
        </Link>
      </div>
    </Card>
  );
}
