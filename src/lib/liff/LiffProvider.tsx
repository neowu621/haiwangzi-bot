"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export interface LiffContextValue {
  ready: boolean;
  loggedIn: boolean;
  profile: LiffProfile | null;
  idToken: string | null;
  mode: "real" | "mock";
  /** null = 還在檢查 / true = 已加 OA 好友 / false = 尚未加好友 */
  isFriend: boolean | null;
  login: () => void;
  logout: () => void;
  fetchWithAuth: <T = unknown>(url: string, init?: RequestInit) => Promise<T>;
  error: string | null;
}

const LiffContext = createContext<LiffContextValue | null>(null);

// Mock 模式預設用「桌面測試員」假帳號；可用 NEXT_PUBLIC_MOCK_USER_ID 覆寫，
// 例如本地連 production DB 想以真實 admin 身分操作時：
//   NEXT_PUBLIC_MOCK_USER_ID=Ufe9a553a9149d9ef6e9401dfb2e94a65
// 或在 /dev-login 選身分（會寫 localStorage.devPersona），優先級最高
function getMockProfile(): LiffProfile {
  // 1. localStorage devPersona（透過 /dev-login 選擇）
  if (typeof window !== "undefined") {
    const persona = localStorage.getItem("devPersona");
    if (persona) {
      return {
        userId: persona,
        displayName:
          localStorage.getItem("devPersonaName") ?? "（dev persona）",
      };
    }
  }
  // 2. env NEXT_PUBLIC_MOCK_USER_ID（build-time 寫死）
  if (process.env.NEXT_PUBLIC_MOCK_USER_ID) {
    return {
      userId: process.env.NEXT_PUBLIC_MOCK_USER_ID,
      displayName: "（local dev 以 admin 身分）",
    };
  }
  // 3. 預設 fallback
  return {
    userId: "U_mock_dev_user_0001",
    displayName: "桌面測試員",
  };
}

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const isMock =
    process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ||
    process.env.NEXT_PUBLIC_DEV_MODE === "1";

  const [ready, setReady] = useState<boolean>(isMock);
  const [loggedIn, setLoggedIn] = useState<boolean>(isMock);
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [idToken, setIdToken] = useState<string | null>(
    isMock ? "mock-id-token" : null,
  );
  // v243：idToken 也存 ref，讓 fetchWithAuth 在 token 刷新時不必觸發 re-render
  //   （避免 value useMemo 因 idToken 改變而重建 → [liff] 依賴頁面無限重抓 → iPhone 一直閃載入）
  const idTokenRef = useRef<string | null>(isMock ? "mock-id-token" : null);
  // Mock 模式預設視為已加好友（dev 用）；真實模式從 null 開始等 getFriendship
  const [isFriend, setIsFriend] = useState<boolean | null>(isMock ? true : null);
  const [error, setError] = useState<string | null>(null);
  // v254：iOS LIFF init 失敗 → 顯示專屬 fallback UI 取代 children（取代紅色 error banner）
  const [iosLiffInitFailed, setIosLiffInitFailed] = useState(false);

  // mock 模式：載入時讀 localStorage 設 profile（避免 SSR mismatch）
  useEffect(() => {
    if (isMock) setProfile(getMockProfile());
  }, [isMock]);

  useEffect(() => {
    if (isMock) return;
    let cancelled = false;

    // v252：iOS LINE 內嵌瀏覽器有時 iframe 剛載入時 fetch 會被打斷（"Load failed"），
    //   加 retry 解 race condition。Android webview 沒這問題但加上也無害。
    async function fetchWithRetry(url: string, tries = 3): Promise<Response> {
      let lastErr: unknown = null;
      for (let i = 0; i < tries; i++) {
        try {
          const res = await fetch(url);
          return res;
        } catch (e) {
          lastErr = e;
          // 200ms / 400ms / 800ms backoff
          await new Promise((r) => setTimeout(r, 200 * Math.pow(2, i)));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }

    // v253：給 liff.init() 本身加 retry。iOS LINE 內嵌瀏覽器在「冷開」時
    //   liff.init 內部的 LINE server features fetch 可能爆 "Unable to load client features" / "Load failed"。
    //   3 次 retry 配 exponential backoff 通常第二次就會過。
    async function liffInitWithRetry(
      liff: typeof import("@line/liff").default,
      liffId: string,
      tries = 3,
    ): Promise<void> {
      let lastErr: unknown = null;
      for (let i = 0; i < tries; i++) {
        try {
          await liff.init({ liffId });
          return;
        } catch (e) {
          lastErr = e;
          // 300ms / 600ms / 1200ms backoff
          await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    }

    (async () => {
      let step = "init";
      try {
        // v253：延一個 tick 讓 React 把頁面 hydration 跑完再啟動 LIFF init，
        //   避免「頁面渲染 + LIFF SDK 初始化」在 iOS 內嵌瀏覽器同時搶資源造成 init 失敗。
        await new Promise((r) => setTimeout(r, 0));

        step = "fetch_config";
        const cfgRes = await fetchWithRetry("/api/config");
        step = "parse_config";
        const cfg = await cfgRes.json();
        if (!cfg.liffId) {
          setError("LIFF ID 未設定 (LINE_LIFF_ID env var)");
          setReady(true);
          return;
        }
        step = "import_liff_sdk";
        const liffMod = await import("@line/liff");
        const liff = liffMod.default;
        step = "liff_init";
        await liffInitWithRetry(liff, cfg.liffId);
        step = "post_init";
        if (cancelled) return;
        const isLoggedIn = liff.isLoggedIn();
        setLoggedIn(isLoggedIn);
        if (isLoggedIn) {
          const p = await liff.getProfile();
          setProfile({
            userId: p.userId,
            displayName: p.displayName,
            pictureUrl: p.pictureUrl,
            statusMessage: p.statusMessage,
          });
          {
            const tok = liff.getIDToken();
            idTokenRef.current = tok;
            setIdToken(tok);
          }
        }
        // v251 (Opt A)：token 拿到後立刻 setReady(true)，不等 friendship 檢查完。
        //   friendship 是「好友 gate」用的，非阻塞主流程；在背景跑就好。
        //   省 200-800ms（一次 LINE Server 網路 RTT）讓頁面 fetch 立刻可以開始。
        setReady(true);

        if (isLoggedIn) {
          // 背景查 LINE OA 好友狀態（不擋 ready）
          //   必須在 LIFF 內、且 LIFF App 設定的 Channel 有對應 OA 才會 work
          liff
            .getFriendship()
            .then((friendship) => {
              if (!cancelled) setIsFriend(friendship.friendFlag);
            })
            .catch((e) => {
              console.warn("[liff getFriendship] failed:", e);
              // 失敗就放行（避免擋住正常用戶；LIFF Channel 設定問題時不要全站當機）
              if (!cancelled) setIsFriend(true);
            });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[liff init failed at step=${step}]`, err);

        // v254：iOS 在 liff_init 步驟爆 → 顯示專屬 fallback UI 取代紅色 banner
        //   原因：iOS LINE WebView + LIFF SDK 相容性問題，retry 經常救不回來。
        //   引導使用者重新從 LINE 開啟比卡在錯誤畫面好。
        const isIOS =
          typeof navigator !== "undefined" &&
          /iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isIOS && step === "liff_init") {
          setIosLiffInitFailed(true);
          setReady(true);
          return;
        }

        setError(`[${step}] ${msg}`);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMock]);

  const value = useMemo<LiffContextValue>(() => {
    return {
      ready,
      loggedIn,
      profile,
      idToken,
      isFriend,
      mode: isMock ? "mock" : "real",
      error,
      login: () => {
        if (isMock) return;
        // v351：即使 isLoggedIn=true 也強制重登 —— idToken 過期時 isLoggedIn 仍為 true，
        //   不重登就無法刷新 token（「重新登入」按鈕原本因 isLoggedIn 守衛而無效）。
        import("@line/liff").then((m) => {
          idTokenRef.current = null;
          m.default.login({ redirectUri: window.location.href });
        });
      },
      logout: () => {
        if (isMock) return;
        import("@line/liff").then((m) => {
          if (m.default.isLoggedIn()) m.default.logout();
          window.location.reload();
        });
      },
      fetchWithAuth: async <T,>(
        url: string,
        init?: RequestInit,
      ): Promise<T> => {
        const headers = new Headers(init?.headers);
        if (isMock) {
          // Mock 模式：跳過 Bearer header (假 token 過不了 JWKS 驗章)，
          // 改走後端 auth.ts 的 ?lineUserId= query fallback。
          // 每次 fetch 都重新讀 localStorage，支援使用者切身分後不需 reload
          const mockProfile = profile ?? getMockProfile();
          const u = new URL(url, window.location.origin);
          if (!u.searchParams.has("lineUserId")) {
            u.searchParams.set("lineUserId", mockProfile.userId);
          }
          url = u.pathname + u.search;
        } else {
          // 真實 LIFF：每次都重抓最新 idToken（avoid stale token after long form fill）
          // v243：用 ref 不用 state，避免在 fetch 熱路徑 setState 觸發 re-render 迴圈
          let token = idTokenRef.current;

          // 修 admin 401 race: 頁面 useEffect 比 LIFF init 早跑時，等最多 3 秒讓 LIFF ready
          // 直接 poll liff SDK 而不是 React state，避免閉包 stale issue
          const liffMod = await import("@line/liff");
          let waited = 0;
          let sawLoggedIn = false;
          while (waited < 3000) {
            try {
              const t = liffMod.default.getIDToken();
              if (t) {
                token = t;
                // v243：只更新 ref（不 setState），不讓 token 刷新引發 re-render 迴圈
                idTokenRef.current = t;
                break;
              }
              const loggedIn = liffMod.default.isLoggedIn?.();
              // getIDToken 返回 null 但 SDK 已 init
              if (loggedIn === false) break;             // 未登入，等下面 login()
              if (loggedIn === true) {
                // 已登入但 getIDToken 一直 null → 100% 是 LIFF Channel 缺 openid scope
                // 再寬限一下（init 中可能短暫 true 但 token 還沒 ready），> 500ms 就斷定
                sawLoggedIn = true;
                if (waited >= 500) break;
              }
            } catch {
              /* LIFF SDK 還沒 init，繼續等 */
            }
            await new Promise((r) => setTimeout(r, 100));
            waited += 100;
          }
          if (!token && sawLoggedIn) {
            // 已登入但永遠拿不到 idToken — Channel openid scope 沒勾
            throw new Error(
              "LIFF 設定錯誤：請至 LINE Developers Console 為此 LIFF Channel 勾選 openid scope（聯絡管理員）",
            );
          }
          if (token) {
            headers.set("authorization", `Bearer ${token}`);
          } else {
            // 沒有 idToken — 可能原因：
            // 1. 未登入 → liff.login() 跳轉 LINE OAuth
            // 2. 已登入但 LIFF Channel 沒勾 `openid` scope → 強制 logout 重來
            try {
              const liffMod = await import("@line/liff");
              const liff = liffMod.default;
              if (liff.isLoggedIn()) {
                // 已登入卻拿不到 idToken → scope 設定有問題，logout 重來
                try { liff.logout(); } catch { /* ignore */ }
              }
              liff.login({ redirectUri: window.location.href });
              throw new Error("LIFF login required, redirecting...");
            } catch (e) {
              if (e instanceof Error && e.message.includes("redirecting")) {
                throw e;
              }
              // login 也失敗（可能 LIFF Channel scope 完全缺）→ 拋出明確錯誤
              throw new Error(
                "LIFF 登入失敗：請確認 LIFF Channel 已勾選 openid + profile scope，或聯絡管理員",
              );
            }
          }
        }
        if (init?.body && !headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        const res = await fetch(url, { ...init, headers });
        if (!res.ok) {
          const text = await res.text();
          // v351：idToken 過期 → LINE getIDToken() 不會自動刷新，唯一辦法是重新登入。
          //   偵測到 401 + idToken/exp/session 過期，自動觸發 liff.login() 取得新 token。
          //   用 sessionStorage 時間戳防無限重導（60 秒內最多一次）。
          if (
            !isMock &&
            res.status === 401 &&
            /idToken|exp|session expired|過期/i.test(text)
          ) {
            try {
              const key = "liff_relogin_at";
              const last = Number(sessionStorage.getItem(key) ?? "0");
              if (Date.now() - last > 60000) {
                sessionStorage.setItem(key, String(Date.now()));
                idTokenRef.current = null; // 丟掉過期 token
                const liffMod = await import("@line/liff");
                liffMod.default.login({ redirectUri: window.location.href });
                throw new Error("LINE 登入已過期，正在重新登入…");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("重新登入")) throw e;
              /* sessionStorage 不可用等 → 落回原錯誤 */
            }
          }
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        return (await res.json()) as T;
      },
    };
    // v243：刻意不含 idToken — fetchWithAuth 改讀 idTokenRef，token 刷新不需重建 value，
    //   否則 [liff] 依賴的頁面會無限重抓造成 iPhone「一直閃載入」
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loggedIn, profile, isFriend, error, isMock]);

  return (
    <LiffContext.Provider value={value}>
      {iosLiffInitFailed ? <IosLiffFallback /> : children}
    </LiffContext.Provider>
  );
}

/**
 * v254：iOS LIFF init 失敗時的引導畫面（取代紅色 error banner）
 *
 * 為什麼需要：iOS LINE WebView + LIFF SDK 在「冷開」時有相容性問題，
 *   retry 通常救不回來。與其讓使用者看著錯誤訊息懷疑 app 壞了，不如清楚引導
 *   他「重新開啟」（多數情況下重新開一次就好了）。
 *
 * 你的資料完全沒影響——這只是 LINE 環境的初始化問題。
 */
function IosLiffFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--background)] px-6 py-10 text-center">
      <div
        className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: "rgba(6,199,85,0.12)" }}
      >
        <span className="text-3xl">🔄</span>
      </div>
      <h1 className="mb-2 text-xl font-bold text-[var(--foreground)]">
        LINE 環境啟動中⋯
      </h1>
      <p className="mb-6 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
        偵測到 LINE 內嵌瀏覽器初始化異常（iPhone 偶發狀況）。
        <br />
        請點下方按鈕重新載入，或從 LINE 重新打開預約 App。
        <br />
        <span className="text-[11px]">（您的訂單、會員資料完全不受影響）</span>
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex w-full max-w-xs items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white shadow-lg transition-transform active:scale-95"
        style={{ background: "#06C755" }}
      >
        🔄 重新載入
      </button>
      <p className="mt-5 max-w-sm text-[11px] leading-relaxed text-[var(--muted-foreground)]">
        如果按重新載入後仍然不行，請：
        <br />
        1. 完全關閉 LINE App（從多工把 LINE 滑掉）
        <br />
        2. 重新打開 LINE
        <br />
        3. 從 OA menu 重新進入預約 App
      </p>
    </div>
  );
}

export function useLiff(): LiffContextValue {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error("useLiff must be used inside <LiffProvider>");
  return ctx;
}
