<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 行動裝置前端鐵則（必讀）

> 任何「會在手機上使用」的前端規劃與實作，**一律**要把以下納入考量：
> **檔案大小、讀取次數、流量、載入時間** —— 因為手機網路/效能有限，過大或過多請求會變慢、影響使用者體驗（尤其 LINE 內建 WebView 更慢）。
>
> 具體要求：圖片壓縮成 WebP、按需/延遲載入（lazy / facade）、避免一次載入過多資料、減少 API 往返次數、首屏只載必要內容、不要讓「內容可見」綁在慢資源（JS hydration / 外部字體）上。

# 資料讀取分層 / 快取鐵則（必讀）

> 新增「會讀資料庫的讀取端」(API route / 頁面) 時，**一律先問這份資料屬於哪一層**，別預設「每次都即時查 DB」——手機/LINE WebView 慢，重複查共享資料是主要延遲與尖峰壓力來源。
>
> **四層 + 對應策略：**
> 1. **全域純靜態**（課程/潛點/評價/FAQ 等行銷內容）→ 放程式常數(`src/app/_home/data.tsx`)，**零 DB**。
> 2. **共享、偶爾變**（營業設定/政策/裝備價/VIP 級距/抵用金規則 = `siteConfig`）→ **版本號失效快取**，平時零 DB，後台存檔才更新。用 `getSiteConfigRow()`（`src/lib/site-config-cache.ts`）。
> 3. **共享、會因預約變動**（場次/潛旅清單 + 空位）→ **版本號失效快取**，後台改 or 有人下單/取消 → 自動失效。用 `cached(key, domain, backstopMs, load)`（`src/lib/cache.ts`）。
> 4. **個人資料**（`/api/me`、`/api/bookings/my`、`/api/me/notifications`、`/api/me/contact`、`/api/me/credits`）→ **一律即時、不快取**（前端 `cache:"no-store"`）。
>
> **機制（v693 起）**：失效靠「版本號」——`src/lib/prisma.ts` 用 `$extends` 在 Prisma 層「集中蓋章」，任何寫入(`divingTrip`/`tourPackage`/`booking`/`siteConfig`)自動 `bumpVersion(domain)`；讀取端 `cached()` 比對版本，沒變且未過 backstop TTL 就回快取(零 DB)。**新增會改到這些資料的寫入路徑時不必手動清快取**（只要經 Prisma 就自動涵蓋）；新增「共享資料的讀取端」時，**記得包 `cached()` 或既有 getter**，別直接裸打 `prisma`。
>
> **前提/注意**：版本號目前放**記憶體 → 限單一容器**(Zeabur 單實例)。若日後 scale 成多實例，把版本號改放共用儲存(DB 一列 / Redis)，`cache.ts` 讀寫介面不變。backstop TTL 是安全網不可省。**個人資料永遠不要進這套快取。**
