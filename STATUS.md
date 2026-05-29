# STATUS — 海王子潛水團 LIFF App

**Last update：** 2026-05-29
**Version：** `20260529_119`
**Phase：** ✅ 已上線 GitHub + Zeabur，持續迭代後台營運功能（會員 / 訂單結算 / VIP / 群發 / 場次）
**部署狀態：** 已推 GitHub、Zeabur 自動部署中

---

## 🆕 近期進度（v98 → v119，2026-05-28 ~ 05-29）

> 完整逐版說明見 [CHANGELOG.md](CHANGELOG.md)。以下為重點摘要。

### 訂單結算與付款
- **訂單結算全流程**（v105）：列表 quick actions（✓ 完成 / ✗ 未到場）、付款憑證審核（核可 / 拒絕）、退款百分比快選（80/100/110/120）、LV1 客戶限制現場付款
- **訂單管理 UX**（v102/v103/v109）：新增「時序 / 消費」狀態欄（已消費 / 未到場 / 待消費 / 待結算）、展開列 inline 操作欄（編輯 / 取消 / 永久刪除）

### 會員與 VIP
- **會員軟刪除**（v112）：封存 / 還原機制，保留訂單，軟刪除後無法登入（`403 user_deleted`）
- **VIP 設定表格化**（v104）+ **升等邏輯調整**（v117/v118/v119）：升等改為**僅看海王子累積潛水次數**，移除累計消費條件；手動改等級自動設潛水次數但不動真實累計消費

### 場次管理
- 集合地點拆兩欄（地點說明 + Google Map URL，v116）、狀態改 select dropdown（v117）、過期場次自動顯示「結束」且禁止改回「開放」（v113）、潛點選定詳情面板（v117）、操作欄分離取消/永久刪除（v110）

### 通知與 LIFF
- **群發通知頁重做**（v107）：雙預覽（LINE 氣泡 + Email 卡片）+ sticky footer + 動態收件人數；擴充單一客戶 / 場次參加者 audience（v104）
- **LIFF 加好友 gate**（v115）：強制加 OA 好友才能使用、新增 `/liff/add-friend`
- **LIFF Q&A / 關於頁**（v112）+ **後台操作說明頁**（v112/v114）含視覺化流程圖

### Dashboard / Cron / 基建
- Dashboard 新增「今日 / 7 天內新增」會員 + 訂單統計（v111）
- 3 個營運 cron（待結算提醒 / LV1 催繳 / 清舊憑證，v105）+ GitHub Actions 每日 08:00 觸發
- **DB schema 修復**（v98/v99/v100/v101/v116）：migrate-safety.js 補齊多張表漏欄位、修 BigInt build 失敗、修場次/訂單載入 500

---

## 🚀 立即可在 local 測試

Dev server **正在跑** → http://localhost:3001

`.env` 已設 `NEXT_PUBLIC_LIFF_MOCK=1`，桌面瀏覽器可直接走完整客戶/教練/Admin 流程，不需要連 LINE。
Mock user 是 `U_mock_dev_user_0001`，DB 中已設為 admin role，所以三種角色頁面都能進。

### 🔗 從這裡開始點

| 流程 | URL |
| --- | --- |
| **客戶首頁** | http://localhost:3001/liff/welcome |
| 月曆 | http://localhost:3001/liff/calendar |
| 旅行團 | http://localhost:3001/liff/tour |
| 我的預約 | http://localhost:3001/liff/my |
| Profile | http://localhost:3001/liff/profile |
| **教練：今日場次** | http://localhost:3001/liff/coach/today |
| 教練：付款核對 | http://localhost:3001/liff/coach/payment |
| 教練：排班 | http://localhost:3001/liff/coach/schedule |
| **Admin：主控台** | http://localhost:3001/liff/admin/dashboard |
| Admin：訂單 | http://localhost:3001/liff/admin/bookings |
| Admin：群發 | http://localhost:3001/liff/admin/broadcast |
| Admin：報表 | http://localhost:3001/liff/admin/reports |

