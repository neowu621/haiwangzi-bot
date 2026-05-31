"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  // Mock 模式預設視為已加好友（dev 用）；真實模式從 null 開始等 getFriendship
  const [isFriend, setIsFriend] = useState<boolean | null>(isMock ? true : null);
  const [error, setError] = useState<string | null>(null);

  // mock 模式：載入時讀 localStorage 設 profile（避免 SSR mismatch）
  useEffect(() => {
    if (isMock) setProfile(getMockProfile());
  }, [isMock]);

  useEffect(() => {
    if (isMock) return;
    let cancelled = false;
    (async () => {
      try {
        const cfgRes = await fetch("/api/config");
        const cfg = await cfgRes.json();
        if (!cfg.liffId) {
          setError("LIFF ID 未設定 (LINE_LIFF_ID env var)");
          setReady(true);
          return;
        }
        const liffMod = await import("@line/liff");
        const liff = liffMod.default;
        await liff.init({ liffId: cfg.liffId });
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
          setIdToken(liff.getIDToken());
          // 查 LINE OA 好友狀態（必須在 LIFF 內、且 LIFF App 設定的 Channel 有對應 OA 才會 work）
          try {
            const friendship = await liff.getFriendship();
            if (!cancelled) setIsFriend(friendship.friendFlag);
          } catch (e) {
            console.warn("[liff getFriendship] failed:", e);
            // 失敗就放行（避免擋住正常用戶；LIFF Channel 設定問題時不要全站當機）
            if (!cancelled) setIsFriend(true);
          }
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
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
        import("@line/liff").then((m) => {
          if (!m.default.isLoggedIn())
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
          let token = idToken;

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
                if (t !== idToken) setIdToken(t);
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
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        return (await res.json()) as T;
      },
    };
  }, [ready, loggedIn, profile, idToken, isFriend, error, isMock]);

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}

export function useLiff(): LiffContextValue {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error("useLiff must be used inside <LiffProvider>");
  return ctx;
}
