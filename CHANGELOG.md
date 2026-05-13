# Changelog

版本規則：`YYYYMMDD_NN`，NN 為跨日累計、不歸零的計數器。每次 push GitHub 都需要 bump。

## 20260514_36 — 2026-05-14 (刪除會員 / 刪除訂單 / 批次取消)

### 新 API
- `DELETE /api/admin/users/[lineUserId]`
  - 預設：有訂單 → 409，可附 `?force=true` 強制刪
  - 禁止刪除自己
  - cascade: paymentProof + reminderLog + booking + user
- `DELETE /api/admin/bookings/[id]`
  - 預設：軟取消（status=cancelled_by_user）
  - `?permanent=true`：硬刪 booking + proofs + logs
- `POST /api/admin/bookings/cancel-all` body `{confirm:"CANCEL-ALL-BOOKINGS"}`
  - 一鍵把所有 pending/confirmed 訂單改為 cancelled_by_user

### `POST /api/admin/trips` 改強 error
- Zod 失敗回 400 + issues 列表
- Prisma 失敗回 500 + detail + hint
- 之前直接 throw → 看到 generic "HTTP 500" 完全不知道哪裡錯

### UI
- `/liff/admin/users` 每張卡多「🗑 刪除會員」按鈕
  - 雙重確認（confirm + prompt "DELETE"）
  - 有訂單時跳第二次對話框問是否強制刪
- `/liff/admin/bookings`：
  - 每張卡多「取消」+「⚠ 永久刪除」按鈕
  - 標題右側多「全部取消 (N)」紅色按鈕（雙重確認 "CANCEL-ALL"）

### 仍待處理：R2 圖片上傳 503
需在 Zeabur 補 env：
```
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```
（admin 已自設 R2_ACCOUNT_ID / R2_ENDPOINT / R2_PUBLIC_BUCKET / R2_PRIVATE_BUCKET，
但缺 access key + secret，所以 r2Configured()=false）

## 20260514_35 — 2026-05-14 (修 v34 Zeabur build 失敗)

### Bug fix
- v32 引入 `useSearchParams()` 但 Next.js 16 預渲染 client component 要包 Suspense
- 否則 `npm run build` 在 prerender `/liff/admin/bookings` + `/liff/admin/trips` 階段失敗
- 修：兩頁都改為 `Page → <Suspense><Content/></Suspense>` 結構

## 20260514_34 — 2026-05-14 (多重身分 User.roles[])

### 核心需求
一個 user 可以同時是 customer + coach + admin。
例：店長本身是 admin 也是教練；常客升等成 VIP 教練。

### Schema
- `User.roles UserRole[] @default([])` 新欄位 — primary 多重角色
- `User.role` 保留為 legacy 兼容欄位（admin > coach > customer 優先）
- 空陣列自動 fallback 為 `[role]`，舊資料無痛遷移

### `lib/auth.ts`
- 新 helper `getUserRoles(user)`：roles 空就 fallback 為 `[role]`
- `requireRole()` 改為「user 的角色清單 ∩ allowed 非空就過」
- 所有現有 API 不用改 — 自動支援多重身分

### API
- `GET /api/admin/users` 回傳每筆 `effectiveRoles: Role[]`
- `POST /api/admin/users` 接受 `roles: Role[]`（推薦）或 `role`（legacy）
  - 帶 `roles` 時自動同步 `role` 為優先順序的第一個
  - 至少要選一個角色，空陣列回 400
- `GET /api/me` 回傳 `roles: Role[]`（fallback `[role]`）

### UI
- `/liff/admin/users` 編輯對話框「角色」改為 **複選 chips**
  - 至少要保留一個（按鈕不會讓最後一個被取消）
  - 卡片每個角色都顯示一個 badge
  - 篩選 tabs 改用 `effectiveRoles.includes()`
- `/liff/profile` 個人資料卡：所有非-customer 角色都顯示 badge
- `/liff/profile` 後台入口：admin / coach **兩個都看得到**（如果都有的話）

## 20260514_33 — 2026-05-14 (潛點強制刪除 cascade)

### `DELETE /api/admin/sites/[id]?force=true`
- 預設仍會擋（被 trip/tour 引用時回 409）
- 加 `?force=true`：在 transaction 內
  1. 把該 site id 從引用的 trip/tour 的 `diveSiteIds` 陣列拉掉
  2. 再刪除 site
- 409 回應加 `canForce: true` + 引用數量

### UI
- `/liff/admin/sites` 點刪除遇到 409 時
- 跳出第二次確認：「強制刪除會自動從 N 個場次 + M 個潛水團拉掉此潛點」
- 確認後自動帶 `?force=true` 重試

## 20260514_32 — 2026-05-14 (主控台統計卡可點 + 數字改 operational 語意)

### `/api/admin/stats` 改寫
- `trips.bookable` — open + 未來日期（可預約場次）
- `tours.bookable` — open + 未來出發日（可預約團）
- `bookings.active` — status in (pending/confirmed) + 對應 event 未過

### 主控台 Mini 卡
- 4 張卡全部變成 Link，標題右邊有 `▸` 提示
- **會員** → `/liff/admin/users`
- **日潛場次** → `/liff/admin/trips?tab=trips&filter=active`
  - 主數字改為 bookable，副標顯示「總 N」
- **潛水團** → `/liff/admin/trips?tab=tours&filter=active`
- **總訂單** → `/liff/admin/bookings?filter=active`
  - 主數字改為「未執行」訂單數

### URL param 支援
- `/liff/admin/trips` 讀 `?tab=` (trips/tours) + `?filter=` (active/cancelled/all)
- `/liff/admin/bookings` 讀 `?filter=active` → 預設 tab=進行中

### 為什麼這樣改
之前主數字是「歷史累計」（含 cancelled / completed / 過去場次），admin 想知道
「現在可以預約的場次幾個？還沒執行的訂單幾筆？」是看不出來的。
現在 operational 數字一目了然，點進去也直接導到對應 filter。

## 20260514_31 — 2026-05-14 (修 /liff/profile 載入卡住問題)

