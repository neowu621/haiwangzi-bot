# 海王子潛水團 LIFF App — 網頁架構說明

版本：`20260511_00`｜最後更新：2026-05-11

---

## 1. 技術堆疊

| 層 | 選擇 | 為什麼 |
| --- | --- | --- |
| **框架** | Next.js 16.2.3 App Router + React 19.2 + Turbopack | 同時跑 LIFF 前端 + REST API；server components 可直接打 Prisma；standalone build 可裝 Docker |
| **語言** | TypeScript 5 + Zod | 端對端型別 + runtime 驗證 |
| **樣式** | Tailwind v4 + shadcn/ui（手寫核心元件） | mobile-first、token 化、無 CSS-in-JS runtime cost |
| **品牌系統** | CSS custom properties `@theme` | 一個檔切換 dark/midnight、所有元件吃 token |
| **資料庫** | PostgreSQL 16 + Prisma 6.19 | 完整 type-safe DB layer + migration |
| **LINE** | `@line/liff` 2.28、`@line/bot-sdk` 9.5 | LIFF 內嵌瀏覽器 + Messaging API |
| **認證** | `jose` 驗 LIFF idToken via LINE JWKS → User row | server 不存 session，每 req 驗 token |
| **圖床** | Cloudflare R2（雙 bucket: public / private） | S3-compatible、無 egress 費、presigned PUT 直傳 |
| **圖像生成** | `@napi-rs/canvas` | Rich Menu 2500×1686 PNG，Windows + Alpine 都跑 |
| **部署** | Docker multi-stage → Zeabur + Postgres add-on | 一鍵部署、cron 支援 |

---

## 2. 整體結構（俯瞰圖）

```
東北角海王子潛水團 LIFF App
│
├── 🌐 客戶端 (LIFF in LINE)
│    ├── /liff/welcome           主入口
│    ├── /liff/calendar          日潛行事曆（3 檢視）
│    ├── /liff/dive/date/[date]  當日場次清單
│    ├── /liff/dive/trip/[id]    日潛預約表單（三層簽署）
│    ├── /liff/tour              旅行團列表
│    ├── /liff/tour/[id]         旅行團詳情 + 報名
│    ├── /liff/my                我的預約
│    ├── /liff/profile           個人資料
│    └── /liff/payment/[id]      上傳轉帳截圖
│
├── 🤿 教練端 (role=coach/admin)
│    ├── /liff/coach/today       今日場次 + 報名清單
│    ├── /liff/coach/payment     滑動核對轉帳
│    └── /liff/coach/schedule    本期排班
│
├── ⚙ Admin 端 (role=admin)
│    ├── /liff/admin/dashboard   主控台
│    ├── /liff/admin/bookings    所有訂單 + CSV 匯出
│    ├── /liff/admin/users       會員 + role 切換
│    ├── /liff/admin/broadcast   Flex / 純文字群發
│    ├── /liff/admin/reports     營運報表
│    └── /liff/admin/settings    系統設定
│
├── 🔌 API (28 條)
│    ├── 公開 / health
│    ├── 客戶資料 (auth required)
│    ├── 教練 (role-gated)
│    ├── Admin (role-gated)
│    ├── R2 上傳
│    ├── LINE webhook + cron
│    └── 推播
│
└── 🗄️ PostgreSQL (8 個 model)
     User · Coach · DiveSite · DivingTrip · TourPackage
     Booking · PaymentProof · ReminderLog
```

---

## 3. 客戶端流程（最重要的轉換漏斗）

```
welcome
   │
   ├──→ calendar  ──→  dive/date/[date]  ──→  dive/trip/[tripId]  ──┐
   │     (三檢視)                                                  │
   │                                                       三層簽署
   ├──→ tour      ──→  tour/[packageId]                            │
   │                                                                │
   └──→ my  ←─────────────────────────────────────────────  POST /api/bookings/daily
            │                                                       OR
            └──→ payment/[bookingId]  ──→ R2 PUT direct  ──→  POST /api/bookings/tour
                                            │
                                            ▼
                                    coach/payment
                                    (滑動 ✓/X)
                                            │
                                            ▼
                                    Booking.paymentStatus 更新
                                    LINE Push Flex (預約確認 / 訂金確認)
```

### 3.1 取消政策三層簽署 ritual

設計目的：未來客訴退款糾紛時，有完整法律舉證鏈（看過 → 同意 → 簽名）

