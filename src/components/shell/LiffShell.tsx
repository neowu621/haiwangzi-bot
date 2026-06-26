"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, HelpCircle, Heart, RefreshCw } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { SplashOverlay } from "@/components/shell/SplashOverlay";
import { useLiff } from "@/lib/liff/LiffProvider";
import { cn } from "@/lib/utils";
import { OnboardingModal } from "@/components/liff/OnboardingModal";

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
  const [qrUrl, setQrUrl] = React.useState<string>("");

  React.useEffect(() => {
    // 從 /api/config 拿 LINE OA QR 圖片 URL（admin 在後台設定的）
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setQrUrl(c.externalLinks?.lineOaQrUrl ?? ""))
      .catch(() => {});
  }, []);

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

      {/* QR Code (若 admin 後台有設) */}
      {qrUrl && (
        <div className="mb-4 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="LINE OA QR Code"
            className="h-44 w-44 rounded-lg border-2 bg-white p-2 shadow-sm"
            style={{ borderColor: "rgba(6,199,85,0.3)" }}
          />
          <p className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">📱 用 LINE 掃 QR 直接加好友</p>
        </div>
      )}

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

  // v311：onboarding gate — 未完成 onboarding → 強制顯示 OnboardingModal
  type MeShape = {
    realName: string | null;
    phone: string | null;
    email: string | null;
    onboardingCompletedAt: string | null;
    emailVerifiedAt: string | null;
  };
  const [me, setMe] = React.useState<MeShape | null>(null);
  const [meLoaded, setMeLoaded] = React.useState(false);
  React.useEffect(() => {
    if (!liff.ready || skipFriendGate) return;
    if (liff.mode === "mock") { setMeLoaded(true); return; }
    if (liff.isFriend === false) return; // friend gate 還沒過，不必拉
    let cancelled = false;
    liff.fetchWithAuth<MeShape>("/api/me")
      .then((u) => { if (!cancelled) setMe(u); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMeLoaded(true); });
    return () => { cancelled = true; };
  }, [liff.ready, liff.isFriend, liff.mode, skipFriendGate, liff]);
  const needsOnboarding = meLoaded && me !== null && me.onboardingCompletedAt === null;

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
        {/* 左側：Wordmark (含版本)，點按回手機首頁(官網 /) — v696 */}
        <Link
          href="/"
          aria-label="回手機首頁"
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
          {/* v312：Email 未驗證提醒 banner（onboarding 完成但 email 未驗證）*/}
          {me && me.onboardingCompletedAt && !me.emailVerifiedAt && me.email && (
            <EmailVerifyBanner email={me.email} onResent={() => { /* noop, 重寄完不需重抓 me */ }} />
          )}
          <main className="flex-1 pb-24">{children}</main>
          {bottomNav ? bottomNav : null}
        </>
      )}

      {/* v311：強制 Onboarding Modal — 完成前完全擋住底層 children */}
      {needsOnboarding && (
        <OnboardingModal
          open
          defaultRealName={me?.realName ?? undefined}
          defaultPhone={me?.phone ?? undefined}
          defaultEmail={me?.email ?? undefined}
          onComplete={() => {
            // 重新拉 /api/me
            liff.fetchWithAuth<MeShape>("/api/me").then(setMe).catch(() => {});
          }}
        />
      )}

      {/* 版本已搬到 header 左上，footer 留空（讓底部 nav 不被擋） */}
    </div>
  );
}

// v641：把 fetchWithAuth 丟出的 `HTTP 429: {json}` 解析成友善訊息 + retryAfter
function parseApiError(e: unknown): { message?: string; retryAfter?: number } {
  const raw = e instanceof Error ? e.message : String(e);
  const i = raw.indexOf("{");
  if (i >= 0) {
    try {
      const o = JSON.parse(raw.slice(i)) as { message?: unknown; retryAfter?: unknown };
      return {
        message: typeof o.message === "string" ? o.message : undefined,
        retryAfter: typeof o.retryAfter === "number" ? o.retryAfter : undefined,
      };
    } catch { /* ignore */ }
  }
  return {};
}

// v312：Email 驗證提醒 banner（v641：友善錯誤 + 冷卻倒數）
function EmailVerifyBanner({ email, onResent }: { email: string; onResent: () => void }) {
  const liff = useLiff();
  const [sending, setSending] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (sending || cooldown > 0) return;
    setSending(true);
    setMsg(null);
    try {
      await liff.fetchWithAuth("/api/me/send-verify-email", { method: "POST", body: JSON.stringify({}) });
      setMsg(`✓ 已重寄到 ${email}，請至信箱查收（含垃圾信匣）`);
      setCooldown(60); // 與後端 60 秒速率限制一致
      onResent();
    } catch (e) {
      const { message, retryAfter } = parseApiError(e);
      if (retryAfter && retryAfter > 0) {
        setCooldown(retryAfter);
        setMsg(message ?? `請等 ${retryAfter} 秒後再試`);
      } else {
        // 非速率限制 → 真正寄送失敗
        setMsg(message ?? "重寄失敗，請稍後再試或聯絡客服");
      }
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs flex items-center gap-2">
      <span>✉ 請完成 Email 驗證（{email}）</span>
      <button
        type="button"
        onClick={resend}
        disabled={sending || cooldown > 0}
        className="ml-auto rounded-full bg-amber-600 px-2.5 py-0.5 text-[11px] font-medium text-white disabled:opacity-50"
      >
        {cooldown > 0 ? `${cooldown} 秒後可重寄` : sending ? "寄出中…" : "重寄驗證信"}
      </button>
      {msg && <div className="basis-full text-[11px] text-amber-700 mt-1">{msg}</div>}
    </div>
  );
}