### Bug fix
- `/liff/profile` 之前 `/api/me` 失敗會靜默吞錯，永遠卡在「載入中...」
- 現在會顯示真正的錯誤訊息 + 「重試」「重新登入 LINE」按鈕
- 偵測到 401 / idToken 過期 → 自動觸發 `liff.login()` 重新走 OAuth flow

### 觸發原因
LIFF idToken 有 1 小時 TTL，過期後 `/api/me` 回 401。
原本 `.catch(() => {})` 完全沒顯示，user 只看到「載入中...」會覺得網站壞了。

## 20260514_30 — 2026-05-14 (Email 通道完整整合)

### 新模板 (6 個)
- `depositReminderEmail` — 訂金繳費提醒（7 天內）
- `finalReminderEmail` — 尾款繳費提醒（D-N）
- `tripGuideEmail` — D-2 / D-1 行前通知 + 裝備清單
- `weatherCancelEmail` — 海況取消通知 + 後續處理選項
- `paymentReceivedEmail` — 收款確認（deposit / final / full）
- `broadcastEmail` — admin 自由格式廣播

### Cron 雙通道
- `/api/cron/reminders` D-1 / 尾款提醒：**LINE + Email 各自獨立 dedup**
  - 客戶 `notifyByLine = false` 跳過 LINE，`notifyByEmail = false` 或無 email 跳過 Email
  - 兩通道各自記 `ReminderLog`（channel="line" / channel="email"）
- `/api/cron/weather-check` 海況取消：同時推 LINE Flex + Email

### 觸發點
- `POST /api/bookings/daily` 預約成功 → 客戶收 `bookingConfirmEmail`
  - fire-and-forget，email 失敗不影響預約建立
- `POST /api/coach/payment-proofs` (approve) → 客戶收 `paymentReceivedEmail`
  - 自動判斷 deposit / final / full 三種情境

### Broadcast 加入 channel 選擇
- `/liff/admin/broadcast` 新增「通道」card：LINE / Email / 兩者
- 選 email/both 時顯示 Email 主旨 + 內文輸入框
- 後端 `/api/admin/broadcast` 接受 `channel` + `emailSubject` + `emailBody`
- 結果顯示「LINE N 人 · Email M 人」

### 用戶尊重
- 所有通道都檢查 user.notifyByLine / notifyByEmail
- 客戶可在 `/liff/profile` 自己關掉任一通道

## 20260514_29 — 2026-05-14 (Email 通道：Gmail SMTP core)

### 新依賴
- `nodemailer@8` + `@types/nodemailer`

### lib/email/
- `send.ts` — Gmail SMTP wrapper
  - 沒設 env 自動 no-op（不 throw，回 `{ ok:false, skipped:true }`）
  - 收件人沒 email 直接 skip（容錯 cron 場景）
  - 支援 App Password 兩種格式：`abcd efgh ijkl mnop` 或 `abcdefghijklmnop`
- `templates.ts` — 純函式回傳 `{ subject, text, html }`
  - 目前 2 個：`testEmail` / `bookingConfirmEmail`
  - 統一 shell：品牌色 header + 灰底卡片，inline-style 對應大部分 email client

### Schema
- `User.notifyByLine Boolean @default(true)`
- `User.notifyByEmail Boolean @default(true)`

### API
- `POST /api/admin/email/test` — 寄測試信
  - body 可選 `{to}`，預設寄 admin 自己 email
  - 沒設 env 回 503 + hint
- `/api/me` GET/PATCH 支援 `notifyByLine` / `notifyByEmail`

### UI
- `/liff/profile` 新增「**通知偏好**」卡：LINE / Email toggle
  - Email toggle 在沒填 email 時 disabled + 紅標提示
- `/liff/admin/settings` 新增「**Email 通道測試**」區塊
  - 可指定收件人或留空寄給自己
  - 顯示結果（成功/略過/失敗 reasons）

### .env.example
- 新增 `GMAIL_USER` / `GMAIL_APP_PASSWORD` 區塊 + 申請步驟說明
- 提醒：Gmail 個人額度 500 封/天，量大要換 SendGrid/Resend/SES

### Deploy 設定
admin 需在 Zeabur dashboard 加環境變數：
```
GMAIL_USER=neowu62@gmail.com
GMAIL_APP_PASSWORD=（自己的 App Password，16 字）
```

### 下一版預定
- 6 個 email 模板（deposit-reminder / final-reminder / trip-guide / weather-cancel / payment-received / admin-broadcast）
- cron/reminders 雙通道（LINE + Email）
- /liff/admin/broadcast 加 channel select

## 20260514_28 — 2026-05-14 (User.email + 首次登入提示)

### Schema 變更
- `User.email String?` (max 254 字 = RFC5321 上限)

### API
- `GET /api/me` 回傳 `email`
- `PATCH /api/me` 接受 `email`，Zod 用 `.email()` 驗證格式
- `POST /api/admin/users` admin 也可代填 email

### 客戶端 `/liff/profile`
- 個人資料卡加 **Email 欄位**（必填，跟姓名/手機/證照同層）
- 格式不對紅框 + 提示
- summary 加入 email 顯示
- email 未填時顯示「🔔 首次登入請填 email」

### Welcome 首次登入提示
- 登入後若 `email == null` → Hero 區下方出現金色提示框
- 點一下直接跳 `/liff/profile`

### Admin 會員管理
- 編輯 Dialog 加 Email 欄位
- 列表卡片顯示 email
- 搜尋框比對 email

### 用途
Email 比 SMS 便宜（SMS 約 NT$1/封；email 幾乎免費）：
- 預約確認信
- 行前通知（出發前 D-2）
- 訂金/尾款收據
- 統一發票（將來）

## 20260514_27 — 2026-05-14 (會員管理：完整編輯)

