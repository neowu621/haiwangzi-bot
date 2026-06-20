# 開發進度日誌（PROGRESS）

> 給「下次接手的人 / AI」看的。最新在最上面。每則記：完成什麼、改了哪些重要檔案、做了哪些決策、卡在哪、下次先看什麼。
> 版本規則 `YYYYMMDD_NN`（`src/lib/version.ts`，每次 push 必 bump）。部署 = push 到 `master` → Zeabur 自動部署 → 驗 `curl https://haiwangzi.xyz/api/healthz`。

---

## 2026-06-20 — 訂單取消自動退還抵用金（v603）+ 雜項（v601 Email、v602 日曆）

### v603：取消退還抵用金（重點）
- **問題**：抵用金在下單當下就被 `spendCreditFIFO` 扣掉（＝預付），但所有取消路徑都沒退 → 用了又取消＝蒸發。
- **解法**：新增 `lib/refund-booking-credit.ts` → `refundBookingCredit(bookingId)`，退還 `booking.creditUsed`。
  - 冪等鍵：`reason=refund + refType=booking_cancel + refId`（同訂單只退一次）。
  - 與 admin 手動退款 route（`refType=booking`）**分流不重複**。退還永不過期（`expiresAt=null`）。
- **接入**：客戶自取消 `DELETE /api/bookings/[id]`、admin `admin/bookings/[id]`（DELETE 軟取消 + PATCH 改取消狀態）、`cancel-all`、`coach/trips/weather-cancel`。各回應加 `creditRefunded`。
- **待辦/可選**：取消通知文案可加一句「已退還抵用金 NT$X」；promo `usedCount` 取消時尚未回沖（次要）。

### v601 / v602（雜項）
- v601：`composeEmail` 按鈕一律導小編 LINE OA；寄信 provider 由 zsend(SES) 改 **gmail**（DB `emailProvider`，已改線上）→ 連結不再被 `awstrack.me` 包裝。
- v602：`liff/calendar` 日曆改**週一起始**。

---

## 2026-06-19（續3）— 節慶優惠 Phase 2 完成（2a + 2b）

### 完成（v592 後端 / v593 前端 / v594 推廣）
- **2a 後端**：下單套代碼(取其優+可疊抵用金)、早鳥結案發放(30天)、抵用金「先用最近到期」FIFO + 到期作廢、promo validate/active API。
- **2a 前端**：LIFF + `/pclogin` 下單加優惠代碼輸入;`/pclogin` 加「通知」頁籤(與手機同模式);Dump 加優惠代碼下拉;移除 `/dtest`。
- **2b**：發送精靈(`/admin/promo-codes` + `/api/admin/promo/send`,對象 全部/VIP5/有Email/活躍 × 管道 LINE/Email/內部,**預覽人數→確認才送**);進入彈窗 `components/PromoPopup`(LIFF welcome + `/pclogin`,今日不再顯示)。

### 改了哪些重要檔案
- `lib/credit-fifo.ts`(FIFO)、`lib/early-bird.ts`(結案發放)、`lib/promo.ts`(驗證/折扣/早鳥)。
- `api/bookings/daily`(套代碼+早鳥+FIFO)、`api/me`(讀餘額先清過期)、`coach/.../attendance`(掛早鳥)。
- `api/promo/validate|active`、`api/admin/promo/send`。
- `liff/dive/trip/[tripId]`、`pclogin/PcLoginApp`(代碼+通知+彈窗)、`admin/trips`(Dump)、`admin/promo-codes`(發送精靈)、`liff/welcome`(彈窗)。

### 卡在哪 / 下次先看什麼
- 抵用金 FIFO 是新模型(CreditTx.consumedAmount);退款/取消目前用 grantCredit(+) 還原成新 lot — 若要更精準的「還原到原 lot」之後可加強。
- 早鳥/代碼的 tour(潛旅)端尚未接(目前只日潛 daily);潛旅下單要套代碼需在 `/api/bookings/tour` 比照 daily 加。
- 驗收路徑:後台「🎏 節慶優惠」建公開檔 → LIFF/`/pclogin` 下單輸入該碼 → 看折扣;早鳥需設級距 + 到場完成才發。

---

## 2026-06-19（續2）— 桌面會員登入入口改名

### 完成（v591）
- **桌面會員登入/下單入口 `/dtest` → `/pclogin`**（官網「會員登入」鈕、LINE Login next、法務頁返回、robots 全部更新）。
- 舊網址 `/dtest` 保留為 301 轉址(書籤不失效)。元件 `DtestApp` → `PcLoginApp`。
- 補充:**桌面確實能下單** —— 官網「會員登入」→ `/pclogin`(瀏覽器 LINE Login)→ 下單 → `/pay`。和手機 LIFF 同會員、同後端(`/api/bookings/daily`)。Phase 2 優惠代碼/早鳥提示/彈窗要 **LIFF + /pclogin 兩邊都加**。

---

## 2026-06-19（續）— 節慶優惠 Phase 1（後台）

### 完成（v590）
- **節慶優惠代碼系統 Phase 1（後台管理）**:可建檔期、自動產 7 碼、設早鳥回饋。客戶端套用 = Phase 2。
- 規格(與老闆討論定案):全部走代碼(無自動套用)、公開/私密、兩種折扣(每支氣瓶 NT$ / 訂單 %)、期間/適用/限制(每人/總量/滿額/客群)、疊加「取其優 + 可疊抵用金」。
- 日潛早鳥回饋:提早預約 + 滿額(預設 1000,後台可設)→ **訂單結案後(完成、無退款)** 送抵用金,越早越多(級距後台設)。

### 改了哪些重要檔案
- `prisma/schema.prisma` + `scripts/migrate-safety.js`:`promo_codes` 表 + SiteConfig 早鳥欄位 + Booking(promo_code/promo_discount/early_bird_credit/early_bird_granted)。
- `src/lib/promo.ts`(新):`genUniquePromoCode`(7碼排除易混淆字)、`validatePromoCode`、`computeCodeDiscount`、`earlyBirdCredit`。
- `src/app/api/admin/promo/route.ts` + `[id]`:CRUD + `?gen=1` 產碼。
- `src/app/api/admin/site-config/route.ts`:早鳥欄位 Zod + 讀寫。
- `src/app/admin/promo-codes/page.tsx`(新):管理頁(早鳥設定 + 代碼列表 + 分區表單)。**注意:`/admin/promotion` 是海報產生器,沒覆蓋**,新頁走 `/admin/promo-codes`。
- `src/components/admin-web/AdminShell.tsx`:側欄「行銷/通知」加「🎏 節慶優惠」。

### 卡在哪 / 下一步（Phase 2）
- **下單套用**:`/api/bookings/daily` 套代碼折扣(取其優+可疊抵用金)+ 記錄;LIFF 預約頁加代碼輸入框 + 可用提示。
- **早鳥發放**:訂單結案(完成/無退款)時把 `early_bird_credit` 入帳(改 creditBalance + CreditTx),取消/退款不發。
- **發送精靈**(LINE/Email/內部 + 預覽人數 + 確認)+ **會員進入彈窗**。
- 既有「每支 25 元」tankPromo → 之後可遷成一筆公開代碼檔。

### 下次先看什麼
- `src/lib/promo.ts`(所有折扣/早鳥邏輯集中在此)→ 接 `/api/bookings/daily` 的價格計算(現有 `getActiveTankPromo` 附近)。

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
