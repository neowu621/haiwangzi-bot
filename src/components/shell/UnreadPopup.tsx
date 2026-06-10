"use client";
// v473：會員進 LIFF 時若有未讀站內訊息 → 跳一次彈窗顯示數量，點「查看」進訊息中心。
//   每個 session 只跳一次（sessionStorage）；已在通知頁則不跳。
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLiff } from "@/lib/liff/LiffProvider";

const SHOWN_KEY = "haiwangzi:unread-popup-shown:v1";

export function UnreadPopup() {
  const liff = useLiff();
  const router = useRouter();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!liff.ready) return;
    // 已在通知頁、或本 session 已跳過 → 不再跳
    if (pathname?.startsWith("/liff/notifications")) return;
    try { if (sessionStorage.getItem(SHOWN_KEY)) return; } catch { /* ignore */ }

    let cancelled = false;
    liff
      .fetchWithAuth<{ count: number }>("/api/me/notifications/unread-count")
      .then((d) => {
        if (cancelled) return;
        const n = d?.count ?? 0;
        if (n > 0) {
          setCount(n);
          setOpen(true);
          try { sessionStorage.setItem(SHOWN_KEY, "1"); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // 只在 ready 後檢查一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liff.ready]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-[var(--border)] p-5 text-center shadow-2xl"
        style={{ background: "var(--background)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-4xl mb-2">📬</div>
        <div className="text-base font-bold text-[var(--foreground)]">你有 {count} 則未讀訊息</div>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">有需要你確認 / 處理的通知，點下方查看。</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => { setOpen(false); router.push("/liff/notifications"); }}
            className="w-full rounded-xl bg-[var(--color-coral)] py-3 text-sm font-bold text-white"
          >
            查看訊息 →
          </button>
          <button
            onClick={() => setOpen(false)}
            className="w-full rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--muted-foreground)]"
            style={{ background: "var(--background)" }}
          >
            稍後再看
          </button>
        </div>
      </div>
    </div>
  );
}
