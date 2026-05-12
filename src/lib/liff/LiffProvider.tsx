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

const MOCK_PROFILE: LiffProfile = {
  userId: "U_mock_dev_user_0001",
  displayName: "桌面測試員",
  pictureUrl: undefined,
};

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const isMock = process.env.NEXT_PUBLIC_LIFF_MOCK === "1";

  const [ready, setReady] = useState<boolean>(isMock);
  const [loggedIn, setLoggedIn] = useState<boolean>(isMock);
  const [profile, setProfile] = useState<LiffProfile | null>(
    isMock ? MOCK_PROFILE : null,
  );
  const [idToken, setIdToken] = useState<string | null>(
    isMock ? "mock-id-token" : null,
  );
  const [error, setError] = useState<string | null>(null);

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
          const u = new URL(url, window.location.origin);
          if (!u.searchParams.has("lineUserId")) {
            u.searchParams.set("lineUserId", MOCK_PROFILE.userId);
          }
          url = u.pathname + u.search;
        } else {
          // 真實 LIFF：每次都重抓最新 idToken（avoid stale token after long form fill）
          let token = idToken;
          try {
            const liffMod = await import("@line/liff");
            const fresh = liffMod.default.getIDToken();
            if (fresh) {
              token = fresh;
              if (fresh !== idToken) setIdToken(fresh);
            }
          } catch {
            /* fallback to cached idToken */
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
