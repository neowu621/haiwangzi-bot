"use client";
import * as React from "react";
import { LiffShell } from "@/components/shell/LiffShell";
import { useLiff } from "@/lib/liff/LiffProvider";
import { useRouter } from "next/navigation";
import { Heart, RefreshCw } from "lucide-react";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
const LINE_OA = process.env.NEXT_PUBLIC_LINE_OA_ID ?? "@894bpmew";
const ADD_FRIEND_URL =
  process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL ??
  `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA)}`;

export default function AddFriendPage() {
  const liff = useLiff();
  const router = useRouter();
  const [rechecking, setRechecking] = React.useState(false);

  // 已是好友 → 自動導回首頁
  React.useEffect(() => {
    if (liff.ready && liff.isFriend === true) {
      router.replace("/liff/welcome");
    }
  }, [liff.ready, liff.isFriend, router]);

  async function recheck() {
    setRechecking(true);
    try {
      // 重新跑 getFriendship — 在 LIFF 加完好友後回到頁面時用
      const liffMod = await import("@line/liff");
      const friendship = await liffMod.default.getFriendship();
      if (friendship.friendFlag) {
        router.replace("/liff/welcome");
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
    <LiffShell skipFriendGate>
      <div className="flex min-h-[calc(100dvh-200px)] flex-col items-center justify-center px-6 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: "rgba(6,199,85,0.15)" }}>
            <Heart className="h-10 w-10" style={{ color: "#06C755" }} fill="#06C755" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            請先加入 LINE 好友
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-sm">
            為了確保你能收到場次通知、付款確認、行前提醒等重要訊息，
            <br />
            請先加 <b className="text-[var(--foreground)]">{APP_NAME}</b> 為 LINE 好友後再使用本服務。
          </p>
        </div>

        {/* Add Friend Button */}
        <a
          href={ADD_FRIEND_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-3 inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white shadow-lg shadow-[#06C755]/30 transition-transform active:scale-95"
          style={{ background: "#06C755" }}
        >
          <span className="text-xl">✚</span>
          加入 LINE 好友
        </a>

        {/* LINE ID */}
        <p className="mb-6 text-xs text-[var(--muted-foreground)]">
          或 LINE 搜尋官方帳號：
          <span className="ml-1 font-mono font-semibold text-[var(--foreground)]">
            {LINE_OA}
          </span>
        </p>

        {/* Recheck Button */}
        <button
          type="button"
          onClick={recheck}
          disabled={rechecking}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
        >
          <RefreshCw className={rechecking ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          {rechecking ? "檢查中..." : "我已加入好友，重新檢查"}
        </button>

        {/* Instructions */}
        <div className="mt-8 max-w-sm rounded-xl border border-[var(--border)] bg-white p-4">
          <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">📝 操作步驟</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-[var(--muted-foreground)]">
            <li>點上方綠色按鈕 → 跳到 LINE 加好友頁</li>
            <li>按「加入好友」</li>
            <li>回到本頁，按「重新檢查」</li>
            <li>系統會自動導向預約頁</li>
          </ol>
        </div>

        {/* Help */}
        <p className="mt-6 text-center text-[10px] text-[var(--muted-foreground)]">
          有問題？掃 QR Code 或聯絡客服協助。
        </p>
      </div>
    </LiffShell>
  );
}
