"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Bell, Waves, ListChecks, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiff } from "@/lib/liff/LiffProvider";

// v709：底部 5 分頁 — 首頁 / 站內訊息 / 潛水預約 / 我的預約 / 個人中心。
//   「站內訊息」獨立成首頁右邊的分頁(掛未讀紅點);「聯絡客服」放在「個人中心」第一層。
const NAV: Array<{
  href: string;
  label: string;
  match: RegExp;
  Icon: React.ComponentType<{ className?: string }>;
  /** 在此 icon 掛站內通知未讀紅點 */
  unreadBadge?: boolean;
}> = [
  { href: "/liff/home", label: "首頁", match: /^\/liff\/(home|welcome)/, Icon: Home },
  { href: "/liff/notifications", label: "站內訊息", match: /^\/liff\/notifications/, Icon: Bell, unreadBadge: true },
  { href: "/liff/booking", label: "潛水預約", match: /^\/liff\/(booking|calendar|tour|dive|wishes)/, Icon: Waves },
  { href: "/liff/my", label: "我的預約", match: /^\/liff\/my/, Icon: ListChecks },
  { href: "/liff/profile", label: "個人中心", match: /^\/liff\/(profile|messages)/, Icon: User },
];

const UNREAD_CACHE_KEY = "haiwangzi:notifications:unread:v1";

/**
 * 站內通知未讀數 — 輕量 hook：
 *   - mount 先讀 localStorage 顯舊值（避免 0 → N 閃動）
 *   - 只在 mount 抓一次 unread-count，不輪詢
 */
function useUnreadCount(): number {
  const liff = useLiff();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    // 先顯 cache 的舊值
    try {
      const raw = window.localStorage.getItem(UNREAD_CACHE_KEY);
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n) && n > 0) setCount(n);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    if (!liff.ready) return;
    let cancelled = false;
    liff
      .fetchWithAuth<{ count: number }>("/api/me/notifications/unread-count")
      .then((d) => {
        if (cancelled) return;
        const n = d?.count ?? 0;
        setCount(n);
        try {
          window.localStorage.setItem(UNREAD_CACHE_KEY, String(n));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // 只在 ready 後抓一次，不輪詢
  }, [liff.ready, liff]);

  return count;
}

export function BottomNav() {
  const pathname = usePathname();
  const unread = useUnreadCount();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-[var(--border)] bg-[var(--background)]/95 px-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur">
      {NAV.map(({ href, label, match, Icon, unreadBadge }) => {
        const active = match.test(pathname ?? "");
        const showDot = unreadBadge && unread > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
              active
                ? "bg-[var(--color-coral)]/10 text-[var(--color-coral)] font-bold"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            <span className="relative">
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              {showDot && (
                <span
                  className="absolute -right-1.5 -top-1 flex min-w-[1rem] items-center justify-center rounded-full bg-[var(--color-coral)] px-1 text-[9px] font-bold leading-none text-white"
                  style={{ height: "1rem" }}
                  aria-label={`${unread} 則未讀通知`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </span>
            <span className="whitespace-nowrap">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