🧪 開瀏覽器 devtools → Toggle device toolbar（Ctrl+Shift+M）→ 選 iPhone 14 Pro 之類的小螢幕，UX 是為手機設計的。
頁面頂部會看到金色的「🧪 桌面 Mock 模式」橫條提醒，這在 production 不會出現。

### 建議完整流程：
1. 開 `/liff/welcome` → 看 quick links + 海況卡
2. 點「日潛預約」→ 行事曆有 7 個有場次的日期（2026-05-13 ~ 2026-05-15）
3. 點某一格 → 看當日場次列表
4. 點任一場次 → 填預約表單（人數、裝備、個資、緊急聯絡人 → 三層簽署 ritual → 送出）
5. 自動跳回 `/liff/my` 看到新預約
6. 點「旅行團」→ 選蘭嶼或綠島 → 報名（用相同三層簽署）
7. 回 `/liff/my` → 旅行團那筆有「上傳付款」按鈕 → 進入付款頁
   - 拍/選任一張圖（會走 base64 fallback，因為 R2 keys 未設）
   - 送出 → 等 1.5s 跳回我的預約
8. 切到教練視角：`/liff/coach/today` 看今日場次（今天 5/11 暫無）→ `/liff/coach/payment` 看待核對的截圖 → 滑動或點對話框確認
9. 切到 Admin：`/liff/admin/dashboard` 看本季營收、轉帳待處理 → `/liff/admin/broadcast` 可發 dry-run 預覽 Flex（送到 mock IDs 會被 LINE 拒，delivered=0）

---

## ✅ 已完成（本機可驗證）

### Phase 0 — Bootstrap
- [x] Next.js 16.2.3 scaffold + 完整後端搬移（schema、18 條 API、docker-compose、env）
- [x] Tailwind v4 + shadcn/ui 手寫核心元件
- [x] `next.config.ts` `output: "standalone"`
- [x] Dockerfile / .dockerignore / zeabur.json
- [x] `APP_VERSION = 20260511_00` 顯示於 footer

### Phase 1 — 客戶 UI
- [x] 9 個頁面：welcome / calendar / dive/date / dive/trip / tour / tour/[id] / my / profile / payment
- [x] 取消政策三層簽署 ritual
- [x] 旅行團 4 階段進度條（預約 → 訂金 → 尾款 → 出發）
- [x] 夜潛 Midnight 模式自動切深色卡片
- [x] BottomNav + LiffShell + Logo SVG

### Phase 2 — R2 + 付款 + 教練端
- [x] 雙 bucket R2 (`payments/avatars` → private, `sites/richmenu` → public)
- [x] `POST /api/uploads/presign`（待 R2 keys 上線後生效）
- [x] `GET /api/uploads/preview`（教練看私密 bucket）
- [x] `POST /api/bookings/[id]/payment-proofs` 支援 r2Key + base64 雙模式
- [x] 教練 3 頁：today / payment / schedule

### Phase 3 — Admin
- [x] 6 頁：dashboard / users / bookings / broadcast / reports / settings
- [x] `POST /api/admin/broadcast`（multicast，無 token 時 dry-run 預覽）
- [x] `GET /api/admin/bookings/csv`（UTF-8 BOM）
- [x] `POST /api/admin/users` 角色切換
- [x] `GET /api/admin/stats`

### Phase 4 — LINE 整合
- [x] Webhook HMAC 簽章驗證（已實測：bad sig→401、valid sig→200、follow event upsert user）
- [x] 8 個 Flex Message factory (`src/lib/flex/*`)
- [x] `scripts/build-richmenu.ts`（@napi-rs/canvas）
- [x] `POST /api/admin/richmenu/sync?role=customer|coach|admin`
- [x] `GET /api/cron/reminders?token=...`（D-1 + D-3 + log 防重發）

---

## 📊 e2e 測試結果（25 項全綠）

