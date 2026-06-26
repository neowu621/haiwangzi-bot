# 開發進度日誌（PROGRESS）

> 給「下次接手的人 / AI」看的。最新在最上面。每則記：完成什麼、改了哪些重要檔案、做了哪些決策、卡在哪、下次先看什麼。
> 版本規則 `YYYYMMDD_NN`（`src/lib/version.ts`，每次 push 必 bump）。部署 = push 到 `master` → Zeabur 自動部署 → 驗 `curl https://haiwangzi.xyz/api/healthz`。

---

## 2026-06-26 — 到場點名 + 角色化後台 + 手機/桌機區隔 + /pclogin 強化（v671→v683）

目前線上 = **v20260626_683**。

### 到場點名 + 後台角色（v677/678/679/683，重點）
- **教練/助教可登入後台**：`/api/admin-web/auth` + `set-password` 的 `BACKEND_LOGIN_ROLES = [admin,boss,it,coach,assistant]`。`AdminShell` NAV_GROUPS 每組加 `roles` 白名單 → **教練/助教只看「到場點名」**，其餘群組限 admin/boss/it。我的最愛(favItems)也要依 `visibleHrefs` 過濾。教練/助教登入後 `/admin` 與 `/admin/m` 都 redirect 到到場點名。
- **到場點名頁**：桌機 `/admin/attendance`、手機 `/admin/m/attendance`（兩套，手機不跑桌機）。API `GET /api/admin/attendance/today`（requireRole coach/assistant/boss/admin，回今日場次/潛旅 confirmed/completed/no_show 名單）；點名走既有 `POST /api/coach/bookings/[id]/attendance`。到場點名也放進「營運/分析」給 admin/boss/it。
- **v683 修助教 403**：`/api/coach/*`（today/media/trip-photos/weather-cancel）原本只 `coach|...`，補上 `assistant`。**款項類 `/api/coach/payment-proofs` 維持只給老闆/admin**（教練助教不碰款項）。見 [[admin-roles-attendance]]。

### 手機後台不導桌機（v676/679/680，鐵則）
- 移除 `MobileAdminShell` 頂部「完整版」+ 各頁所有導向桌機 `/admin/*`(非 `/admin/m`)的連結。卡片 drill-in（訂單/會員/訪客）改純顯示 `div`。驗證 `grep href="/admin/` 非 m 為空。見 [[mobile-no-desktop-bounce]]。

### /admin/m 速度（v675/676）
- 會員查詢/抵用金「搜尋才查」（後端 `/api/admin/users?q=` 限 60；移除 VIP 篩選）。潛旅名單/老闆結帳 `/api/admin/bookings?light=1`（跳過簽名 presigned URL/狀態log/退款）。潛旅名單英文狀態→`deriveBookingDisplay` 中文 + 已付/未付。pg_trgm 索引（v677）。

### 老闆結帳精簡（v675/681/682）
- 加「🧾 已下單·待匯款」。移除「待到場確認」（改用到場點名）。訂單管理 `/admin/bookings` 預設 `filterTripPeriod=future`（只看活動未開始）。

### /pclogin（v671/672/674）
- 加「📨 線上洽詢/揪團」分頁（搬自 /contact，登入會員免填身分/免 Turnstile，`/api/contact` 加會員快速通道）。我的訂單 旅潛拆「已付訂金/尾款(截止日)」（LIFF v673 同步）。通知頁改兩欄（左通知/右客服對話）。見 [[pclogin-notes-pay]]。

### 注意
- 版本日期 2026-06-26 起 NN 接續累計（v676 起 date=20260626）。所有版本 tsc 0、build 通過、healthz 已驗。

---

## 2026-06-25 — 訂金通知模板 + 活動提醒落地 + 老闆結帳/通知體驗（v665→v670）

目前線上 = **v20260625_670**。（v622–v664 為先前 session，細節見 `git log`；本段只記本 session。）

### 訊息模板（v665）
- 新增可編輯模板 **`deposit_pending`「老闆訂金[確認中]」**（內部、發老闆）。客戶上傳**訂金**證明時，老闆收到 ① 站內通知 ② LINE Flex（客戶/團名/金額/後5碼/方式 + 「前往核對」深連結 `/verify-proof/<id>`）。可在訊息模板頁編輯標題/按鈕/試送。
  - 新增 `src/lib/flex/deposit-pending.ts`；註冊 6 處：`flex/index.ts`(import/FLEX_TEMPLATES/LABELS/META)、`message-content.ts`(MSG_EDITABLE_FIELDS/HERO_EMOJI/MSG_SAMPLE_PARAMS/buildDynamicBody)、`admin/templates/page.tsx`(TRIGGER_TIMING/SCOPE_TAGS)。
  - wiring：`api/bookings/[id]/payment-proofs/route.ts` 的 deposit 分支改用此模板（站內標題讀 override；LINE 改推 Flex）。尾款/退款維持原文字推播。
