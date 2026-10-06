"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { linkify } from "@/lib/linkify";
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
  buttonLabel: string | null; // v862：按鈕文字（來自後台模板設定）
  linkUrl2?: string | null; // v994：第二顆按鈕（有需要改善→客服）
  buttonLabel2?: string | null;
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
  // v1083：還剩幾筆未讀（含「還沒捲到」的舊通知）。
  //   這頁是分頁載入，進頁只會把第一頁標已讀 —— 更舊的未讀會一直留著，
  //   底部導覽的紅點數字也就一直清不掉。有這個數字才知道該不該顯示「全部已閱讀」。
  const [restUnread, setRestUnread] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

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
          // v1083：先標完這一頁，再問「還剩幾筆」——
          //   順序反了會把這頁的也算進去，按鈕就會對著已經讀掉的東西顯示。
          const askRest = () =>
            liff
              .fetchWithAuth<{ count: number }>("/api/me/notifications/unread-count")
              .then((r) => setRestUnread(r.count ?? 0))
              .catch(() => {});
          if (unreadIds.length > 0) {
            liff
              .fetchWithAuth("/api/me/notifications/read", {
                method: "POST",
                body: JSON.stringify({ ids: unreadIds }),
              })
              .then(askRest)
              .catch(() => {});
          } else {
            void askRest();
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

  // v1083：全部已閱讀 —— API 本來就支援 { all: true }，只是前端沒有入口。
  //   一次把「還沒捲到的舊未讀」也清掉，底部導覽的紅點才會真的歸零。
  const markAllRead = useCallback(() => {
    if (markingAll) return;
    setMarkingAll(true);
    liff
      .fetchWithAuth<{ updated: number }>("/api/me/notifications/read", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      })
      .then(() => {
        setRestUnread(0);
        // 畫面上已載入的也一起改成已讀（不重抓，省一趟來回）
        setItems((arr) => arr.map((n) => (n.isRead ? n : { ...n, isRead: true })));
      })
      .catch(() => {
        alert("標記失敗，請稍後再試");
      })
      .finally(() => setMarkingAll(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markingAll]);

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
        {/* v1083：只有「真的還有未讀」才出現 —— 沒有未讀還擺一顆按鈕，
            按下去什麼都不會發生，那是在騙人。 */}
        {restUnread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition active:scale-[.99] disabled:opacity-60"
            style={{ borderColor: "rgba(14,159,147,.4)", background: "rgba(14,159,147,.08)", color: "#0a6f68" }}
          >
            {markingAll ? "處理中…" : <>✓ 全部已閱讀<span className="font-normal opacity-75">（還有 {restUnread} 則未讀）</span></>}
          </button>
        )}

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
// v856：通知圖示 —— icon 是圖片網址就顯示品牌 logo 圖，否則照舊當 emoji 文字渲染。
//   （既有通知的 icon 都是 emoji，行為完全不變）
function NotifIcon({ icon, size }: { icon: string | null; size: number }) {
  const isUrl = !!icon && /^(https?:)?\/\//.test(icon);
  if (isUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={icon!}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="flex-shrink-0 rounded-[6px]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span className="leading-none flex-shrink-0 text-center" style={{ fontSize: size - 6, width: size }}>
      {icon ?? "🔔"}
    </span>
  );
}

function NotificationModal({ n, onClose }: { n: NotificationItem; onClose: () => void }) {
  const liff = useLiff();
  // v1039：按鈕被點 → 記一筆（fire-and-forget，不 await、不擋跳頁）
  const markClick = () => {
    liff.fetchWithAuth("/api/me/notifications/click", { method: "POST", body: JSON.stringify({ id: n.id }) }).catch(() => {});
  };
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
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--border)] max-h-[85vh] overflow-y-auto shadow-2xl"
        style={{ background: "var(--background)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5 p-4 border-b border-[var(--border)]">
          <NotifIcon icon={n.icon} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-snug text-[var(--foreground)]">{n.title}</div>
            <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">{relativeTime(n.createdAt)}</div>
          </div>
          <button onClick={onClose} aria-label="關閉" className="flex-shrink-0 text-[var(--muted-foreground)] text-xl leading-none px-1">✕</button>
        </div>
        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--foreground)]">
          {linkify(n.body)}
        </div>
        {/* v471：底部按鈕。v862：有連結→用模板設定的按鈕文字(與 LINE/Email 一致) + 旁邊一律附「關閉訊息」 */}
        <div className="p-4 pt-1 space-y-2">
          {n.linkUrl && (
            <a
              href={n.linkUrl}
              onClick={markClick}
              className="block rounded-xl bg-[var(--color-coral)] py-3 text-center text-sm font-bold text-white"
            >
              {n.buttonLabel || "前往查看"}
            </a>
          )}
          {/* v994：第二顆按鈕（到場確認的「有需要改善?告訴我們」→ 站內客服） */}
          {n.linkUrl2 && (
            <a
              href={n.linkUrl2}
              onClick={markClick}
              className="block rounded-xl border py-3 text-center text-sm font-bold text-[var(--color-ocean-deep)]"
              style={{ borderColor: "var(--border)" }}
            >
              {n.buttonLabel2 || "💬 聯繫客服"}
            </a>
          )}
          {n.linkUrl ? (
            <button
              onClick={onClose}
              className="block w-full rounded-xl border py-3 text-center text-sm font-bold text-[var(--muted-foreground)]"
              style={{ borderColor: "var(--border)" }}
            >
              關閉訊息
            </button>
          ) : (
            <button
              onClick={onClose}
              className="block w-full rounded-xl bg-[var(--color-coral)] py-3 text-center text-sm font-bold text-white"
            >
              ✓ 訊息已閱讀，關閉
            </button>
          )}
        </div>
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
        <NotifIcon icon={n.icon} size={22} />
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
