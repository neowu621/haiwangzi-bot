# 開發進度日誌（PROGRESS）

> 給「下次接手的人 / AI」看的。最新在最上面。每則記：完成什麼、改了哪些重要檔案、做了哪些決策、卡在哪、下次先看什麼。
> 版本規則 `YYYYMMDD_NN`（`src/lib/version.ts`，每次 push 必 bump）。部署 = push 到 `master` → Zeabur 自動部署 → 驗 `curl https://haiwangzi.xyz/api/healthz`。

---

## 2026-06-19

### 完成
- **訪客分析**：後台總覽訪客卡新增「近 24 小時」每小時活動圖（v584 長條 → v585 平滑曲線 → v586 移到卡片上排填滿空白）。
- **後台操作說明更新**（v587）：`/admin/guide` 新增「頁面架構總覽」（前台/後台 × 桌機/手機 + 裝置分流）與「新功能補充」章節。
- **官網連結強化**（v588）：共用 footer 永遠帶官網（沒設定 fallback 到 `NEXT_PUBLIC_BASE_URL`）→ 每封 Email + 每則 LINE 文字訊息都帶官網；歡迎 Flex 加「認識我們·官方網站」按鈕。
- **文件整理**（本次）：更新 `README.md`（用途/功能/環境變數/已知問題/下一步）、新建本檔。

### 改了哪些重要檔案
- `prisma/schema.prisma` + `scripts/migrate-safety.js`：新增 `hourly_stats` 表（每小時訪客）。
- `src/components/VisitCounter.tsx` / `src/app/api/track/visit/route.ts`：beacon 加 per-hour 旗標、upsert 每小時桶。
- `src/app/api/admin/stats/visits/route.ts`：回傳近 24 小時 `hours[]` + `last24`。
- `src/app/admin/page.tsx`：訪客卡 24 小時曲線（SVG area+line，Catmull-Rom 平滑）。
- `src/app/admin/guide/page.tsx`：操作說明新增架構 + 新功能章節。
- `src/lib/social-footer.ts`：官網 fallback。
- `src/lib/flex/welcome.ts`：歡迎卡加官網按鈕。

### 決策
- 24 小時用「每小時瀏覽量」畫曲線（不做每小時 unique，太複雜）；資料從 v584 上線才開始累積。
- 官網連結覆蓋策略：Email + LINE 文字 + 歡迎卡（不對「純 Flex 卡」自動加 footer，避免每張卡後面多一條，屬刻意保留）。

### 卡在哪
- Google 尚未收錄 `haiwangzi.xyz`（新站排程延遲，非 bug，已驗證可被 Googlebot 抓取）。每日排程 `haiwangzi-index-check` 追蹤中。

### 下次先看什麼
- 訪客資料流：`VisitCounter.tsx` → `/api/track/visit` → `daily_stats` / `hourly_stats` → `/api/admin/stats/visits` → `/admin/page.tsx`。
- 任何 schema 變更**必經** `scripts/migrate-safety.js`（`prisma db push` 不可靠）。

---

## 2026-06-18

### 完成
- **手機後台**（v576）：8 區塊全部改手機版設計 `/admin/m/*`（老闆結帳/訂單/願望單/客服信箱/日潛/會員/潛旅/抵用金）+ 返回首頁列。
- **自建訪客計數器**（v577 建表 + 首頁、v578 桌機顯示、v579 GA 連結、v581 左右兩塊）。
- **GA4 深入分析嵌進後台**（v580）：OAuth refresh token（繞過服務帳戶金鑰組織政策）→ `/admin/analytics` 看訪客趨勢/熱門頁/來源/裝置。
- **保險提醒**（v582）：下訂後 5 個位置引導加保個人海域險（富邦第 1 類）。
- **官網外部連結欄位**（v583）：系統設定新增「官方網站」，自動附 Email/LINE footer。

### 改了哪些重要檔案
- `src/app/admin/m/*`（6 新頁）、`src/components/admin-web/MobileAdminShell.tsx`（title/back）。
- `src/lib/google-analytics.ts`（GA OAuth + Data API）、`src/app/api/admin/ga/*`、`prisma` 新增 `daily_stats` / `google_oauth`。
- `src/lib/insurance.ts` + `src/components/InsuranceNotice.tsx`（保險文案/元件，集中一處）。
- `src/lib/social-footer.ts` / `src/app/admin/settings/page.tsx` / `src/app/api/admin/site-config/route.ts`（官網欄位，Zod 白名單要同步加）。

### 決策
- GA 用 OAuth（DB 存 refresh token）而非服務帳戶金鑰（被組織政策 `iam.disableServiceAccountKeyCreation` 鎖）。
- 保險文案保守：「建議自行投保 + 詳細依保險條款請洽富邦」，不細述條款（避免客訴）。

### 卡點 / 待辦（老闆端）
- Google Search Console 已驗證 + 提交 sitemap；商家檔案已建。等收錄。
- GA `/admin/analytics` 需老闆按一次「連接」授權（已完成，資源 ID `541485375`）。

---

## 更早

完整歷程見 git log（`git log --oneline`）。版本由 `20260513_03` 起，重大里程碑：客服信箱 + LINE 整合、通訊紀錄、會員排序/VIP 篩選、Dump 一週場次、Turnstile/contact 修復等。
