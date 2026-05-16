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
          while (waited < 3000) {
            try {
              const t = liffMod.default.getIDToken();
              if (t) {
                token = t;
                if (t !== idToken) setIdToken(t);
                break;
              }
              // getIDToken 返回 null 但不丟錯 → LIFF 已 init 但沒登入，跳出
              if (liffMod.default.isLoggedIn?.() === false) break;
            } catch {
              /* LIFF SDK 還沒 init，繼續等 */
            }
            await new Promise((r) => setTimeout(r, 100));
            waited += 100;
          }
          if (token) {
            headers.set("authorization", `Bearer ${token}`);
          } else {
            // 沒有 idToken — 觸發 LIFF login (使用者會被導到 LINE 授權頁)
            try {
              const liffMod = await import("@line/liff");
              const liff = liffMod.default;
              if (!liff.isLoggedIn()) {
                liff.login({ redirectUri: window.location.href });
                throw new Error("LIFF login required, redirecting...");
              }
            } catch (e) {
              if (e instanceof Error && e.message.includes("redirecting")) {
                throw e;
              }
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
  }, [ready, loggedIn, profile, idToken, error, isMock]);

  return <LiffContext.Provider value={value}>{children}</LiffContext.Provider>;
}

export function useLiff(): LiffContextValue {
  const ctx = useContext(LiffContext);
  if (!ctx) throw new Error("useLiff must be used inside <LiffProvider>");
  return ctx;
}
