"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, HelpCircle, Heart, RefreshCw } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { SplashOverlay } from "@/components/shell/SplashOverlay";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "@894bpmew";
const ADD_FRIEND_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ??
  `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA)}`;

/**
 * 非好友硬擋畫面 — 取代任何 children 直接渲染
 * 中央顯眼提示 + 加入好友按鈕，不讓任何頁面內容流出
 */
function FriendGateBlock() {
  const [rechecking, setRechecking] = React.useState(false);

  async function recheck() {
    setRechecking(true);
    try {
      const liffMod = await import("@line/liff");
      const friendship = await liffMod.default.getFriendship();
      if (friendship.friendFlag) {
        // 重新整理整個 LIFF state；最簡單方式 reload
        window.location.reload();
      } else {
        alert("還沒偵測到好友關係，請確認已在 LINE 加 OA 好友後再試一次");
      }
    } catch (e) {
      alert("檢查失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[var(--background)] px-6 py-8 overflow-y-auto">
      {/* 大頭 + 標題 */}
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full" style={{ background: "rgba(6,199,85,0.18)" }}>
        <Heart className="h-12 w-12" style={{ color: "#06C755" }} fill="#06C755" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-[var(--foreground)]">
        請先加 LINE 好友
      </h1>
      <p className="mb-8 max-w-sm text-center text-sm leading-relaxed text-[var(--muted-foreground)]">
        加 <b className="text-[var(--foreground)]">{APP_NAME}</b> 為好友後，
        才能用手機 LINE 預約 / 查詢訂單 / 接收行前通知。
      </p>

      {/* 大號加好友按鈕 */}
      <a
        href={ADD_FRIEND_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-bold text-white shadow-lg shadow-[#06C755]/40 transition-transform active:scale-95"
        style={{ background: "#06C755" }}
      >
        <span className="text-2xl">✚</span>
        加入 LINE 好友
      </a>

      {/* LINE ID */}
      <p className="mb-5 text-xs text-[var(--muted-foreground)]">
        或 LINE 搜尋官方帳號：
        <span className="ml-1 font-mono font-semibold text-[var(--foreground)]">
          {LINE_OA}
        </span>
      </p>

      {/* 重新檢查 */}
      <button
        type="button"
        onClick={recheck}
        disabled={rechecking}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
      >
        <RefreshCw className={rechecking ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
        {rechecking ? "檢查中..." : "我已加入好友，重新檢查"}
      </button>

      {/* 步驟 */}
      <div className="mt-6 max-w-sm rounded-xl border border-[var(--border)] bg-white p-4">
        <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">📝 操作步驟</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted-foreground)]">
          <li>點上方綠色按鈕跳到 LINE 加好友頁</li>
          <li>按「加入好友」</li>
          <li>回到本頁，按「重新檢查」</li>
          <li>系統會自動進入預約頁</li>
        </ol>
        <p className="mt-3 text-[10px] text-[var(--muted-foreground)]">
          ※ 若 LINE 顯示「400 Bad Request」或「找不到」，請改用 LINE App 搜尋上方 ID，或聯絡客服。
        </p>
      </div>

      {/* 🏠 回首頁逃生口 */}
      <a
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] underline decoration-dotted hover:text-[var(--foreground)]"
      >
        🏠 回首頁
      </a>
    </div>
  );
}

interface LiffShellProps {
  title?: string;
  /** 沒有歷史時 fallback 的回退路徑（直接 URL 開進來的情境） */
  backHref?: string;
  midnight?: boolean;
  bottomNav?: React.ReactNode;
  rightSlot?: React.ReactNode;
  /** 跳過好友檢查（給 /liff/add-friend 自己用，避免無限重導） */
  skipFriendGate?: boolean;
  children: React.ReactNode;
}

export function LiffShell({
  title,
  backHref,
  midnight = false,
  bottomNav,
  rightSlot,
  skipFriendGate = false,
  children,
}: LiffShellProps) {
  const liff = useLiff();
  const router = useRouter();
  const pathname = usePathname();

  // 好友 gate：未加 OA 好友 → 直接渲染加好友畫面（取代 children）
  // 不再用 router.replace（避免 children 閃一下）
  const blockedByFriendGate =
    !skipFriendGate &&
    liff.ready &&
    liff.mode !== "mock" &&
    liff.isFriend === false;

  function handleBack() {
    // 永遠優先用瀏覽器歷史（router.back 對 Next.js App Router 客戶端導航是可靠的）
    // 只有真的「直接打 URL 進來、history 只有 1 筆」才走 backHref fallback。
    //
    // 注意：document.referrer 在 Next.js client navigation 不會更新，
    // 因此我們不用 referrer 作為條件。
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref ?? "/liff/welcome");
  }

  // 只要 backHref 或 title 有定，就顯示返回鈕
  const showBack = backHref !== undefined;

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col",
        midnight && "midnight bg-[var(--color-midnight)]",
      )}
    >
      {/* Splash 暫時停用（v18 rollback）— 設計 OK 但有 hydration race，待後續修 */}
      {/* <SplashOverlay /> */}

      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur">
        {/* 左側：Wordmark (含版本)，點按回首頁 */}
        <Link
          href="/liff/welcome"
          aria-label="回首頁"
          className="flex-shrink-0 rounded-full active:scale-95"
        >
          <Wordmark />
        </Link>

        {/* 右側：返回鈕 + 頁面標題 + 動作 slot */}
        <div className="flex min-w-0 items-center gap-2">
          {title ? (
            <h1 className="truncate whitespace-nowrap text-base font-bold tracking-tight">
              {title}
            </h1>
          ) : null}
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--muted)] active:scale-95"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          {/* FAQ / 關於 — 永遠可達的入口 */}
          {pathname !== "/liff/faq" && (
            <Link
              href="/liff/faq"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--muted)] active:scale-95"
              aria-label="常見問題"
              title="常見問題 / 關於"
            >
              <HelpCircle className="h-5 w-5 text-[var(--muted-foreground)]" />
            </Link>
          )}
          {rightSlot}
        </div>
      </header>

      {liff.mode === "mock" &&
        (() => {
          // NEXT_PUBLIC_APP_LABEL: DEMO / LOCAL / STAGING ... 沒設就用 DEV
          const label = process.env.NEXT_PUBLIC_APP_LABEL ?? "DEV";
          // 不同 label 不同配色，避免一眼搞混
          const styles: Record<string, { bg: string; fg: string; emoji: string }> = {
            DEV: { bg: "var(--color-gold)", fg: "var(--color-ocean-deep)", emoji: "🧪" },
            LOCAL: { bg: "var(--color-gold)", fg: "var(--color-ocean-deep)", emoji: "💻" },
            DEMO: { bg: "#8B5CF6", fg: "#FFFFFF", emoji: "🎬" },
            STAGING: { bg: "#F59E0B", fg: "#0A2342", emoji: "🚧" },
          };
          const s = styles[label] ?? styles.DEV;
          return (
            <div
              className="flex items-center justify-between gap-2 px-4 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: s.bg, color: s.fg }}
            >
              <span>
                {s.emoji} {label} 模式 ·{" "}
                {liff.profile?.displayName ?? "未選"}{" "}
                <span className="opacity-60">({liff.profile?.userId})</span>
              </span>
              <Link
                href="/dev-login"
                className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-white hover:bg-black/50"
              >
                切換身分
              </Link>
            </div>
          );
        })()}
      {liff.error && (
        <div className="bg-[var(--color-coral)]/15 px-4 py-2 text-center text-xs text-[var(--color-coral)]">
          LIFF 錯誤: {liff.error}
        </div>
      )}

      {/* 非好友：硬擋畫面取代 children；不顯示 bottomNav */}
      {blockedByFriendGate ? (
        <FriendGateBlock />
      ) : (
        <>
          <main className="flex-1 pb-24">{children}</main>
          {bottomNav ? bottomNav : null}
        </>
      )}

      {/* 版本已搬到 header 左上，footer 留空（讓底部 nav 不被擋） */}
    </div>
  );
}
