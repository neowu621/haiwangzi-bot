"use client";
// v399：後台前端資料層 — 快取（stale-while-revalidate）+ 同請求去重 + 變更失效。
//   目的：高延遲環境下，切頁秒開、連點不塞車、用久不累積請求。
//   只快取 GET（清單）；任何 POST/PATCH/DELETE 後請呼叫 invalidateAdminCache() 讓下次抓到最新。
import { useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin-web-auth";

type CacheEntry = { data: unknown; ts: number };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL = 10_000; // 10 秒內視為新鮮，不重抓

export function getCached<T>(url: string): T | undefined {
  return cache.get(url)?.data as T | undefined;
}

export function setCached(url: string, data: unknown) {
  cache.set(url, { data, ts: Date.now() });
}

/** 變更後失效：傳前綴（例 "/api/admin/bookings"）會清掉所有以它開頭的快取；不傳則全清。 */
export function invalidateAdminCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/**
 * 取資料：
 *  - 同一 url 同時只發一支（去重）→ 連點不疊請求
 *  - ttl 內有快取且非 force → 直接回快取（不打網路）
 *  - 否則打 adminFetch，成功後寫快取
 */
export function cachedFetch<T>(
  url: string,
  opts?: { ttl?: number; force?: boolean },
): Promise<T> {
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>; // 去重：共用進行中的請求

  if (!opts?.force) {
    const c = cache.get(url);
    if (c && Date.now() - c.ts < ttl) return Promise.resolve(c.data as T);
  }

  const p = adminFetch<T>(url)
    .then((d) => {
      setCached(url, d);
      return d;
    })
    .finally(() => {
      if (inflight.get(url) === p) inflight.delete(url);
    });
  inflight.set(url, p as Promise<unknown>);
  return p;
}

export interface CachedResult<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  /** 強制重抓（忽略 ttl）並更新快取 */
  refetch: () => void;
}

/**
 * SWR hook：先秀上次的資料（0 秒），背景再更新。
 *  - url 傳 null → 不抓（用於尚未準備好的情況）
 *  - 切頁時忽略未回的結果（不 setState 報錯）；去重讓連點/快速切頁不累積請求
 */
export function useCachedFetch<T>(
  url: string | null,
  opts?: { ttl?: number },
): CachedResult<T> {
  const [data, setData] = useState<T | undefined>(() =>
    url ? getCached<T>(url) : undefined,
  );
  const [loading, setLoading] = useState<boolean>(() =>
    url ? getCached<T>(url) === undefined : false,
  );
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    if (!url) {
      setLoading(false);
      return () => {
        aliveRef.current = false;
      };
    }
    const stale = getCached<T>(url);
    if (stale !== undefined) {
      setData(stale);
      setLoading(false); // 有舊資料 → 不轉圈，直接顯示
    } else {
      setLoading(true);
    }
    setError(null);

    // 永遠在掛載時背景重新驗證（顯示舊資料→1秒後自動換最新），確保變更後不會卡舊資料
    cachedFetch<T>(url, { force: true })
      .then((d) => {
        if (!aliveRef.current) return;
        setData(d);
        setLoading(false);
        setError(null);
      })
      .catch((e) => {
        if (!aliveRef.current) return;
        setError(e instanceof Error ? e.message : "載入失敗");
        setLoading(false);
      });

    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce]);

  return {
    data,
    loading,
    error,
    refetch: () => {
      if (url) invalidateAdminCache(url);
      setNonce((n) => n + 1);
    },
  };
}
