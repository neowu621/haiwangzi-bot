# 東北角海王子潛水團 — LIFF 訂閱 App

> 海王子潛水團的 LINE LIFF 應用：客戶手機預約日潛 / 旅遊潛水，
> 教練水邊單手核對收款，Admin 遠端管理排班、群發 Flex Message，
> 後端排程自動推 D-1 行前提醒、訂金/尾款催繳。

**Production**: https://haiwangzi.zeabur.app  
**LIFF Entry**: https://liff.line.me/2010006458-fyokMnVv  
**當前版本**: `20260513_03`

---

## 目錄

1. [快速開始](#快速開始)
2. [技術堆疊](#技術堆疊)
3. [專案架構](#專案架構)
4. [資料庫 Schema (8 個 models)](#資料庫-schema)
5. [API 路由總覽](#api-路由總覽)
6. [前端頁面總覽](#前端頁面總覽)
7. [關鍵業務流程](#關鍵業務流程)
8. [外部服務整合](#外部服務整合)
9. [環境變數](#環境變數)
10. [部署 (Zeabur)](#部署-zeabur)
11. [Cron / 排程 (Cronicle)](#cron--排程)
12. [安全機制](#安全機制)
13. [品牌 / 設計系統](#品牌--設計系統)
14. [開發守則](#開發守則)
15. [疑難排解](#疑難排解)

---

## 快速開始

### 前置

- Node.js 22+
- Docker Desktop (跑本機 Postgres)
- LINE Developer 帳號（取得 LIFF ID / Channel access token / Secret）
- Cloudflare R2 帳號（兩個 bucket：public / private）

### 步驟

```bash
# 1. clone + install
git clone https://github.com/neowu621/haiwangzi-bot.git
cd haiwangzi-bot
npm install

# 2. 設定 .env (複製 .env.example 後填入您的值)
cp .env.example .env

# 3. 啟動本機 Postgres + 建表
docker compose up -d postgres
npx prisma db push
npx tsx prisma/seed.ts   # (選用) 預載 dive sites + coaches + 30 天 trips

# 4. 跑開發伺服器
npm run dev
# → http://localhost:3000
```

### 開發 / Mock 模式

- 桌面測試免 LINE：`.env` 設 `NEXT_PUBLIC_LIFF_MOCK=1`，所有 LIFF 呼叫走假 user `U_mock_dev_user_0001`
- 手機真機測試：`NEXT_PUBLIC_LIFF_MOCK=0`，然後用 `cloudflared tunnel --url http://localhost:3000` 拿 HTTPS URL 設給 LINE LIFF endpoint

---

## 技術堆疊

| 層 | 選擇 | 版本 |
|---|---|---|
| **框架** | Next.js (App Router + Turbopack) | 16.2.3 |
| **語言** | TypeScript | 5 |
| **UI 函式庫** | React | 19.2 |
| **樣式** | Tailwind v4 + shadcn/ui (New York / neutral) | tailwindcss@next |
| **ORM** | Prisma | 6.19 |
| **資料庫** | PostgreSQL | 16 |
| **LINE** | `@line/liff` (前端) + `@line/bot-sdk` (後端) | 2.28 / 9.5 |
| **JWT 驗證** | `jose` (Remote JWKS for LIFF idToken) | — |
| **驗證** | Zod | 3.25 |
| **物件儲存** | Cloudflare R2 (`@aws-sdk/client-s3` + s3-request-presigner) | — |
| **圖像生成** | `@napi-rs/canvas` (Rich Menu PNG) | — |
| **容器** | Docker (multi-stage) | — |
| **部署** | Zeabur (Production) + Cronicle (排程) | — |

---

## 專案架構

```
haiwangzi-bot/
├─ prisma/
│  ├─ schema.prisma           # 8 個 models（見下方）
│  └─ seed.ts                 # 預載 dive sites + coaches + trips + tours
├─ src/
│  ├─ app/
│  │  ├─ page.tsx             # / (Landing page，給桌面瀏覽器)
│  │  ├─ layout.tsx           # root layout + LiffProvider
│  │  ├─ globals.css          # Tailwind v4 + 品牌 @theme tokens
│  │  ├─ api/                 # 28 個 API routes
│  │  │  ├─ healthz/                # ping
│  │  │  ├─ dbcheck/                # DB 連通 + count
│  │  │  ├─ config/                 # liffId + bank (for FE)
│  │  │  ├─ me/                     # 客戶 profile + companions CRUD
│  │  │  ├─ trips/                  # 日潛場次（公開）
│  │  │  ├─ tours/                  # 旅行團（公開）
│  │  │  ├─ bookings/
│  │  │  │  ├─ daily/route.ts       # 建立日潛預約
│  │  │  │  ├─ tour/route.ts        # 建立旅行團預約
│  │  │  │  ├─ my/route.ts          # 我的預約清單
│  │  │  │  └─ [id]/
│  │  │  │      ├─ route.ts         # PATCH 編輯 / DELETE 取消
│  │  │  │      └─ payment-proofs/  # 上傳付款證明
│  │  │  ├─ coach/
│  │  │  │  ├─ today/               # 今日場次
│  │  │  │  ├─ payment-proofs/      # 滑動核對收款
│  │  │  │  └─ trips/weather-cancel # 天氣取消
│  │  │  ├─ admin/
│  │  │  │  ├─ stats/               # 後台統計
│  │  │  │  ├─ bookings/            # 訂單管理 + CSV
│  │  │  │  ├─ users/               # 會員管理
│  │  │  │  ├─ broadcast/           # Flex 群發
│  │  │  │  ├─ richmenu/sync/       # Rich Menu 上傳
│  │  │  │  ├─ seed/                # (Dev) seed data
│  │  │  │  └─ bootstrap/           # 第一次設定
│  │  │  ├─ uploads/
│  │  │  │  ├─ presign/             # 取 R2 presigned PUT URL
│  │  │  │  └─ preview/             # 取 private bucket 的 presigned GET URL
│  │  │  ├─ webhook/                # LINE Messaging API webhook (HMAC 驗章)
│  │  │  └─ cron/reminders/         # 每 30 分鐘觸發 (Bearer auth)
│  │  └─ liff/                # 17 個 LIFF 頁面（見下方）
│  ├─ components/
│  │  ├─ shell/               # LiffShell / BottomNavShell / AdminShell
│  │  ├─ brand/               # Logo (純 SVG)
│  │  └─ ui/                  # shadcn primitives
│  └─ lib/
│     ├─ prisma.ts            # singleton PrismaClient
│     ├─ auth.ts              # LIFF idToken JWKS 驗章 + ?lineUserId dev fallback
│     ├─ liff/                # LiffProvider, fetchWithAuth, mock mode
│     ├─ r2.ts                # 雙 bucket R2 client + presign helpers
│     ├─ line.ts              # @line/bot-sdk Messaging API client
│     ├─ flex/                # 8 種 Flex Message factory
│     └─ version.ts           # APP_VERSION (每次 publish bump)
├─ scripts/
│  └─ build-richmenu.ts       # 產 2500×1686 Rich Menu PNG
├─ docs/
│  └─ CRON_SETUP.md           # Cronicle 設定 SOP
├─ Dockerfile                 # multi-stage (deps → build → runner)
├─ docker-entrypoint.sh       # prisma db push + node server.js
├─ docker-compose.yml         # 本機 Postgres
├─ .dockerignore
├─ zeabur.json                # Zeabur 部署設定
├─ next.config.ts             # output: "standalone"
└─ tsconfig.json
```

---

## 資料庫 Schema

8 個 model（位於 `prisma/schema.prisma`）：

### 1. `User` — LINE 使用者
| 欄位 | 型別 | 說明 |
|---|---|---|
| `lineUserId` PK | VarChar(64) | LIFF idToken 的 sub |
| `displayName` | String | 從 LINE profile |
| `realName` | String? | 預約時填的本名 |
| `phone`, `cert`, `certNumber`, `logCount` | — | 個資 |
| `emergencyContact` | Json? | `{name, phone, relationship}` |
| `role` | enum | `customer` / `coach` / `admin` |
| `companions` | Json | 常用同伴清單 (預約時可一鍵帶入) |

### 2. `DiveSite` — 潛點
6 個 seed：龍洞 82.8 / 鶯歌石 / 深奧 / 潮境公園 / 綠島大白沙 / 蘭嶼八代灣

### 3. `Coach` — 教練（與 User 可選綁定）
3 個 seed：阿志(Instructor) / 小林(DM) / 海王子老闆(CourseDirector)

### 4. `DivingTrip` — 日潛場次
- `date` + `startTime` + `tankCount`
- `coachIds` + `diveSiteIds`
- `pricing` Json: `{baseTrip, extraTank, nightDive, scooterRental}`
- `isNightDive`, `isScooter`
- `status`: `open` / `full` / `cancelled` / `completed`

### 5. `TourPackage` — 旅行團
- `dateStart` + `dateEnd`
- `basePrice` + `deposit`
- `depositDeadline` + `finalDeadline`
- `addons` Json
- 2 seed：蘭嶼四天三夜潛旅 / 綠島三天兩夜水推團

### 6. `Booking` — 預約（多型 FK）
- `type`: `daily` / `tour`
- `refId`: 指向 DivingTrip 或 TourPackage（依 type）
- `participants` + `participantDetails` Json（每位參加者明細，第一位 isSelf=true）
- `rentalGear` Json: `[{itemType, price, qty}]`
- `totalAmount` / `depositAmount` / `paidAmount`
- `paymentStatus`: `pending` / `deposit_paid` / `fully_paid` / `refunding` / `refunded`
- `status`: `pending` / `confirmed` / `cancelled_by_user` / `cancelled_by_weather` / `completed` / `no_show`
- `agreedToTermsAt` — 簽署時間（取消政策三層簽署）

### 7. `PaymentProof` — 轉帳截圖
- `bookingId` FK
- `type`: `deposit` / `final` / `refund`
- `amount` + `imageKey` (R2 key)
- `verifiedBy` (User.lineUserId) + `verifiedAt`

### 8. `ReminderLog` — 推播紀錄（用來 dedup）
- `bookingId` + `type` (e.g. `d1_reminder`, `final_reminder`)
- `sentAt` + `channel`
- `error` (失敗才填，用來 debug)

---

## API 路由總覽

**驗證機制**：所有需要使用者身分的 endpoint 走 `authFromRequest()`，接受兩種：
- 正式：`Authorization: Bearer <LIFF idToken>` → 用 jose 驗 LINE JWKS
- Dev only：`?lineUserId=Uxxx` query string fallback（production 不允許）

### 公開 (無驗證)

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/healthz` | ping + 回 APP_VERSION |
| GET | `/api/dbcheck` | DB 連通檢查 + count |
| GET | `/api/config` | 給前端：`liffId`, `bank` |
| GET | `/api/trips` | 列出所有 open 場次 |
| GET | `/api/trips/[id]` | 單一場次（含 booked / available / sites / coaches） |
| GET | `/api/tours` | 列出旅行團 |
| GET | `/api/tours/[id]` | 單一旅行團 |

### 需 LIFF 登入

| Method | Path | 用途 |
|---|---|---|
| GET / PATCH | `/api/me` | 取/改個資 + 同伴 |
| POST | `/api/bookings/daily` | 建立日潛預約 |
| POST | `/api/bookings/tour` | 建立旅行團預約 |
| GET | `/api/bookings/my` | 我的預約清單 (含 paymentProofs) |
| PATCH | `/api/bookings/[id]` | 編輯訂單（人數 / 裝備 / 備註） |
| DELETE | `/api/bookings/[id]` | 取消訂單 |
| POST | `/api/bookings/[id]/payment-proofs` | 註冊上傳完成的付款截圖 |
| POST | `/api/uploads/presign` | 取 R2 presigned PUT URL |
| GET | `/api/uploads/preview` | 取 private 圖片的 presigned GET URL |

### Coach 角色

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/coach/today` | 今日場次 + 未收款警示 |
| POST | `/api/coach/payment-proofs` | approve/reject 收款核對 |
| POST | `/api/coach/trips/weather-cancel` | 天氣取消整場 (退費 + 推播) |

### Admin 角色

| Method | Path | 用途 |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard 統計 |
| GET | `/api/admin/bookings` | 所有訂單 |
| GET | `/api/admin/bookings/csv` | CSV 匯出 |
| GET | `/api/admin/users` | 會員管理 |
| POST | `/api/admin/broadcast` | Flex / 純文字 multicast |
| POST | `/api/admin/richmenu/sync` | 上傳 Rich Menu PNG + 綁定預設 |
| POST | `/api/admin/seed` | (Dev) 重置 seed |
| POST | `/api/admin/bootstrap` | 第一次設定 |

### LINE 平台

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/webhook` | LINE Messaging API webhook (HMAC 驗章) |

### Cron

| Method | Path | Auth | 用途 |
|---|---|---|---|
| POST / GET | `/api/cron/reminders` | `Authorization: Bearer <CRON_SECRET>` | D-1 / 尾款提醒推播 |

---

## 前端頁面總覽

### 客戶端 (9 頁)

| 路徑 | 內容 |
|---|---|
| `/` | Landing page（給桌面瀏覽器分享連結用） |
| `/liff/welcome` | 歡迎頁 + 4 卡片快捷 + 海況預告 |
| `/liff/calendar` | 行事曆（近 2 週 + 本月 view） |
| `/liff/dive/date/[date]` | 當日場次清單 |
| `/liff/dive/trip/[tripId]` | 日潛預約表單 (可折疊個資 + 同伴) |
| `/liff/tour` | 旅行團列表 |
| `/liff/tour/[packageId]` | 旅行團詳情 |
| `/liff/my` | 我的預約（即將前往 / 已完成 / 已取消） |
| `/liff/profile` | 個人資料 + 同伴 CRUD |
| `/liff/payment/[bookingId]` | 上傳付款證明 |

### 教練端 (3 頁)

| 路徑 | 內容 |
|---|---|
| `/liff/coach/today` | 今日場次 |
| `/liff/coach/payment` | 滑動確認收款 |
| `/liff/coach/schedule` | 本期排班 |

### Admin 端 (6 頁)

| 路徑 | 內容 |
|---|---|
| `/liff/admin` | Admin 入口 |
| `/liff/admin/dashboard` | 統計儀表板 |
| `/liff/admin/bookings` | 訂單管理 |
| `/liff/admin/users` | 會員管理 |
| `/liff/admin/broadcast` | 群發推播 |
| `/liff/admin/reports` | 營運報表 + CSV 匯出 |
| `/liff/admin/settings` | 系統設定（env 提示） |

---

## 關鍵業務流程

### 1. 客戶日潛預約 → 推播鏈路

```
客戶 LIFF → /liff/calendar → 選日期/場次
  ↓
/liff/dive/trip/[id]
  ↓  POST /api/bookings/daily   (Booking row created, status=confirmed)
回到 /liff/my (booking 顯示「即將前往」)
  ↓
[D-1 18:00] Cronicle 觸發 /api/cron/reminders
  ↓  buildFlexByKey("d1_reminder", ...)
  ↓  LINE push to user
客戶手機 LINE 收到「明日 08:00 行前提醒」Flex 卡片
```

### 2. 旅行團訂金/尾款流程

```
客戶 → /liff/tour/[id] → POST /api/bookings/tour
  ↓ (booking 進入 status=pending, paymentStatus=pending)
  
客戶 → /liff/payment/[bookingId]
  ↓ POST /api/uploads/presign  (取 R2 URL)
  ↓ PUT to R2 (直傳轉帳截圖)
  ↓ POST /api/bookings/[id]/payment-proofs  (註冊到 DB)

教練 → /liff/coach/payment
  ↓ 滑動 → POST /api/coach/payment-proofs {approve: true}
  ↓ Booking.paidAmount += amount; paymentStatus → deposit_paid
  ↓ buildFlexByKey("deposit_confirm") → push to 客戶

[尾款截止 3 天前] Cronicle → /api/cron/reminders
  ↓ for tours starting in 3 days, deposit_paid bookings
  ↓ buildFlexByKey("final_reminder") → push 客戶
```

### 3. 取消政策三層簽署

預約表單必須完成才能送出：
1. ✅ 我已閱讀並理解取消政策
2. ✅ 同意，並準備簽署
3. ✅ 輸入姓名作為電子簽署（手寫體）

時間戳寫入 `Booking.agreedToTermsAt`。

### 4. 8 個 Flex Message 模板

位於 `src/lib/flex/`：

| Key | 觸發時機 |
|---|---|
| `booking_confirm` | 預約成功（即時 push） |
| `d1_reminder` | 出發前 1 天（cron） |
| `deposit_notice` | 旅行團預約成功（即時 push） |
| `deposit_confirm` | 教練 approve 訂金（即時 push） |
| `final_reminder` | 旅行團尾款截止前 3 天（cron） |
| `trip_guide` | 旅行團出發前行前手冊 |
| `weather_cancel` | 教練按天氣取消（即時 push） |
| `admin_weekly` | Admin 週報摘要 |

---

## 外部服務整合

### LINE LIFF + Messaging API

- **LIFF App** (Channel `2010006458`)：endpoint `https://haiwangzi.zeabur.app/liff/welcome`，Size = Full，Scopes = `openid` + `profile`
- **Messaging Channel**：webhook `https://haiwangzi.zeabur.app/api/webhook`（HMAC 驗章）
- **idToken** 由 `@line/liff` SDK 取，後端 `jose.jwtVerify()` 用 LINE 公開 JWKS 驗章

### Cloudflare R2 (雙 bucket)

| Bucket | 用途 | 存取 |
|---|---|---|
| `haiwangzi-public` | 潛點照片 / Rich Menu / 頭像 | 公開 URL (`pub-xxx.r2.dev`) |
| `haiwangzi-private` | 轉帳截圖 / 敏感檔 | Presigned GET URL only |

**CORS 設定**（兩個 bucket）：
```json
{
  "AllowedOrigins": ["https://haiwangzi.zeabur.app", "https://liff.line.me", "http://localhost:3000"],
  "AllowedMethods": ["GET", "PUT", "HEAD"],
  "AllowedHeaders": ["Content-Type", "Content-Length", "Content-Disposition", "x-amz-acl"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

**API token** 在 Cloudflare R2 → 「帳戶 API Token」生（Account-scope, Object Read & Write, Specific buckets）。

### Cronicle (Automation-Hub)

獨立 Zeabur project (`Automation-Hub`)，跑 Cronicle template，跨專案共用。
Web UI: https://neowu-cron-hub.zeabur.app

設定詳見 [`docs/CRON_SETUP.md`](./docs/CRON_SETUP.md)。

---

## 環境變數

完整清單見 `.env.example`。重要的：

| 變數 | 用途 | 範例 |
|---|---|---|
| `DATABASE_URL` | Postgres 連線 | `postgresql://...` |
| `LINE_CHANNEL_ACCESS_TOKEN` | Messaging API push | 從 LINE Developers Console |
| `LINE_CHANNEL_SECRET` | Webhook HMAC | 從 LINE Developers Console |
| `LINE_LIFF_ID` / `NEXT_PUBLIC_LIFF_ID` | LIFF App ID | `2010006458-fyokMnVv` |
| `JWT_SECRET` | (未來使用) | `openssl rand -hex 32` |
| `CRON_SECRET` | Cron Bearer auth | `openssl rand -hex 32`（要與 Cronicle 端的 `HAIWANGZI_CRON_SECRET` 同值） |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Cloudflare 帳戶 API Token |
| `R2_PUBLIC_BUCKET` / `R2_PRIVATE_BUCKET` | bucket 名稱 | `haiwangzi-public` / `haiwangzi-private` |
| `R2_ENDPOINT` | R2 endpoint | `https://<account>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_URL` | 公開 bucket URL base | `https://pub-xxx.r2.dev` |
| `BANK_NAME` / `BANK_BRANCH` / `BANK_ACCOUNT` / `BANK_HOLDER` | 匯款資訊（顯示於 Flex） | 中國信託 822 / 484540139251 / 汪教練 |
| `NEXT_PUBLIC_BASE_URL` | 用於 Flex 內 deep link | `https://haiwangzi.zeabur.app` |
| `NEXT_PUBLIC_LIFF_MOCK` | 桌面測試開關 | `1`=mock, `0`=真實 LIFF |

---

## 部署 (Zeabur)

### Production 架構

| Service | 位置 | 內容 |
|---|---|---|
| `haiwangzi-bot` | Zeabur project `Haiwangzi-Diving` | Next.js standalone (Docker) |
| `postgresql` | 同上 | Postgres 16 (Zeabur add-on) |
| `cronicle` | Zeabur project `Automation-Hub` | 跨專案共用排程 |

### Dockerfile (multi-stage)

```dockerfile
# Stage 1: deps (with --include=dev to override NODE_ENV=production)
FROM node:22-alpine AS deps
RUN npm ci --include=dev --no-audit --no-fund

# Stage 2: build
FROM node:22-alpine AS builder
RUN npx prisma generate && npm run build

# Stage 3: runner (production)
FROM node:22-alpine AS runner
ENV NODE_ENV=production
# 必須在 COPY @prisma 之前 install prisma（不然 npm 看到目錄就不解析 deps）
RUN npm install --no-save prisma@6.19.3 @prisma/client@6.19.3
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
```

### 啟動腳本 `docker-entrypoint.sh`

```bash
npx prisma db push --skip-generate
exec node server.js
```

### Zeabur 設定要點

1. `next.config.ts` 必須 `output: "standalone"`
2. `.dockerignore` 排除 `node_modules` / `.next` / `.env` / `.git` / `postgres-data`
3. `zeabur.json` 宣告 build/start
4. 首次上線前 push 必須含 Dockerfile + docker-entrypoint.sh
5. 全部 env 變數在 Zeabur Variables tab 設定

### 發版 SOP

```bash
# 1. bump 版本
# 編輯 src/lib/version.ts → APP_VERSION = "YYYYMMDD_NN"

# 2. 寫 CHANGELOG
# 編輯 CHANGELOG.md 加新版段落

# 3. commit + push
git add .
git commit -m "feat: ..."
git push origin master
# → Zeabur 自動偵測 + redeploy
```

---

## Cron / 排程

由 **Cronicle (Automation-Hub project)** 觸發，不用 Zeabur Cron。

### Endpoint: `/api/cron/reminders`

- Method: `POST` (or `GET` 手動測試)
- Auth: `Authorization: Bearer <CRON_SECRET>`
- Query: `?pollWindowMinutes=30`（選填，預設 30）
- Dedup: 透過 `ReminderLog` 表（同一 booking + type 只發一次）

### Cronicle Job

```bash
#!/bin/sh
set -e
curl -fsS -X POST \
  -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" \
  "$HAIWANGZI_BASE_URL/api/cron/reminders?pollWindowMinutes=30"
```

排程：`*/30 * * * *`（每 30 分鐘）

詳見 [`docs/CRON_SETUP.md`](./docs/CRON_SETUP.md)。

---

## 安全機制

| 層 | 機制 |
|---|---|
| LIFF auth | `jose.jwtVerify()` against LINE JWKS (https://api.line.me/oauth2/v2.1/certs) |
| Webhook | HMAC-SHA256 簽章（`crypto.timingSafeEqual` against raw body） |
| Cron | Bearer token (`CRON_SECRET`) header |
| Role-gating | `requireRole(user, ["admin"])` middleware on admin/coach endpoints |
| R2 直傳 | Presigned PUT URL，5 分鐘 TTL |
| Private 圖片 | Presigned GET URL 才能存取 |
| CORS | 限定 `https://haiwangzi.zeabur.app`, `https://liff.line.me`, `http://localhost:3000` |
| 環境變數 | Zeabur dashboard 管理，不入 git |

---

## 品牌 / 設計系統

### 色票（Tailwind v4 `@theme` tokens）

| Name | Value | 用途 |
|---|---|---|
| `--color-ocean-deep` | `#0A2342` | 主背景 / Header |
| `--color-ocean-surface` | `#1B3A5C` | 卡片標題、Footer |
| `--color-phosphor` | `#00D9CB` | Primary CTA / 強調 |
| `--color-coral` | `#FF7B5A` | 警示 / 金額 |
| `--color-gold` | `#FFB800` | Highlight / 夜潛 badge |
| `--color-midnight-bg` | `#0F1B2D` | 夜潛主題背景 |

### 字型

- 主字型：Noto Sans TC
- 數字（金額/支數）：Inter (tabular)
- 簽名：Brush Script MT / DFKai-SB

### Shell 組件

| Shell | 用途 |
|---|---|
| `LiffShell` | 客戶端常用（Logo + title + back + rightSlot） |
| `BottomNavShell` | 包含底部 4-tab nav（日潛/旅行團/我的/個人） |
| `AdminShell` | Admin 後台 |

---

## 開發守則

### 版本號規則 (user CLAUDE.md)

`APP_VERSION = "YYYYMMDD_NN"`，**NN 全域累計、不歸零**。  
每次 push GitHub 都需要 bump，並更新 `CHANGELOG.md`。

例：`20260512_02` → `20260513_03` → `20260514_04` ...

### 部署檢查清單

1. `Dockerfile` + `docker-entrypoint.sh` + `.dockerignore` + `zeabur.json` 必須在**首次 push 前齊全**
2. `next.config.ts` 必須含 `output: "standalone"`
3. `git status` 確認沒有遺漏的 untracked / deleted files
4. 不 push `.env`
5. `.env.example` 必須與實際所需 env 同步

### Next.js 16 特別注意

- `middleware.ts` 和 `proxy.ts` **不能同時存在**（用 `proxy.ts`）
- 必須讀 `node_modules/next/dist/docs/` 內最新文件，不能依賴訓練資料
- Route handler params 是 Promise（`use(params)` 解開）

### 推 GitHub 規矩

> 「未來需要我同意才可以 push github」— 使用者規定。  
> 推任何 code 前都必須先得到使用者口頭同意。

---

## 疑難排解

### LIFF 跳出 "The permission is not in LIFF app scope"

- 到 LINE Developers Console → 您的 LIFF App → 勾選 `openid` + `profile`
- 手機重新授權：移除 bot 好友 → 重新加 → 點 LIFF link 第一次會跳允許對話框

### Zeabur build 失敗 "Cannot find module '@tailwindcss/postcss'"

- 確認 `tailwindcss` + `@tailwindcss/postcss` 在 `dependencies`（不是 devDependencies）
- 確認 Dockerfile 用 `npm ci --include=dev`

### 圖片上傳瀏覽器報 CORS error

- Cloudflare R2 → bucket → Settings → CORS Policy 確認允許您的 origin
- 兩個 bucket 都要設

### Cron 沒推播

- Cronicle 端 `HAIWANGZI_CRON_SECRET` 必須與 Zeabur 端 `CRON_SECRET` 同值
- 401 = secret 不對；500 = `CRON_SECRET` 未設
- 看 Cronicle Web UI 的 Job History 紀錄

### Production 用 Tailwind v4 + Turbopack 偶爾 HMR flaky

- 開發階段先用 `next dev`（webpack）做 theme 微調
- App code 工作時才開 `--turbopack`

---

## 授權與聯絡

私有專案 — 海王子潛水團專用。  
維護者：neowu（GitHub: @neowu621）  
Email: neowu62@gmail.com

---

_Generated and maintained for 東北角海王子潛水團 LIFF App project_  
_當前版本：`20260513_03`_