```
[ ] 1. 我已閱讀並理解取消政策    （勾選後解鎖第 2 步）
[ ] 2. 同意，並準備簽署            （勾選後展開第 3 步）
[ ] 3. 輸入姓名做電子簽署          （手寫風字型 + 大字級）
   └─→ 才能按下「確認預約」
       └─→ Booking.agreedToTermsAt = now()
```

### 3.2 旅行團 4 階段付款進度

```
1. 預約建立      Booking.status = pending
2. 訂金已繳      paymentStatus = deposit_paid, status = confirmed
3. 尾款已繳      paymentStatus = fully_paid
4. 出發完成      status = completed
```

每階段都會在 `/liff/my` 進度條上點亮 + 觸發對應 Flex Message。

---

## 4. 完整頁面清單（17 頁）

### 4.1 客戶端 9 頁

| 路徑 | 檔案 | 主要功能 |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | 自動 redirect → `/liff/welcome` |
| `/liff/welcome` | `src/app/liff/welcome/page.tsx` | 主入口：4-grid 快捷、海況卡、LINE 登入按鈕 |
| `/liff/calendar` | `src/app/liff/calendar/page.tsx` | 行事曆 3 檢視（本週 / 近 3 週 / 整月）、AM/PM/夜潛色點、本期場次預覽 |
| `/liff/dive/date/[date]` | `src/app/liff/dive/date/[date]/page.tsx` | 當日場次卡片列表（夜潛自動切 Midnight 深色模式） |
| `/liff/dive/trip/[tripId]` | `src/app/liff/dive/trip/[tripId]/page.tsx` | **日潛預約表單**（人數、裝備、個資、緊急聯絡人、三層簽署） |
| `/liff/tour` | `src/app/liff/tour/page.tsx` | 旅行團列表卡 |
| `/liff/tour/[packageId]` | `src/app/liff/tour/[packageId]/page.tsx` | **旅行團詳情 + 報名**（含/不含、加購、訂金/尾款政策） |
| `/liff/my` | `src/app/liff/my/page.tsx` | 我的預約：即將前往 / 已完成 / 已取消三分頁、進度條 |
| `/liff/profile` | `src/app/liff/profile/page.tsx` | 個人資料：證照、累計 logs、緊急聯絡人、醫療備註 |
| `/liff/payment/[bookingId]` | `src/app/liff/payment/[bookingId]/page.tsx` | 上傳轉帳截圖（拍照 / 相簿 → R2 直傳 / base64 fallback） |

### 4.2 教練端 3 頁（role: coach / admin）

| 路徑 | 主要功能 |
| --- | --- |
| `/liff/coach/today` | 今日場次卡，每場次展開報名清單（姓名、證照、logs、租賃、未收款額警示） |
| `/liff/coach/payment` | 滑動核對轉帳截圖：點縮圖看放大 → 左 X 拒 / 右 ✓ 確認入帳 |
| `/liff/coach/schedule` | 未來 14 天的場次排班列表（含夜潛標記） |

### 4.3 Admin 端 6 頁（role: admin）

| 路徑 | 主要功能 |
| --- | --- |
| `/liff/admin` | redirect → `/dashboard` |
| `/liff/admin/dashboard` | 本季營收、4 mini stats、待處理轉帳警示、管理工具 grid |
| `/liff/admin/bookings` | 全部訂單 + 篩選分頁（全部 / 進行中 / 完成 / 取消）+ CSV 匯出 |
| `/liff/admin/users` | 會員列表 + 一鍵切換 role（customer / coach / admin） |
| `/liff/admin/broadcast` | 群發推播：3 步驟（對象 → 模板 → 預覽送出），8 種 Flex + 純文字 |
| `/liff/admin/reports` | 營運摘要 + 會員結構 + CSV 下載 |
| `/liff/admin/settings` | 系統資訊（版本、環境變數清單） |

---

## 5. API 路由清單（28 條）

### 5.1 公開 / 系統 (4)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/healthz` | GET | 存活檢查（含 APP_VERSION） |
| `/api/dbcheck` | GET | DB 連線與資料量檢查 |
| `/api/config` | GET | client 端讀 runtime config（LIFF ID、銀行資訊） |
| `/api/webhook` | POST | LINE Messaging webhook（HMAC 驗章 → upsert User → 文字 routing） |

### 5.2 場次 / 行程 (4)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/trips` | GET | 列日潛場次（含 booked count + site 詳細） |
| `/api/trips/[id]` | GET | 單一場次 + 教練 + 報名計數 |
| `/api/tours` | GET | 列旅行團 |
| `/api/tours/[id]` | GET | 旅行團詳情（itinerary、含/不含、加購） |

