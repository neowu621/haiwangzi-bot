# Changelog

版本規則：`YYYYMMDD_NN`，NN 為跨日累計、不歸零的計數器。每次 push GitHub 都需要 bump。

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