- `deposit_confirm` 顯示名 →「老闆訂金[已確認]」（只改 label，客戶看到的是內容不是模板名）。

### 活動提醒（activityNote）落地到客戶端（v666）
- 來源：`DivingTrip.activityNote` / `TourPackage.activityNote`（v664 已加，場次/團層級、客戶可見）。
- LIFF：我的預約卡（`liff/my/page.tsx`）+ 日潛下單頁（`liff/dive/trip/[tripId]`）+ 潛旅下單頁（`liff/tour/[packageId]`）顯示綠色 `📣 活動提醒`。detail API（`api/trips/[id]`、`api/tours/[id]`）本就 `...spread` 全欄，不用改後端。
- 預約確認訊息（v667）：`booking_confirm` 動態主體加 `📣 活動提醒` + `📝 您的備註`。

### 桌機 /pclogin 體驗（v666/668/669）
- nav 數量徽章：我的訂單=進行中、通知=未讀（`/api/me` 新增 `stats.unreadNotifications`，30 天視窗 count）。
- 通知篩選加「近一周」並設**預設**。
- 潛旅目的地 enum 補中文 `destZh`（原本桌機印 lanyu/green_island…英文）。
- **登入未讀彈窗**（v668）：`UnreadPopupPc`，每 session 一次、3 秒自動關，對齊 LIFF。
- **客服對話分頁**（v669）：`/api/me/contact` GET 加 `before` 游標、預設 30 則；前端固定高度捲動框 + 自動到最新 + 載入更早。

### 老闆結帳 /admin/tonight（v667）
- 新增 **🧾 已下單·待匯款** 區（status=pending 未上傳證明）。
- 待確認匯款卡片重排：出團日期時間移頂、付款方式備註+上傳時間/電話移右側。

### 訊息模板頁版面（v670）
- 左欄 256→300px + 名稱自動換行（不再 `…` 截斷）。

### 決策 / 注意
- **「L8ne pay 轉帳」非系統錯字**：是客戶在付款備註 `note` 手打的自由文字（Line→L8ne），程式不可改；要改只能改該筆 DB（訂單 `020260623-4N`，老闆尚未決定）。
- 雙向客服對話只在桌機 /pclogin；手機客戶走 LINE。
- 所有版本 tsc 0 error、`/api/healthz` 已驗到對應版本。

---

## 2026-06-21（續）— 付款核對獨立頁 + 老闆結帳補資訊 + 修付款重複 BUG（v618→v621）

目前線上 = **v20260619_621**。