### 5.3 客戶資料 (4，需 LIFF idToken 驗證)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/me` | GET | 自己的 profile + 預約統計 |
| `/api/me` | PATCH | 更新姓名、電話、證照、緊急聯絡人、備註 |
| `/api/bookings/daily` | POST | 建立日潛預約（含 capacity check + 自動計算總額） |
| `/api/bookings/tour` | POST | 建立旅行團預約（自動算 deposit） |
| `/api/bookings/my` | GET | 自己的所有訂單 + 展開 ref + payment proofs |
| `/api/bookings/[id]/payment-proofs` | POST | 上傳付款截圖（接 r2Key 或 base64） |

### 5.4 R2 上傳 (2)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/uploads/presign` | POST | 產 R2 presigned PUT URL（5 分鐘 TTL，依 prefix 自動選 public/private bucket） |
| `/api/uploads/preview` | GET | （coach/admin）產 private bucket presigned GET URL 給教練看轉帳截圖 |

### 5.5 教練 (3，role=coach/admin)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/coach/today` | GET | 今日場次 + 完整報名清單 |
| `/api/coach/payment-proofs` | GET | 列待核對截圖 |
| `/api/coach/payment-proofs` | POST | 核可/拒絕（核可後 booking.paymentStatus / status 自動更新） |
| `/api/coach/trips/weather-cancel` | POST | 天氣取消整場（觸發退款流程） |

### 5.6 Admin (7，role=admin)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/admin/stats` | GET | 會員/場次/旅行團/訂單/營收統計 |
| `/api/admin/users` | GET / POST | 會員列表 / 切換 role |
| `/api/admin/bookings` | GET | 所有訂單（最近 200 筆） |
| `/api/admin/bookings/csv` | GET | CSV 匯出（UTF-8 BOM 防 Excel 亂碼） |
| `/api/admin/broadcast` | POST | Flex / 純文字 multicast（LINE token 未設則 dry-run 預覽） |
| `/api/admin/richmenu/sync` | POST | 上傳 Rich Menu PNG 並綁定 |
| `/api/admin/seed` | POST | 開發測試：seed dive sites / coaches / trips |
| `/api/admin/bootstrap` | POST | 第一個 admin 帳號設定 |

### 5.7 Cron (1)
| 路徑 | 方法 | 用途 |
| --- | --- | --- |
| `/api/cron/reminders?token=...` | GET | Zeabur cron 觸發：D-1 日潛提醒 + D-3 尾款提醒 + 出發前手冊（ReminderLog 防重發） |

---

## 6. 資料模型（Prisma schema）

```
User ─────────────────┬─── Coach (1:0..1)
│                     │
│                     │
│ lineUserId (PK)     │
│ displayName         │
│ realName            │
│ phone               │
│ emergencyContact    │
│ cert (OW/AOW/...)   │
│ certNumber          │
│ logCount            │
│ role (customer/coach/admin)
│ notes               │
└─→ Booking (1:n) ────────┐
                          │
                          ├─→ PaymentProof (1:n)
                          │      └─ imageKey (R2 key 或 base64)
                          │      └─ verifiedAt / verifiedBy
                          │
                          └─→ ReminderLog (1:n)
                                 └─ type ("d1_reminder", "final_reminder"...)
                                 └─ channel (line / email)

Booking
  ├─ type: daily | tour
  ├─ refId → DivingTrip.id  或  TourPackage.id（polymorphic）
  ├─ participants
  ├─ totalAmount / depositAmount / paidAmount
  ├─ paymentStatus (pending / deposit_paid / fully_paid / refunding / refunded)
  ├─ status (pending / confirmed / cancelled_by_user / cancelled_by_weather / completed / no_show)
  └─ agreedToTermsAt（三層簽署時間戳）

DivingTrip
  ├─ date / startTime
  ├─ diveSiteIds[] → DiveSite
  ├─ coachIds[]    → Coach
  ├─ tankCount / capacity
  ├─ isNightDive / isScooter
  └─ pricing JSON: { baseTrip, extraTank, nightDive, scooterRental }

TourPackage
  ├─ title / destination / dateStart / dateEnd
  ├─ basePrice / deposit / depositDeadline / finalDeadline
  ├─ itinerary[] / diveSiteIds[]
  ├─ includes[] / excludes[]
  └─ addons[] (id / label / priceDelta)

DiveSite
  ├─ name / region / difficulty / maxDepth
  ├─ features[] / images[] / youtubeUrl
  └─ cautions
```

