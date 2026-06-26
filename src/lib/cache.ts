// v693：公開資料「版本號失效」快取
//
// 想法：把「大家都一樣、有人改才變」的資料(設定/場次/潛旅)放進「進程內記憶體快取」，
//   平時讀取直接回快取(零 DB);只有真的改到時才重查一次。
//
// 失效方式 = 版本計數器(每個 domain 一個整數)：
//   - 任何寫入經過 Prisma 時(見 src/lib/prisma.ts 的 $extends 蓋章)會把對應 domain 的版本 +1。
//   - 讀取時記下當下版本;下次讀若「版本沒變且未過 backstop」→ 直接回快取,不碰 DB。
//   - 版本一變 → 下個讀取自動重抓。等於「後台按儲存就更新」。
//
// 為何用記憶體 + 版本號(而非新增 DB 表)：部署用 `prisma db push`，不動 schema 最安全;
//   蓋章掛在 Prisma 層 → 所有寫入路徑(後台 CRUD/seed/bulk/下單/取消)都涵蓋，不會漏勾。
//
// ⚠️ 前提：單一 Node 實例(進程內計數器)。本專案在 Zeabur 單容器，符合。
//   日後若 scale 成多實例，需把版本號改放共用儲存(DB 一列 / Redis) — 讀寫介面不用大改。
//
// backstop TTL：安全網。萬一某寫入沒觸發 +1(例如未來改用 interactive $transaction)，
//   也會在 TTL 到期後自動重抓，不會永久髒資料。個人資料一律不走此快取(維持即時)。

export type CacheDomain = "config" | "trips" | "tours";

interface Entry { data: unknown; ver: number; exp: number }

// 放 globalThis：避免 dev hot-reload / 多次 import 造成多份狀態
const g = globalThis as unknown as {
  __hwzCacheVer?: Record<CacheDomain, number>;
  __hwzCacheStore?: Map<string, Entry>;
};
const versions: Record<CacheDomain, number> =
  g.__hwzCacheVer ?? (g.__hwzCacheVer = { config: 0, trips: 0, tours: 0 });
const store: Map<string, Entry> =
  g.__hwzCacheStore ?? (g.__hwzCacheStore = new Map());

/** 寫入時呼叫：把該 domain 版本 +1 → 相關快取下次讀取自動失效重抓。 */
export function bumpVersion(domain: CacheDomain): void {
  versions[domain] = (versions[domain] ?? 0) + 1;
}

/**
 * 帶版本號的記憶體快取。
 * @param key       快取鍵(同 domain 下可多鍵，如 trips:from|to、trip:<id>)
 * @param domain    版本歸屬;該 domain 一被 bump，所有此 domain 的鍵都視為過期
 * @param backstopMs 安全網存活時間(毫秒);即使版本沒變，超過也會重抓
 * @param load      真正打 DB 的函式;只有「未命中 / 版本變了 / 過 backstop」才會跑
 */
export async function cached<T>(
  key: string,
  domain: CacheDomain,
  backstopMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const cur = versions[domain] ?? 0;
  const hit = store.get(key);
  if (hit && hit.ver === cur && hit.exp > Date.now()) {
    return hit.data as T; // 命中：零 DB
  }
  const data = await load();
  store.set(key, { data, ver: cur, exp: Date.now() + backstopMs });
  return data;
}

// 常用 backstop（毫秒）
export const TTL_CONFIG = 6 * 60 * 60 * 1000; // 設定/政策/裝備價：6 小時安全網
export const TTL_LISTING = 10 * 60 * 1000; //    場次/潛旅：10 分鐘安全網