### `/liff/admin/users` 大改
- 新增「編輯」按鈕 + Dialog，admin 可以改：
  - 真實姓名 / 電話
  - 角色 (customer/coach/admin)
  - 證照等級 (OW/AOW/Rescue/DM/Instructor/無)
  - 證照號碼
  - 潛水紀錄數 (logCount)
  - VIP 等級 (— / VIP / Gold)
  - Admin 備註（只有 admin 看得到）
  - 黑名單 + 加黑原因
- LINE userId / displayName 不能改（系統識別用，唯讀顯示）
- 列表加 **搜尋框**（姓名/電話/證號/userId 模糊比對）
- 列表加 **篩選 tabs**：全部 / 客戶 / 教練 / Admin / VIP / 黑名單
- 卡片顯示更完整：角色 / 證照 / VIP / 黑名單 badge、訂單統計、Admin 備註

### API
- `POST /api/admin/users` schema 擴充支援所有可編輯欄位
- 空字串 → null 處理（避免 DB 存空字串）

## 20260514_26 — 2026-05-14 (場次/團 上傳照片 + 集合地點)

### 新元件
- `src/components/admin/ImageUploader.tsx` — 共用上傳元件
  - 直接 PUT R2 (presign + 8MB / 張上限 / max 8 張)
  - 顯示縮圖 grid + 移除按鈕
  - 支援 prefix: `sites` / `trips` / `tours` / `media`

### 日潛場次表單
- 新欄位：**集合地點說明** (textarea)
  - 例：「海王子潛店 / 龍洞 4 號港停車場 / 潮境公園售票口 07:30 集合」
- 新欄位：**場次照片**（最多 8 張）
- 卡片列表顯示 📍 集合地點 + 縮圖 row（顯示前 4 張）

### 潛水團表單
- 新欄位：**團照片**（schema 一直有 images，這次補上 UI）
- 卡片列表顯示縮圖 row

### Schema 變更
- `DivingTrip.meetingPoint String?`
- `DivingTrip.images String[] @default([])`
- `TourPackage.finalReminderDays @default(30)` (從 3)
- `TourPackage.guideReminderDays @default(2)` (從 1)

### R2 prefix 新增
- `trips/` 日潛場次照（public bucket）
- `tours/` 潛水團照（public bucket）

## 20260514_25 — 2026-05-14 (清除全部開團資料 + 旅行團 → 潛水團)

### 文字統一改名
- 全站 **「旅行團」→「潛水團」**（22 個 code 檔案、Flex 模板、UI、API 訊息）
- 保留歷史 CHANGELOG / docs 原文不動

### 新功能：一鍵清除所有開團資料
- 在 `/liff/admin/trips` 「全部」tab 下方加 **危險區塊**
- 雙重確認（confirm + prompt 輸入 `WIPE-ALL`）
- 新 API：`POST /api/admin/trips/wipe-all`
  - body: `{ confirm: "WIPE-ALL-TRIPS-AND-TOURS" }`
  - 在 transaction 內依序刪：PaymentProof → ReminderLog → Booking → DivingTrip → TourPackage
  - **不會動**：DiveSite / Coach / User / SiteConfig / TripMedia / MessageTemplate
- 回傳實際刪除數量

## 20260514_24 — 2026-05-14 (旅行團表單橫向化 + 提醒新規則)

### 「新增 / 編輯旅行團」對話框
- 改為 **label 在左、欄位在右** 橫向佈局（左欄固定 7rem）
- Label 改名：
  - 「總價」→「**團費**」
  - 「容量 (0 = 無上限)」→「**預計團員人數**」
- 自動推播提醒重新規劃預設值：
  - **訂金 D-7**：確認訂單後 7 天內付款保留名額
  - **尾款 D-30**：出發前 30 天繳清（原本 D-3 太晚）
  - **行前 D-2**：出發前 2 天再次通知（原本 D-1）
- 每項提醒旁加文字說明，讓 admin 知道為什麼是這天數

### Schema 預設值
- `TourPackage.finalReminderDays` 預設 3 → **30**
- `TourPackage.guideReminderDays` 預設 1 → **2**
- 既有 tour row 不會自動 migrate，admin 要手動改

## 20260514_23 — 2026-05-14 (新增場次表單簡化)

### 「新增 / 編輯場次」對話框
- 移除「夜潛」「水推」兩個 checkbox
- 改由時間自動判斷：`startTime >= 16:00` → `isNightDive = true`
- 對話框內顯示提示：「⏰ 16:00 之後自動標記為夜潛」+ 即時顯示目前是否為夜潛
- Label 文字：
  - 「潛次上限」→「**潛水支數**」
  - 「容量 (0 = 無上限)」→「**參加人數上限** (0 = 無上限)」

## 20260514_22 — 2026-05-14 (潛點管理 + 教練 per-dive 費用 + 場次備註)

### 新 admin 頁面
- `/liff/admin/sites` — **潛點管理**（新增/編輯/刪除）
  - 欄位：id、名稱、區域、難度、最大深度、介紹、特色、注意事項、YouTube
  - 安全：若被 trip/tour 引用會擋住刪除
- `/liff/admin/coaches` — **教練管理**（新增/編輯/停用/永久刪除）
  - **核心改動**：教練「沒有基本費用」概念，改為「每一支潛水的費用 (NT$/dive)」
  - 停用 = soft delete (active=false 可復原)
  - 永久刪除 = 雙重確認 + 有 trip ref 會擋

### 開團頁 (`/liff/admin/trips`)
- 「新增場次」對話框加 **備註說明** textarea
  - 範例：本團安排潮境公園生態解說、自備防寒衣建議 5mm…
  - 場次卡片會顯示 📝 備註
- 教練選單旁顯示 `($1500)` 每支潛水費用
- 即時試算 **預估教練成本** = Σ feePerDive × tankCount

### Schema 變更（db push 自動 sync）
- `Coach.feePerDive Int @default(0)` — 每支潛水費用
- `Coach.note String?` — 教練備註
- `DivingTrip.notes String?` — 場次備註說明

### 新 API
- `POST /api/admin/sites` `PATCH/DELETE /api/admin/sites/[id]`
- `POST /api/admin/coaches` `PATCH/DELETE /api/admin/coaches/[id]`
- `/api/admin/sites GET` 改為 admin 拿完整資料（含 description/cautions），coach 只拿基本欄位

