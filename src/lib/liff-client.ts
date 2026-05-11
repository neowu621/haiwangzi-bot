"use client";
import liff from "@line/liff";

let _initPromise: Promise<typeof liff> | null = null;
let _config: { liffId: string; bank: { name: string; branch: string; account: string; holder: string } } | null = null;

/** 從 /api/config 抓 runtime 設定 */
export async function getConfig() {
  if (_config) return _config;
  const res = await fetch("/api/config");
  _config = await res.json();
  return _config!;
}

/** Init LIFF (從 /api/config 抓 liffId) */
export function initLiff(): Promise<typeof liff> {
  if (_initPromise) return _initPromise;
  _initPromise = getConfig()
    .then((cfg) => {
      if (!cfg.liffId) throw new Error("LIFF ID not configured on server");
      return liff.init({ liffId: cfg.liffId });
    })
    .then(() => liff)
    .catch((err) => {
      _initPromise = null;
      throw err;
    });
  return _initPromise;
}

/** 取 idToken,給 fetch API 用 */
export async function getIdToken(): Promise<string> {
  await initLiff();
  if (!liff.isLoggedIn()) {
    liff.login();
    throw new Error("redirecting to login");
  }
  const token = liff.getIDToken();
  if (!token) throw new Error("no idToken");
  return token;
}

/** 帶 idToken 的 fetch wrapper */
export async function liffFetch<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const idToken = await getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}