### 付款核對流程（v619/620）
- **問題**：付款證明通知「前往查看」連到整頁列表（/admin/bookings），LIFF 內還要再登入後台、沒聚焦那一筆。
- **v619 獨立核對頁**：通知深連結 `/verify-proof/<proofId>` → 中轉頁依環境導 **手機 LIFF `/liff/coach/verify`**（LINE 登入）或 **瀏覽器 `/admin/verify`**（後台登入）。共用元件 `components/PaymentVerifyView`（圖+確認入帳/退回，退回需填原因並通知客戶）。GET 單筆 `/api/admin/payment-proofs/[id]` 統一驗證（admin/boss）。**點通知不自動確認**。
- **v620 補資訊**：核對頁 + 老闆結帳（`/admin/tonight`、`/admin/m/tonight`）補 出團日期/潛點/**該場次目前已參加人數(X/容量)**、客戶備註 notes、管理備註 adminNotes。列表 API 批次抓場次 + groupBy 算已參加，避免 N+1。

### 修付款上傳重複證明 BUG（v621，重點）
- **根因**：LINE WebView 慢，React 按鈕 disable 來不及生效，客戶連點「送出」→ 多次 submit() 同時觸發 → 產生多筆相同付款證明（同一筆款被記多次，非重複付款）。
- **修正（雙保險）**：①前端 submit() 加**同步防重入鎖**（`submittingRef` useRef，第一個 await 前上鎖）+ uploaded 也擋；②後端 payment-proofs POST **去重**（5 分鐘內相同 訂單+類型+金額+後5碼 未審核 → 回既有那筆、不新建/通知）。
- 順手：訂單資訊補「N 支氣瓶・M 人・📍地點」；上傳按鈕加大加色。
- 既有重複髒資料用後台靜默刪除（coach reject = delete，不通知客戶）清掉多餘筆。

### 其他
- v618 修抵用金管理時間欄尾端多冒號（改明確格式參數，不再 slice）。

### 下次先看
- 付款核對頁只對「v619 後上傳」的新通知生效（舊通知 linkUrl 寫死）。
- 多筆付款證明**勿都核可**（會重複加 paidAmount）；正確只核可 1 筆、其餘刪除。

---

## 2026-06-21 — 抵用金通知 + 下單/簽名穩定性 + cron 全救回 + 安全/死碼 + 天氣取消（v604→v617）

目前線上 = **v20260619_617**。本日一連串改動，全部已部署 + 線上實測正常。

### 天氣取消手動觸發（v617）
- 決策：天氣取消**改為手動**，由老闆/教練決定（不自動）。
- 發現缺口：「天氣取消通知」模板原本**無任何 UI 觸發點** —— `weather-check` cron 沒掛 Cronicle、`coach/trips/weather-cancel` route 無按鈕、場次管理「取消場次」只改狀態不通知不退款。
- 修：場次管理「取消場次」modal 加勾選「🌊 天氣取消：通知客戶並退款」。勾選 → 走 `coach/trips/weather-cancel`（取消該場次所有訂單 + 發天氣取消通知 LINE/Email/站內 + 退抵用金 v603）；不勾 → 維持原狀（僅改狀態）。有報名時預設勾。
- 待辦/可選：教練端（LIFF coach 頁）也可加同樣按鈕；`weather-check` 自動取消 cron 仍未掛排程（目前走手動，不需要）。

### 抵用金（v604/605/606/607/608/610）
- v604 餘額 0 顯示灰字（LIFF + /pclogin）。
- v605 抵用金管理刪除防呆：只准刪「未使用發放筆」，餘額 clamp ≥ 0（要扣餘額請用「新增抵用金」填負數）。
- v606 一次性補退工具 `/api/admin/backfill-cancel-credit-refunds`（已補退 O20260620-1P）。
- v607 退抵用金時在訂單歷程補一行（`ensureRefundStatusLog`，from==to 顯示單一狀態）。
- v608 訂單列表顯示「↩ 抵用金已退 NT$X」標記（admin bookings API 回 `creditRefunded`）。
- v610 **抵用金異動統一通知**：`grantCredit` 掛 `notifyCreditChange`（src/lib/notify-credit.ts），通道由後台抵用金管理頁開關（SiteConfig credit_notify_line/email/inapp，預設 Email+站內）。已有專屬通知（首單/生日/VIP/退款）+ backfill 用 `skipNotify` 避免重複。

### 下單 / 簽名穩定性（v611/612/614）
- **問題**：下單常「連線逾時」。根因＝簽名上傳 R2 卡在 await 關鍵路徑（R2 SDK 預設重試 3 次、無逾時）。
- v611 簽名上傳改背景 + R2 client 加 maxAttempts=2 / 連線5s / 傳輸8s。
- v612 **簽名 DB-buffer**：下單先存 `booking.signaturePending`（秒回）→ 背景 `flushPendingSignature` + cron `/api/cron/flush-signatures`（Cronicle 每10分）補傳 R2，成功清空。簽名 100% 不掉。admin 列表不外送 base64（改 `hasPendingSignature`）。
- v614 簽名匯出由全解析 PNG → 縮 640px + JPEG 0.7（SignaturePad.tsx），payload 80~250KB → 8~20KB。

### Cron 全站救回（重大）
- 發現 Cronicle `HAIWANGZI_BASE_URL` 指向**已死的 haiwangzi.zeabur.app** → 所有排程 404 失敗（行前提醒/自動結案/天氣/生日禮金等先前都沒在跑）。
- 修：(A) 把每個 event 腳本網址硬寫 `https://haiwangzi.xyz`；(B) zeabur 更新該服務全域變數為 xyz。實測 reminders/auto-complete/weather/credit-expiry/flush-sig 全 code=0。
- v613 proxy.ts 移除舊網域轉址（保留 www→apex）。

### 安全強化 + 死碼（v614/615/616）— 經 3 個並行 agent 審計
- v614 安全：cron/email-inbound-poll fail-closed；**admin/users 不再外送 webPasswordHash**（改 hasWebPassword）；contact 加限流 + Turnstile 正式環境 fail-closed；promo/validate 限流；bootstrap 守衛補 roles[]。
- v615 清死碼：templates.ts −415 行（10 個 legacy 函式）+ vip-tier/booking-status/未用 import。
- v616 22 個 cron + email webhook 密鑰比對改 timing-safe（safeEqual）。
- 審計確認本就安全：無 IDOR、admin/coach 路由全 requireRole、admin JWT 每次重查 DB 角色、Raw SQL 全參數綁定、webhook 驗簽。

### 雜項（v601/602/609）
- v601 Email 改 Gmail 寄信（DB emailProvider，避開 awstrack）+ composeEmail 按鈕導小編 LINE。
- v602 一日潛水日曆改週一起始。v609 訂單管理預設篩選「進行中需關注付款」。

### 下次先看
- 抵用金通知通道在「後台→抵用金管理」頁頂可調（預設 Email+站內）。
- 簽名補傳健康度：cron flush-signatures（每10分）；DB `signaturePending IS NOT NULL` 即待補。
- cron 全部走 `https://haiwangzi.xyz`（勿再用 zeabur.app）。

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