**重要設計**：
- `Booking.refId` 是 polymorphic FK（無 DB 強制 FK，由 `type` 欄位決定指向哪張表）— 同一張訂單表處理日潛與旅行團，省複雜度
- `User.emergencyContact` 用 Json 欄位（彈性，未來可加同行者）
- `PaymentProof.imageKey` 同時支援「R2 key (新)」與「base64 data URL (legacy / dev fallback)」

---

## 7. 認證 / 授權

```
Browser (LIFF SDK)
   │
   │  liff.getIDToken()  → "eyJxxx..."
   │
   ▼
Fetch /api/* with Authorization: Bearer <idToken>
   │
   ▼
src/lib/auth.ts → authFromRequest(req)
   │
   ├──→ jose 用 LINE JWKS 驗章 (https://api.line.me/oauth2/v2.1/certs)
   │        └─→ sub = lineUserId
   │              └─→ prisma.user.upsert (第一次自動建)
   │
   └──→ dev fallback：?lineUserId=Uxxx (僅 NODE_ENV !== production)
                                       (LIFF_MOCK=1 桌面測試走這條)

→ requireRole(user, ["coach", "admin"]) 二段檢查
```

**Mock 模式**：`NEXT_PUBLIC_LIFF_MOCK=1` 時 LiffProvider 不送 Bearer header，改帶 `?lineUserId=U_mock_dev_user_0001` query，後端 auth.ts 走 dev fallback。

---

## 8. 樣式系統（設計 token）

`src/app/globals.css` 用 Tailwind v4 `@theme`：

```css
@theme {
  --color-ocean-deep:    #0A2342;   /* 主色：深海 */
  --color-ocean-surface: #1B3A5C;   /* 次色：海面 */
  --color-phosphor:      #00D9CB;   /* 強調：磷光青（CTA / 關鍵動作） */
  --color-coral:         #FF7B5A;   /* 警告 / 急迫 */
  --color-gold:          #FFB800;   /* 提醒（金色） */
  --color-midnight:      #0F1B2D;   /* 夜潛 Midnight 模式 */
  --color-pearl:         #F5F7FA;   /* 背景 */
  --color-mist:          #E5EBF2;   /* muted */

  --font-sans: "Noto Sans TC", "Inter", system-ui, sans-serif;
  --radius-card: 1rem;
}
```

**深淺切換**：`.midnight` class 在 LiffShell 加上，所有 token 自動切換到深色變體（夜潛場次卡用 `<LiffShell midnight>`）。

---

## 9. 元件層

```
src/components/
├── brand/Logo.tsx          ← 純 SVG 重繪自 ux-design/brand.jsx 的 L2 圓徽
├── shell/
│   ├── LiffShell.tsx        ← Header (含 router.back 智能返回) + Footer + Mock 警示橫條
│   └── BottomNav.tsx        ← 4-tab thumb-reach 導航（日潛 / 旅行團 / 我的 / 個人）
└── ui/                      ← 自寫的 shadcn 元件（避免 CLI init 依賴）
    ├── button.tsx           (6 variants: default/ocean/coral/outline/ghost/link)
    ├── card.tsx             (含 Header/Title/Description/Content/Footer 子元件)
    ├── input.tsx
    ├── label.tsx
    ├── badge.tsx            (default/ocean/coral/gold/outline/muted)
    ├── tabs.tsx             (Radix-based)
    ├── separator.tsx
    ├── avatar.tsx
    └── dialog.tsx           (含 overlay / portal / animations)
```

---

## 10. lib 層（業務邏輯）

```
src/lib/
├── prisma.ts                  Prisma client singleton
├── auth.ts                    LIFF idToken → User + requireRole helper
├── line.ts                    LINE Messaging API client + HMAC verify
├── r2.ts                      Cloudflare R2 雙 bucket client
│                              ├── public  : sites/, richmenu/
│                              └── private : payments/, avatars/
├── liff/LiffProvider.tsx      LIFF init + mock mode + fetchWithAuth wrapper
├── liff-client.ts             (legacy helper from 20260507, 部分頁面仍用)
├── flex/
│   ├── index.ts               統一 export buildFlexByKey()
│   ├── _common.ts             共用 helpers (asString, asNumber, color tokens)
│   ├── booking-confirm.ts     ✓ 預約成功
│   ├── d1-reminder.ts         D-1 行前提醒
│   ├── deposit-notice.ts      訂金繳費通知（含銀行資訊）
│   ├── deposit-confirm.ts     訂金確認
│   ├── final-reminder.ts      D-3 尾款提醒
│   ├── trip-guide.ts          行前手冊
│   ├── weather-cancel.ts      天氣取消
│   └── admin-weekly.ts        Admin 週報摘要
├── cancellation.ts            取消政策三段計算（D-7 / D-3 / D-1）
├── design.ts                  共享 UI 常數
├── utils.ts                   cn() class merger
└── version.ts                 APP_VERSION = "20260511_00"
```