| 範圍 | 測試項 | 結果 |
| --- | --- | --- |
| 客戶 | GET trip 詳情 + POST 日潛預約 + my bookings + capacity reject | ✅ |
| 客戶 | POST tour booking（含 deposit 計算）| ✅ |
| 客戶 | Profile GET/PATCH（notes + logCount）| ✅ |
| 教練 | coach/today 角色守衛（admin OK、customer 403）| ✅ |
| 教練 | 付款證明上傳→列表→核可→DB 自動更新 paymentStatus=deposit_paid + status=confirmed | ✅ |
| Admin | stats / users / CSV 匯出 | ✅ |
| Admin | broadcast 真實呼叫 LINE multicast（mock IDs 被 LINE 拒 delivered=0）| ✅ |
| Admin | 非 admin POST broadcast → 403 | ✅ |
| Webhook | 無簽章 / 假簽章 → 401 | ✅ |
| Webhook | valid HMAC-SHA256 → 200，follow event 自動 upsert User | ✅ |
| 安全 | cron 沒 token → 401，正確 token → 200 sent=[] | ✅ |

---

## 🟡 接下來需您補的設定

| 缺項 | 影響 | 您要做什麼 |
| --- | --- | --- |
| `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | 上傳走 base64 fallback，OK 但會直接存進 DB 字串欄位（大檔案會撐爆 Postgres） | 到 Cloudflare → R2 → Manage R2 API Tokens 建 token (Object R/W 限定到 haiwangzi-* 兩個 bucket) |
| R2 bucket CORS | 即使有 keys，瀏覽器 PUT 會 CORS 失敗 | 兩個 bucket 都套用 README/STATUS 內的 CORS JSON |
| `BANK_NAME` / `BANK_BRANCH` / `BANK_ACCOUNT` / `BANK_HOLDER` | 付款頁的匯款資訊區塊空白；訂金通知 Flex 顯示「—」| 填銀行 4 項 |

> 補完後我會做一輪「真機 e2e」：cloudflared tunnel → 手機 LINE 開 LIFF → 真實預約 → R2 上傳 → 教練核對 → 收 Flex 推播。
> 那一步通過後就可以 bump `APP_VERSION` → push GitHub → Zeabur 自動部署。

---

## 🚀 部署 Checklist（推 GitHub + Zeabur 前必做）

- [ ] **bump `src/lib/version.ts`**：`20260511_00` → `20260511_01`
- [ ] 更新 `CHANGELOG.md`
- [ ] `git init && git add -A && git commit -m "..."`
- [ ] `git remote add origin <github-url> && git push -u origin main`
- [ ] Zeabur 開 service + Postgres add-on，把 `DATABASE_URL` 連到 service
- [ ] Zeabur 填所有環境變數
- [ ] LINE LIFF console endpoint URL 指向 Zeabur 網域
- [ ] LINE Messaging webhook URL → `https://<zeabur>/api/webhook`
- [ ] Cronicle (https://neowu-cron-hub.zeabur.app) 設 job：每 30 分鐘 POST `/api/cron/reminders?pollWindowMinutes=30` with `Authorization: Bearer $HAIWANGZI_CRON_SECRET`（詳見 `docs/CRON_SETUP.md`）
- [ ] `npm run richmenu:build` → 上傳 `POST /api/admin/richmenu/sync?role=customer`（再跑 coach / admin）
- [ ] 真機跑一輪：預約 → 上傳付款 → 教練核對 → 收 Flex

---

## 📁 重點檔案位置

- 品牌色 token：[src/app/globals.css](src/app/globals.css) (`@theme`)
- Logo：[src/components/brand/Logo.tsx](src/components/brand/Logo.tsx)
- LIFF hook：[src/lib/liff/LiffProvider.tsx](src/lib/liff/LiffProvider.tsx)
- 後端 auth：[src/lib/auth.ts](src/lib/auth.ts)（LIFF idToken via jose JWKS）
- R2：[src/lib/r2.ts](src/lib/r2.ts)
- Flex factories：[src/lib/flex/](src/lib/flex/)
- Rich Menu 產生：[scripts/build-richmenu.ts](scripts/build-richmenu.ts)
- 版本：[src/lib/version.ts](src/lib/version.ts)