### 既存教練資料
deploy 後既有教練 `feePerDive=0`，需要去 `/liff/admin/coaches` 一一補上。

## 20260513_21 — 2026-05-13 (開團管理：篩選 + 還原 + 永久刪除 + 修 admin 401 race)

### 「開團管理」UI 大改
- 頂部加 **篩選 tabs**：啟用中 / 已取消 / 全部
- 預設只看「啟用中」，已取消的不會干擾日常使用
- 已取消場次 / 旅行團現在多 2 個動作按鈕：
  - 🔄 **還原**：status cancelled → open（單擊還原）
  - ⚠ **永久刪除**：雙重確認（先 confirm，再 prompt 輸入 `DELETE` 字串）
- 「已取消」tab 上方一鍵「**還原全部**」（修復誤取消的場次很方便）

### 新 API
- `POST /api/admin/trips/bulk-restore`  body `{tripIds:[...]}` 批次還原
- `DELETE /api/admin/trips/[id]?permanent=true`  硬刪除（有 booking ref 會擋）
- `DELETE /api/admin/tours/[id]?permanent=true`  硬刪除

### 修「admin 401 race」
- 之前：頁面 useEffect 比 LIFF init 早跑，第一次 API call 沒帶 idToken → 401
- 現在：`fetchWithAuth` 在沒 idToken 時 poll LIFF SDK 最多 3 秒等 init 完
- 直接 poll SDK 而不是 React state，避免閉包 stale 問題

## 20260513_20 — 2026-05-13 (Welcome 橫向 layout + 修 midnight 文字色)

