"use client";
import * as React from "react";
import { RefreshCw, Trash2, CheckCircle2 } from "lucide-react";

/**
 * v244：LIFF 重置 / 登出頁
 *
 * 用途：
 *  - 客戶（或測試）卡在舊頁面 / 想換身分 / 想重新加好友流程時，
 *    一鍵清除 localStorage + sessionStorage + LIFF 登出，再重新初始化。
 *
 * 進入方式：在 LINE 內開 https://haiwangzi.zeabur.app/liff/reset
 *  - 不套 LiffShell / 不過好友 gate（避免被既有 session 卡住）
 */
export default function LiffResetPage() {
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function doReset() {
    setBusy(true);
    try {
      // v247：白名單清除 — 保留所有 LIFF_ 開頭的 key（LIFF SDK 用 LIFF_STORE:* prefix
      //   存 accessToken / IDToken / config / context / clientId 等授權狀態），只清掉 app
      //   自己的快取。整個 localStorage.clear() 會把 LIFF SDK 的 token 也一起砍 →
      //   下次 init 拿不到任何 token → fetchWithAuth 觸發 liff.login() → 無限閃跳。
      try {
        const liffKeys: Array<[string, string]> = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          // LIFF SDK 用的 prefix（@liff/consts STORE_KEY = "LIFF_STORE"）
          // 也保留 liff.utm_* / liffEvent / liff.* 等 LIFF 內部相關 key
          if (k.toUpperCase().startsWith("LIFF")) {
            const v = localStorage.getItem(k);
            if (v !== null) liffKeys.push([k, v]);
          }
        }
        localStorage.clear();
        liffKeys.forEach(([k, v]) => {
          try { localStorage.setItem(k, v); } catch {}
        });
      } catch {}
      try { sessionStorage.clear(); } catch {}

      // v246：刻意不呼叫 liff.logout()
      //   原因：在 iOS LINE App 內 logout() 會讓 LIFF 進入「未授權」狀態，
      //   下一個頁面任何 fetchWithAuth 都會觸發 liff.login() 自動跳轉 →
      //   token 還沒準備好又再跳 → 無限重導/閃跳。

      setDone(true);
      // 2 秒後 hard reload 回首頁（會重新 LIFF init + 重新跑好友檢查）
      setTimeout(() => {
        window.location.href = "/liff/welcome";
      }, 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] px-6 py-10 text-center">
      <div
        className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: "rgba(6,199,85,0.12)" }}
      >
        {done ? (
          <CheckCircle2 className="h-10 w-10" style={{ color: "#06C755" }} />
        ) : (
          <Trash2 className="h-9 w-9" style={{ color: "#06C755" }} />
        )}
      </div>

      {done ? (
        <>
          <h1 className="mb-2 text-xl font-bold">已重置完成</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            正在重新載入預約 App...
            <br />
            若沒自動跳轉，請手動關閉再重開。
          </p>
          <RefreshCw className="mx-auto mt-4 h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
        </>
      ) : (
        <>
          <h1 className="mb-2 text-xl font-bold">重置預約 App</h1>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
            如果畫面卡住、一直轉圈、或想重新登入 / 重新加好友，
            點下方按鈕清除暫存後重新載入。
            <br />
            <span className="text-[11px]">（你的訂單、會員資料都會保留，不會清掉）</span>
          </p>
          <button
            type="button"
            onClick={doReset}
            disabled={busy}
            className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            style={{ background: "#06C755" }}
          >
            <RefreshCw className={busy ? "h-5 w-5 animate-spin" : "h-5 w-5"} />
            {busy ? "重置中..." : "清除暫存並重新載入"}
          </button>
          <a
            href="/liff/welcome"
            className="mt-4 text-xs text-[var(--muted-foreground)] underline decoration-dotted"
          >
            取消，直接回首頁
          </a>
        </>
      )}
    </div>
  );
}