---

## 11. 重要外部腳本

```
scripts/build-richmenu.ts
  └─ @napi-rs/canvas
  └─ 產 3 張 2500×1686 PNG (customer / coach / admin)
  └─ 輸出到 public/richmenu/

→ POST /api/admin/richmenu/sync?role=customer  上傳到 LINE 並設為 default
```

---

## 12. 部署架構

### 本機開發
```
Browser ──→ Next.js dev (port 3001) ──→ Postgres @ localhost:5432 (docker-compose)
                                    ──→ R2 (production)
                                    ──→ LINE API (production)
```

### Production (Zeabur)
```
LINE App
   │
   │  HTTPS
   ▼
Zeabur                                                Cloudflare R2
  ┌────────────────────────────────────┐               ┌─────────────┐
  │ Next.js standalone (Docker)        │←─presigned PUT│ haiwangzi-  │
  │  ├─ /api/webhook  ← LINE webhook   │               │  public     │
  │  ├─ /api/cron/reminders ← cron     │               ├─────────────┤
  │  └─ all routes                     │               │ haiwangzi-  │
  └──┬─────────────────────────────────┘               │  private    │
     │                                                  └─────────────┘
     ▼
  Postgres add-on
```

### 啟動順序（Dockerfile）
```
1. node:22-alpine + libc6-compat + openssl
2. deps: npm ci
3. build: prisma generate → next build
4. runner: copy standalone + static + prisma + entrypoint
5. entrypoint: prisma migrate deploy → node server.js
```

---

## 13. 關鍵設計決策（為什麼這樣做）

| 決策 | 為什麼 |
| --- | --- |
| 後端從 20260507 整套搬移、前端重寫 | Backend 已成熟驗證；UX 大改值得從零做，不用拆裝補丁 |
| Tailwind v4 而非 v3 | Next.js 16 對 v4 已穩定；token 化 `@theme` 寫法更簡潔 |
| 自寫 shadcn 元件而不跑 CLI init | 避免 init CLI 互動提示阻塞自動化；同時可微調元件貼合品牌 |
| 雙 R2 bucket（public/private） | 轉帳截圖含敏感資訊不該公開預覽；潛點照片需 CDN 加速 |
| `Booking.refId` polymorphic | 訂單表合併日潛+旅行團；少一張表 / 少一些 join |
| Mock 模式不送 Bearer header | 否則假 token 會被 jose 真實驗章 reject |
| 返回鈕用 `router.back()` 而非硬 href | 永遠回實際進入的上一頁，不會跟使用者預期不符 |
| Flex Message 用 TS factory 而非 JSON 模板 | 型別安全 + 重用色票常數 + 改 schema 立即得編譯錯誤 |
| Rich Menu 用 `@napi-rs/canvas` 而非 node-canvas | 後者裝在 Alpine 很痛苦；前者跨平台一致 |

---

## 14. 你現在能做的事

| 想 | 怎麼做 |
| --- | --- |
| 加新頁面 | 在 `src/app/liff/<path>/page.tsx` 建檔，用 `<LiffShell>` 包；需要登入就 `useLiff().fetchWithAuth()` |
| 加新 API | 在 `src/app/api/<path>/route.ts` 建檔；`export async function GET/POST(req: NextRequest)`；前面塞 `authFromRequest` + `requireRole` |
| 加新 Flex 卡 | 在 `src/lib/flex/<name>.ts` 寫 factory；在 `src/lib/flex/index.ts` 註冊 |
| 改品牌色 | 改 `src/app/globals.css` 的 `@theme` — 所有元件自動跟著變 |
| 改 schema | 編 `prisma/schema.prisma` → `npx prisma db push`（dev）或 `migrate dev`（建版本檔） |
| 換 mock 用戶 ID | 改 `src/lib/liff/LiffProvider.tsx` 的 `MOCK_PROFILE` |

---

📦 完整檔案總數：
- **17 個 LIFF 頁面**
- **28 條 API routes**
- **8 個 Flex Message factory**
- **9 個自寫 shadcn 元件**
- **8 個 Prisma model**