### 修 LiffShell header 文字看不清楚
`.midnight` CSS class 之前只改 --foreground 變數，但沒套 `color: var(--foreground)`，
所以子元素還是繼承 body 的暗色 (light mode foreground)。加上 `color: var(--foreground)`
強制讓 .midnight 內所有文字用 light 色 (#e6f0ff)。

### Welcome Hero 橫向化（縮 Y 軸）
- Logo（Trident）改放在「東北角海王子」**左邊**
- 字體調小 (text-2xl → text-lg)、subtitle 從 [10px] → [9px]
- 整體 Y 軸減半，手機一屏看到更多卡

### 6 卡橫向化（縮 Y 軸）
- icon 從上方改到**左側**
- 標籤 / EN / desc 改在 icon **右側** 直排
- 每卡 padding 從 p-4 → p-3
- 整體高度減少 ~40%，手機一屏可看到 6 卡

## 20260513_19 — 2026-05-13 (修 LIFF deep-link 404)

### 修復根本原因
LINE LIFF endpoint URL 設成 `https://haiwangzi.zeabur.app/liff/welcome`，
當客戶打開 `liff.line.me/<ID>/calendar` 等深層連結時，LINE 會把 path
附加到 endpoint，URL 變成 `/liff/welcome/calendar` → 404。

### 修法
`next.config.ts` 加 redirect rule：
```
/liff/welcome/:path+  →  /liff/:path+
```

讓 LINE 附加 path 後 server-side 自動 redirect 到正確位置：
- `/liff/welcome/calendar` → `/liff/calendar`
- `/liff/welcome/tour` → `/liff/tour`
- `/liff/welcome/media` → `/liff/media`
- `/liff/welcome/my` → `/liff/my`
- `/liff/welcome/profile` → `/liff/profile`

### 建議的永久解法（可選）
將 LINE Console LIFF App Endpoint URL 改成：
```
https://haiwangzi.zeabur.app/liff/welcome → https://haiwangzi.zeabur.app/liff
```
（需另加 /liff redirect 到 /liff/welcome），這樣 path append 邏輯就直接對。
目前用 redirect rule 已能解決，不急著改。

## 20260513_18 — 2026-05-13 (Splash 暫停用，回到穩定狀態)

### Splash rollback
- LiffShell 內 `<SplashOverlay />` 暫時 comment 掉
- `/liff/go` 改回簡單 redirect (移除 splash 動畫)
- 元件檔保留，等後續修好 hydration race 再重啟

原因：客戶反映多個 LIFF 頁面打開沒畫面，懷疑是 splash overlay 卡住。
先取消 splash 確保所有頁面正常運作。

### Admin 首頁設定保留（v17 內容）
- `/liff/admin/site-config` 仍可用
- 6 卡入口 / Hero / 海況 / Footer / Slogan 全部可改
- Splash 設定欄位保留（雖然 LiffShell 暫時不渲染，未來修好再吃這設定）

## 20260513_17 — 2026-05-13 (Admin 首頁設定 + Splash 1 小時冷卻 + 外連 Splash 路由)

### 新增 Admin 首頁設定 `/liff/admin/site-config`
Admin 可在後台改：
- **Hero**：主標題（中）、副標（英）、問候語
- **6 卡入口**：每張卡可改 label / 英文標 / 說明 / URL / icon / 主色 / 啟用開關 / 順序 / 內外連
- **海況卡**：啟用、標題、資訊行、按鈕文字/連結
- **頁尾 slogan**：中文、英文
- **Splash**：啟用、秒數、冷卻

新增卡片 + 拖動排序 + 一鍵還原預設 全支援。

### Schema
- 新表 `SiteConfig`（singleton id=default，所有設定一列）

### API
- `GET /api/site-config` 公開（給 Welcome / SplashOverlay 讀）
- `GET/POST/DELETE /api/admin/site-config` admin 用

### Splash 行為改變
- **由「session 一次」→「每小時一次」**（localStorage 記時戳）
- 秒數 + 冷卻時間可在後台調整
- SplashOverlay 元件抓 `/api/site-config` 套用最新文字

### 外連 Splash 路由
- 新 `/liff/go?to=URL` 顯示 splash 3 秒後跳目標
- Welcome FB 卡自動走 `/liff/go` 包裝（外連也有 splash）

### Welcome 頁完全動態
- 所有文字 / 卡片 / 海況 / footer 改讀 SiteConfig
- 沒設定時 fallback 寫死預設

### Admin Dashboard
- 加「首頁設定」入口

## 20260513_16 — 2026-05-13 (Deep link 3 秒品牌 Splash)

### Splash Overlay
- 第一次直接打開深層 LIFF link（calendar/tour/media/my/profile）時，先顯示 3 秒品牌 splash
- Splash 內容：三叉戟 logo + 「東 北 角 海 王 子」+ NEIL OCEAN PRINCE + Loading 進度條
- 同 session 後續導航不再重複顯示（sessionStorage 標記）
- welcome 頁本身不顯示（它就是 splash 風格）

### 程式
- 新元件 `src/components/shell/SplashOverlay.tsx`
- LiffShell 內建 splash overlay

## 20260513_15 — 2026-05-13 (Welcome 改深海風格 — 對齊設計圖)

### Welcome 頁完全重做為「深海主題」
- 全頁 midnight bg (`#0F1B2D`)
- Hero 區改成「三叉戟 logo + 東 北 角 海 王 子 + NEIL OCEAN PRINCE」字寬
- 海底光斑裝飾（radial gradient blur）
- 6 卡每張獨立漸層（深海藍 → 強調色淡邊）+ 圓形 icon + 中/英雙語 + 描述 + 箭頭
- 海況卡保留但融入暗色
- 底部 slogan「探索海洋 · 安全潛水 · 專業教學」+ EN

### 新增 SVG
- `<Trident>` 三叉戟元件（src/components/brand/Logo.tsx）

### Shell
- LiffShell `midnight` 模式應用到整頁（header 也變深色）

## 20260513_14 — 2026-05-13 (最新動態 + Welcome 6 卡)

### 最新動態 (DIVE MEDIA) 功能
為節省流量設計成「連結牆」：教練先把照片/影片發到 FB/IG/YouTube，
再到 LIFF 後台貼連結 + 上傳一張小縮圖 + 一句說明，
客戶在 `/liff/media` 看到 feed → 點縮圖外開到原平台看完整內容。

新檔案：
- Prisma: `TripMedia` model + `MediaPlatform` enum (fb/ig/yt/tiktok/other)
- `/api/media` 公開 GET (feed, cursor 分頁)
- `/api/coach/media` GET/POST (上傳)
- `/api/coach/media/[id]` DELETE
- `/liff/media` 客戶端 feed 頁
- `/liff/coach/media` 教練上傳 + 自己管理頁
- R2 presign 加 `media` prefix (public bucket)
- 平台自動偵測：貼 FB/IG/YT URL 會自動選對 platform

### Welcome 改 6 卡（依您提供的設計圖）
從 4 卡（日潛/旅遊/我的/個人）→ 6 卡：
- 日潛水 (FUN DIVE) · 今日出航
- 潛水團 (DIVE TRIP) · 國內外行程
- **最新動態 (DIVE MEDIA) · 影像日誌** (新)
- 我的預約 (BOOKING) · 課程紀錄
- **FB 社群 (COMMUNITY) · Facebook 粉絲頁** (外連 https://www.facebook.com/wang.cheng.ru.350053)
- 個人中心 (MY PROFILE) · 潛水紀錄

每卡加 English label (FUN DIVE / DIVE TRIP / ...) 視覺呼應您的設計

### Admin Dashboard
加「動態管理」連結到 `/liff/coach/media`

## 20260513_13 — 2026-05-13 (修潛伴儲存 500 bug + 改名 朋友/同伴 → 潛伴)

### 修 HTTP 500 bug
- 「新增潛伴」後立刻點 OW/AOW 按鈕（還沒填名字）→ debounce 觸發 PATCH /api/me → 後端 Zod 拒絕空 name → 500
- 修法：`persistCompanions` 只把 `name.trim().length >= 1` 的潛伴送 API
- 空名字的潛伴留在 local state（form 還在），等使用者填名字才存 DB

### 統一用詞「潛伴」
- 朋友 #N → 潛伴 #N
- 同伴 / 朋友 → 潛伴
- 常用同伴 → 常用潛伴
- 新增同伴 → 新增潛伴

## 20260513_12 — 2026-05-13 (Profile 加 Admin 入口 + 朋友 header 整排可收合)

### 個人頁加 Admin/教練 後台入口
- `role=admin` → 看到「Admin 主控台」卡片 → 連 `/liff/admin/dashboard`
- `role=coach` → 看到「教練後台」卡片 → 連 `/liff/coach/today`
- 一般客戶看不到（不會被誤導）

### 朋友 #N 整排 header 可點收合
- 之前只有 X 按鈕能收，現在整個「朋友 #1 李大華・AOW」標題列都能點
- 加 ChevronUp 視覺指示
- 刪除按鈕仍獨立可點，不會誤觸

### LiffProvider 支援 NEXT_PUBLIC_MOCK_USER_ID
- 本地 dev 連 production DB 時，可用此 env 以指定 lineUserId 登入
- 預設仍為 U_mock_dev_user_0001 (向後相容)

## 20260513_11 — 2026-05-13 (訊息模板 admin 可編輯)

### `/liff/admin/templates` 新頁面
- 列出 10 個 Flex 模板（預約確認/D-1提醒/訂金通知/訂金確認/尾款提醒/行前手冊/天氣取消/週報/超賣警示/歡迎）
- 每個模板可改：標題、副標、說明文字、按鈕文字、通知列文字
- 「試送到我自己」按鈕 → 推到當前 admin 的 LINE 即時看效果
- 「還原預設」一鍵移除覆寫
- 動態資料（客戶名/日期/金額）仍由系統填，admin 只改文字描述

### 新 DB 表
- `MessageTemplate (key + title + subtitle + bodyText + buttonLabel + altText + updatedBy)`

### 程式架構
- `buildFlexByKey()` 同步（不讀 DB），舊呼叫位點保持效能
- `buildFlexByKeyAsync()` 新非同步版（讀 DB override 套用）
- 10 個 factory 改成接受 `override?: TemplateOverride` 參數
- `_common.ts` 加 `ovr(override, field, defaultValue)` helper
- `index.ts` 加 `FLEX_EDITABLE_FIELDS` 定義每個模板哪些欄位可改

### Admin Dashboard
- 加「訊息模板」入口

## 20260513_10 — 2026-05-13 (改用 CWA 即時測站 + 風速判斷)

### 天氣自動取消用對的資料源
- 之前用的 F-A0085-002 是「冷傷害指數」不是海象，所以抓不到浪高
- 改用 **O-A0001-001 即時測站觀測**，抓 466940 基隆 + 467080 宜蘭兩站風速
- 用 **WindSpeed** 取代浪高判斷 (CWA 即時資料沒提供 wave height)
- 閾值改為 **WEATHER_WIND_THRESHOLD** (預設 10 m/s ≈ Beaufort 5「強風」)
- 新增 `WEATHER_STATIONS` env (預設 `466940,467080`)
- 取多站最大值判斷，覆蓋面更廣
- 測試模式：`?force_wind=15` 強制觸發、`?dry_run=1` 模擬不真的取消

### 為何不用浪高？
- CWA 開放資料的浪高需要的 endpoint F-A0017-001 / F-B0058-001 等都 `Resource not found`
- 即時觀測站只有風速、風向、陣風
- 風速 10 m/s 約等於 Beaufort 5「強風」、浪高約 1.5-2m，跟原本浪高 1.5m 閾值差不多

## 20260513_09 — 2026-05-13 (修 cron null 防呆)

- 既有 tour rows 升級後 `*ReminderDays` 為 null，補 `?? 3` 防呆預設
- 使用者編輯該團時可在 `/liff/admin/trips` 設定實際天數

## 20260513_08 — 2026-05-13 (大整修：開團 CRUD + 超賣 + 天氣 + LTV + 週報)

### A. 開團設定 (Admin trips CRUD)
- 新頁 `/liff/admin/trips` 兩個 tab：日潛場次 / 旅行團
- 新增 / 編輯 / 取消 場次（可選潛點、教練、計價、容量）
- 新增 / 編輯 / 停用 旅行團（總價、訂金、截止日、提醒天數）
- 6 個新 admin API：`/api/admin/{trips,tours}` 與 `/[id]`、`/api/admin/{sites,coaches}`
- Dashboard 新增「開團管理」入口

### A. 超賣邏輯
- `DivingTrip.capacity` 改為可選（null = 無上限）
- `Booking.overCapacity Boolean` 新欄位
- `/api/bookings/daily` 不再硬擋超賣，照樣接單 + 推 Flex 給教練處理
- 新 Flex `overcap_alert` (推教練)
- 教練端 today 顯示超賣 badge

### A. 旅行團提醒天數可設定
- `TourPackage` 新增 `depositReminderDays` `finalReminderDays` `guideReminderDays`
- Cron `/api/cron/reminders` 改讀每團的設定動態計算 D-N

### B. Bug fixes
- B1: `/api/trips` booked 排除 cancelled / weather / no_show 三種狀態
- B2: `/api/admin/bookings` 回傳 ref（trip 日期+時間/旅行團名）；前端顯示 trip date+time，不再用時區轉換把 08:00 顯示成 02:00
- B3: LiffShell title `truncate whitespace-nowrap` 不再折行
- B4: payment-proofs API 對 private bucket 回 `publicUrl: null`

### C. Welcome Flex
- 第一次加好友 → 推 Flex 卡片（不再是純文字訊息）
- 新 Flex template `welcome`

### D1. 天氣自動取消
- 新 cron `/api/cron/weather-check`
- 抓中央氣象局浪高（需要 `CWA_API_KEY` env）
- 浪高 > `WEATHER_WAVE_THRESHOLD` (預設 1.5m) 自動把當日 open 場次標為 cancelled_by_weather
- 自動推 Flex `weather_cancel` 給所有已預約客戶

### D3. LTV / 黑名單
- User schema 新增 `noShowCount`、`blacklisted`、`blacklistReason`、`vipLevel`
- `/api/admin/users` 回傳每位客戶的 LTV stats (總預約 / 完成 / 取消 / no-show / revenue / potential)
- `POST /api/admin/users` 可改 role / blacklist / vipLevel
- 預約時擋黑名單 → 回 403

### D6. Admin 週報
- 新 cron `/api/cron/admin-weekly`
- 每週一 09:00 (Asia/Taipei) → Cronicle 觸發
- 計算上週新預約 / 完成 / 取消 / 收入 / 最熱門潛點
- 推 Flex `admin_weekly` 給所有 role=admin 的 User

### E4. 錯誤監控
- 新 `src/lib/error-report.ts`
- 後端 reportError(err, ctx) 寫 console + 推 LINE 給 admin（環境變數 `ADMIN_LINE_USER_IDS`）
- 留位給 Sentry / Better Stack 接口

### Cronicle 新增的 Job
- `weather-check`: `0 22 * * *` (台北 06:00) POST `/api/cron/weather-check`
- `admin-weekly`: `0 1 * * 1` (台北每週一 09:00) POST `/api/cron/admin-weekly`

## 20260513_07 — 2026-05-13 (修同伴刪除 race condition)

### 修「點刪除同伴沒反應」bug
- `removeCompanion` 改用 React functional update 拿最新陣列
- `persistCompanions` 一開始就 cancel pending debounce timer，避免覆寫
- 樂觀更新：UI 先響應，PATCH 失敗才回滾並 alert + reload
- `updateCompanion` 也改用 functional update，避免閉包陳舊 (stale closure)

### 根本原因
舊版的 debounce 寫入計時器，如果在使用者按刪除前 600ms 內有打字，
刪除按下後 timer 還在排隊，刪除完之後 timer 觸發又把舊資料 PATCH 回去。

## 20260513_06 — 2026-05-13 (Profile 統計卡可點 + 改名)

### Profile 統計卡互動化
- 「累計 Log」→「潛水次數」（更白話）
- 「預約紀錄」可點 → 跳出 Dialog 顯示完整預約清單（按時間/狀態排）
- 「已完成」可點 → 跳出 Dialog 只顯示 status=completed 的紀錄
- Dialog 內每筆 booking：圖示（⚓ 日潛 / 📅 旅行團）、場次/旅行團名、日期時間、人數、狀態 badge、金額
- 點選列表項目跳到 `/liff/my?just=<bookingId>` 看詳情
- 0 次的數字不可點（disabled）

## 20260513_05 — 2026-05-13 (Wordmark 改名 + idToken 自動刷新 + 同伴選單突顯)

### Wordmark / Header
- 「海王子」→「東北角海王子潛水」（全名）
- 「DIVING TEAM」→ 改顯示 `v<APP_VERSION>` 動態版本
- LiffShell 不再額外顯示版本（避免重複）

### LIFF idToken 修正
- 修「確認預約 HTTP 401 missing idToken」bug
- `fetchWithAuth` 每次都呼叫 `liff.getIDToken()` 抓最新 token
- 沒有 idToken → 自動 `liff.login()` 重新導向授權
- 解決使用者填很久表單後 idToken 過期送出失敗的情境

### 同伴選單突顯
- 預約表單同伴 #N 展開時，最上方顯示「從常用同伴選」的大型 chip group
- 點 chip 一鍵帶入該同伴資料
- 另有「+ 手動輸入」chip 回到空表單

## 20260513_04 — 2026-05-13 (個人資料頁折疊 + Header 版本顯示 + 對比修正)

### 個人資料頁全面折疊
- `/liff/profile` 改用同一個 `<CollapsibleCard>`
- 個人資料、緊急聯絡人、常用同伴三大區塊都可獨立折疊
- 自動展開：載入後若必填缺，自動展開該區
- 自動儲存：欄位變動 600ms debounce 後自動 PATCH `/api/me`（不再有「儲存」按鈕）
- 同伴卡片用 inline editor，每位都有完整欄位（姓名/手機/證照/編號/支數/關係）
- 折疊摘要 → 完成顯示 ✓「姓名・證照・電話・關係」、未填顯示紅色「尚未填寫」

### Header 顯示版本
- LiffShell header 左側 Logo 旁邊加上 `v20260513_04` 小字
- 移除右下角 footer 版本（避免重複）

### 對比 / 可讀性修正
- `/liff/dive/date/[date]` 移除整頁 midnight 主題（之前若任一場次是夜潛就會整頁變深）
- 夜潛卡片自身保留深色主題（差異化展示），其他白色卡片回復清晰對比

### 共用元件
- 抽出 `src/components/ui/collapsible-card.tsx` 給 booking 頁、profile 頁共用

## 20260513_03 — 2026-05-13 (預約 UX 重構 + Landing Page)

### 預約表單可折疊重構
- 「個人資料」拆出獨立 collapsible Card
- 「緊急聯絡人」拆出獨立 collapsible Card（先前在同一張卡內）
- 同伴 #N 每位都是 collapsible 卡
- 折疊摘要：完成顯示「✓ 姓名・手機・證照・累計支數」、未填顯示「必填」紅色提示
- 自動展開邏輯：載入 `/api/me` 後若必填欄位缺，自動展開該段；填齊自動收回
- 新增 `<CollapsibleCard>` 共用元件

### 根網址 Landing Page
- `/` 不再直接 redirect 到 `/liff/welcome`
- 改顯示行銷風格 landing：深海背景 + 品牌色漸層標題
- 主 CTA 按鈕「開啟 LINE 預約」連向 `https://liff.line.me/<LIFF_ID>`
- 處理「使用者在桌面瀏覽器分享連結點進來」的情境

## 20260512_02 — 2026-05-12 (Cron Bearer auth + Cronicle 整合)

### Cron / 排程
- `/api/cron/reminders` 認證改為 `Authorization: Bearer <CRON_SECRET>` header（舊 `?token=` 樣式移除）
- 新增 `?pollWindowMinutes=30` 參數（回應 body 也帶上，方便對齊 cron 頻率紀錄）
- 支援 POST（Cronicle 標準呼叫）與 GET（瀏覽器手動測試）
- 回應 body 新增 `errors[]` 與 `tookMs`，方便排錯
- 環境變數 `CRON_TOKEN` → `CRON_SECRET`（值不變，請手動到 Zeabur env 改名）
- 新增 `docs/CRON_SETUP.md`：完整 Cronicle 設定 SOP（對齊其他專案如 its-17-time）
- 排程改由共用 Cronicle (https://neowu-cron-hub.zeabur.app) 觸發，未來所有專案 cron 統一在此處管理

## 20260512_01 — 2026-05-12 (UX iteration + 同伴系統 + GitHub/Zeabur 部署版本)

### UX 大整修（依使用者回饋）
- **行事曆三檢視 → 精簡為兩檢視**：本週 / 近 3 週 / 整月 → 近 2 週 (預設) / 本月
- **行事曆預覽卡**加上「`X 潛`」灰色 badge、「`水推`」金色 badge；日期欄補上週幾（週一/週二...）
- **Header 全站重排**：海王子 Logo 固定左上（點按回首頁）、頁面標題 + 返回鈕 + 動作 slot 移到右側
- **返回鈕** 改用 `router.back()` 永遠回實際進入的上一頁（修掉硬寫 backHref 跳錯頁的 bug）
- **預約頁緊湊化**：trip info 卡改成跟行事曆預覽卡一致排版；個人資料 Y 軸從 7 列壓到 4 列（姓名+手機同排、證照下拉+累計潛水支數同排、緊急聯絡人三欄並排）
- **證照等級** pill 群 → 原生 `<select>` 下拉（手機跳系統 picker，UX 更精準）

### 新功能：同伴系統
- Prisma schema 新增 `User.companions Json`、`Booking.participantDetails Json`
- `/api/me` 接 companions 讀寫
- `/api/bookings/daily` 接 `participantDetails`，並自動把新同伴 merge 到 user.companions（去重）
- **預約表單**：載入時自動 pre-fill 本人資料；人數 > 1 時動態展開 N-1 個「同伴 #N」slot
- **同伴 slot**：右上有下拉選單可從常用同伴一鍵帶入；也可手動輸入
- **Profile 頁** 加「常用同伴」CRUD（新增 / 編輯 / 刪除，全部即時 PATCH）

### 新功能：裝備數量
- `rentalGear` schema 加 `qty` 欄位
- 計價邏輯變更：原本 `(base + gear) × people` → 新版 `base × people + Σ(gear.price × gear.qty)`
- 預約頁裝備 Dialog 改成每件 `−[qty]+` stepper（2 人共用 1 件 BCD 可正確計價）
- 預約 chips 顯示 `BCD ×2 +400`
- EditBookingDialog 同步支援

### 新功能：訂單編輯 / 取消
- `PATCH /api/bookings/[id]` — 修改 participants / tankCount / rentalGear / notes（含容量重檢 + 總額重算）
- `DELETE /api/bookings/[id]` — 自取消（轉成 cancelled_by_user）
- 「我的預約」每筆訂單加「修改」按鈕 → EditDialog 含人數 stepper + 裝備 + 備註 + 取消預約（兩段確認）

### 新功能：日潛付款確認
- 「我的預約」日潛訂單也顯示 gold「付款確認」按鈕（原本只有旅行團）
- 付款頁偵測 `type === "daily"` 隱藏訂金/尾款 tabs（日潛只有一筆全款）
- 提示框說明「現場現金」vs「事前匯款」兩種付款方式

### 開發體驗
- **Mock 模式 401 bug 修復**：LiffProvider 在 mock 模式不送 Bearer header（假 token 過不了 LINE JWKS）
- **R2 重構為雙 bucket**：`payments/avatars` → private、`sites/richmenu` → public，配合使用者提供的 R2 設定
- 新增 `/api/uploads/preview` 供教練看 private bucket 內的轉帳截圖

## 20260511_00 — 2026-05-11 (Initial bootstrap + 本機 e2e 驗證)

### e2e 驗證（25 項全綠，文件詳見 STATUS.md）
- 客戶日潛 / 旅行團預約 / Profile 讀寫
- 付款證明上傳 → 教練核可 → DB 自動更新 paymentStatus + status
- Admin stats / users / CSV / broadcast (Flex multicast)
- Webhook HMAC 驗章（bad sig → 401，valid sig → 200，follow event upsert user）
- Capacity check / role guard / cron token gating

### Minor fixes during testing
- `/api/bookings/my` 回傳補上 `participants` 欄位
- Webhook 歡迎訊息更新（移除過時的 "Phase 2 才會做完整 Rich Menu" 文案）
- 將 `r2.ts` 改為雙 bucket 模型（public / private），對應 user 提供的設定
- 新增 `/api/uploads/preview` 給教練看 private bucket 的轉帳截圖

### 已知 pending（等使用者提供）
- R2 access keys + bucket CORS
- 銀行匯款資訊 (BANK_*)

### Initial scope

從零打底完整 LIFF 訂閱 App，整合前一版 (20260507_LINE-haiwangzi) 的後端（Prisma schema + 18 條 API）並重寫前端。

### Added (初始建置)
- Next.js 16.2.3 + Tailwind v4 + shadcn/ui（New York / neutral，覆寫品牌 token）
- Brand: Logo / Wordmark / 色票（Deep Ocean #0A2342、Phosphor #00D9CB、Coral #FF7B5A、Gold #FFB800、Midnight #0F1B2D）
- 7 個客戶端頁面（welcome / calendar / dive/date / dive/trip / tour / tour/[id] / my / profile / payment）
- 3 個教練端頁面（coach/today / coach/payment / coach/schedule）
- 6 個 Admin 頁面（dashboard / users / bookings / broadcast / reports / settings）
- `useLiff()` hook + LiffProvider 含桌面 mock mode（`NEXT_PUBLIC_LIFF_MOCK=1`）
- 取消政策三層簽署（閱讀 → 同意 → 電子簽名）
- 旅行團訂金/尾款進度條（4 階段：預約 → 訂金 → 尾款 → 出發）
- 教練端「滑動確認 / 對話框預覽」收款核對流程
- R2 直傳：`POST /api/uploads/presign` 回 presigned PUT URL，client 直接 PUT binary 到 R2
- 付款上傳 page 有 R2 fallback → base64（無 R2 設定時走 dev fallback）
- `POST /api/admin/broadcast` Flex multicast + dry-run 預覽模式
- 8 個 Flex Message factory（`src/lib/flex/`）
- `POST /api/admin/richmenu/sync?role=...` 上傳 Rich Menu 到 LINE
- `scripts/build-richmenu.ts` 用 `@napi-rs/canvas` 產 2500×1686 PNG（三角色版本）
- `GET /api/cron/reminders?token=...` D-1 + D-3 + 出發前提醒（避免重複發 via `reminder_logs`）
- `/api/admin/bookings/csv` CSV 匯出（UTF-8 BOM 防 Excel 亂碼）
- `GET /api/me` + `PATCH /api/me`（profile 編輯）
- Webhook 路徑修正成新前端的 `/liff/calendar` `/liff/tour` `/liff/my` `/liff/admin`

### Infra
- `Dockerfile`（multi-stage, node:22-alpine, standalone）
- `.dockerignore`（排除 ux-design / postgres-data / node_modules / .env）
- `zeabur.json`
- `next.config.ts` 設 `output: "standalone"`，images.remotePatterns 加入 R2 與 LINE CDN
- `docker-compose.yml`（Postgres 16-alpine）

### Notes
- 教練滑動收款的 OCR 比對先做 UI（手動輸入後 5 碼）；真 OCR engine 不在本期範圍
- 線上金流不在本期範圍（設計上即為當日現場收 / 銀行匯款 + 截圖驗證）
- 多語系（i18n）不在本期範圍 — 全站固定繁體中文
