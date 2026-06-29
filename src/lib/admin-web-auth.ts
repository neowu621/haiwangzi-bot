"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "admin_web_token";
const USER_KEY = "admin_web_user";

export interface AdminWebUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  effectiveRoles: string[];
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAdminUser(): AdminWebUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminWebUser) : null;
  } catch {
    return null;
  }
}

export function setAdminUser(user: AdminWebUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  // v399：GET 去重 — 同一 path 同時只發一支（連點/快速切頁不疊請求）
  if (method === "GET" && !init?.body) {
    const ex = getInflight.get(path);
    if (ex) return ex as Promise<T>;
    const p = rawAdminFetch<T>(path, init).finally(() => {
      if (getInflight.get(path) === p) getInflight.delete(path);
    });
    getInflight.set(path, p as Promise<unknown>);
    return p;
  }
  return rawAdminFetch<T>(path, init);
}

const getInflight = new Map<string, Promise<unknown>>();

async function rawAdminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // v465：逾時 / 連線層錯誤自動重試一次（用全新連線）。
  //   現象：部署後按 F5，瀏覽器沿用「半死的 keep-alive 舊連線」→ 請求卡住到逾時 →「連線逾時」，
  //   而 Ctrl+F5 因重開連線就正常。自動重試 = 把 Ctrl+F5 的效果自動化，使用者不用手動硬重整。
  //   只對「沒帶外部 signal、且非寫入帶 body」的請求重試，避免重送造成重複副作用。
  const canRetry = !init?.signal && !init?.body;
  try {
    return await attemptAdminFetch<T>(path, init, 12_000);
  } catch (e) {
    // v731：用 name 判斷 AbortError，不限 DOMException 實例 —— LINE WebView 內 abort
    //   有時不是 DOMException，會漏接導致原始訊息「signal is aborted without reason」外洩。
    const isAbort = e instanceof Error && e.name === "AbortError";
    const transient =
      isAbort ||
      (e instanceof TypeError); // 網路層錯誤（連線重置 / DNS / fetch failed）
    if (canRetry && transient) {
      // 全新連線再試一次，逾時放寬到 25 秒
      return await attemptAdminFetch<T>(path, init, 25_000);
    }
    if (isAbort) {
      throw new Error("連線逾時，請重試（網路較慢或伺服器較遠）");
    }
    throw e;
  }
}

async function attemptAdminFetch<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
  const token = getAdminToken();
  // v400：請求逾時 — 卡住的請求自動中止，釋放連線、顯示錯誤而非無限轉圈
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      ...init,
      // v465：後台資料一律走全新請求，不沿用 HTTP 快取（避免 F5 拿到過期/半死連線的快取狀態）
      cache: "no-store",
      signal: init?.signal ?? ac.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      // v424：401（token 過期/失效）→ 清掉 token 並導回登入頁，避免停在「session expired」死路
      if (res.status === 401 && typeof window !== "undefined") {
        clearAdminToken();
        if (!window.location.pathname.startsWith("/admin/login")) {
          window.location.href = "/admin/login";
        }
      }
      // 用 || 而非 ??：空字串也要 fallback 到 HTTP status，避免 "場次載入失敗：" 後面空白
      throw new Error(err.error || err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function useAdminAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [adminUser, setAdminUserState] = useState<AdminWebUser | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setAdminUserState(getAdminUser());
    setReady(true);
  }, [router]);

  function logout() {
    clearAdminToken();
    router.replace("/admin/login");
  }

  return { ready, logout, adminUser };
}
