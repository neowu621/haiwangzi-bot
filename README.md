# 東北角海王子潛水團 — LIFF 訂閱 App

東北角海王子潛水團的 **LINE LIFF App**，讓客戶用手機完成 **日潛預約** 與 **旅遊潛水** 報名，
教練端可在水邊單手核對收款，Admin 可遠端管理排班、群發 Flex Message。

當前版本：`APP_VERSION = 20260511_00`

---

## 技術堆疊

| 層 | 技術 |
| --- | --- |
| Framework | Next.js 16.2.3 (App Router) + React 19.2 |
| 樣式 | Tailwind v4 + shadcn/ui (品牌色：Deep Ocean / Phosphor / Coral / Gold) |
| 資料庫 | PostgreSQL 16 + Prisma 6.19 |
| LINE | `@line/liff` 2.28、`@line/bot-sdk` 9.5、`jose` JWKS 驗 idToken |
| 圖床 | Cloudflare R2 (presigned PUT 直傳) |
| 部署 | Docker (multi-stage) → Zeabur |

---

## 本機開發 Quick Start

### 1. 環境準備
- Node.js 22+ (專案在 `v24.13.1` 測試 OK)
- Docker Desktop
- (推薦) [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 提供 HTTPS 隧道

### 2. 安裝 + 起 DB

```powershell
npm install
Copy-Item .env.example .env   # 然後填入實際 token
docker compose up -d          # 啟動 Postgres
npx prisma generate
npx prisma db push
npm run dev                   # http://localhost:3000
```

驗證：
- `GET /api/healthz` → `{ ok: true, version: "20260511_00" }`
- `GET /api/dbcheck` → `{ ok: true, counts: { ... } }`

### 3. 桌面端開發 (不需要 LINE)

設 `.env`：
```
NEXT_PUBLIC_LIFF_MOCK=1
```

接著 `npm run dev`，所有 LIFF 頁面都會走 mock profile (`U_mock_dev_user_0001`)，
auth.ts 走 `?lineUserId=` query fallback。
不需要實際 LINE channel 就能跑完整客戶流程。

### 4. 用真 LIFF 測試 (手機 / LINE in-app browser)

```powershell
cloudflared tunnel --url http://localhost:3000
# 拿到 https://xxx.trycloudflare.com
```

到 LINE Developers Console → LIFF App → Endpoint URL 改為上面那個 URL。
手機 LINE 開 `https://liff.line.me/<LIFF_ID>` 即可。

### 5. 升級權限做 Coach / Admin 測試

```bash
docker exec haiwangzi-postgres psql -U postgres -d haiwangzi \
  -c "UPDATE users SET role='admin' WHERE line_user_id='<your_line_id>';"
```

---

## 路由總覽

### 客戶端 (Bottom Nav)
- `/liff/welcome` — 入口頁
- `/liff/calendar` — 月曆 / 場次預覽
- `/liff/dive/date/[date]` — 當日場次列表
- `/liff/dive/trip/[tripId]` — 日潛預約表單（含取消政策三層簽署）
- `/liff/tour` + `/liff/tour/[packageId]` — 旅行團列表 / 詳情
- `/liff/my` — 我的預約（即將 / 已完成 / 已取消）
- `/liff/profile` — 個人資料
- `/liff/payment/[bookingId]` — 上傳轉帳截圖（R2 直傳）

### 教練端 (role=coach / admin)
- `/liff/coach/today` — 今日場次 + 報名清單
- `/liff/coach/payment` — 滑動 / 對話框確認 / 拒絕轉帳
- `/liff/coach/schedule` — 未來 14 天排班

### Admin 端 (role=admin)
- `/liff/admin/dashboard` — 主控台
- `/liff/admin/bookings` — 所有訂單 + CSV 匯出
- `/liff/admin/users` — 會員 + role 切換
- `/liff/admin/broadcast` — Flex / 純文字群發
- `/liff/admin/reports` — 營運摘要
- `/liff/admin/settings` — 系統資訊

### API
- `GET /api/healthz`, `/api/dbcheck`, `/api/config`
- `GET /api/trips`, `/api/trips/[id]`, `/api/tours`, `/api/tours/[id]`
- `POST /api/bookings/daily`, `/api/bookings/tour`
- `GET /api/bookings/my`
- `POST /api/bookings/[id]/payment-proofs` (r2Key 或 base64)
- `POST /api/uploads/presign` (R2 presigned PUT)
- `GET /api/me`, `PATCH /api/me`
- `GET /api/coach/today`, `GET/POST /api/coach/payment-proofs`
- `GET /api/admin/stats|bookings|users`, `GET /api/admin/bookings/csv`
- `POST /api/admin/broadcast` (Flex multicast)
- `POST /api/admin/richmenu/sync?role=customer|coach|admin`
- `GET /api/cron/reminders?token=...` (Zeabur cron 觸發)
- `POST /api/webhook` (LINE webhook，HMAC 驗章)

---

## LINE Rich Menu

```powershell
npm run richmenu:build              # 產 public/richmenu/{customer,coach,admin}.png
curl -X POST "http://localhost:3000/api/admin/richmenu/sync?role=customer&lineUserId=<your_admin_id>"
```

每個 role 一張 menu；customer 版本會被設為 default。

---

## Flex Message 模板

放在 `src/lib/flex/`，共 8 種：

| Key | 用途 |
| --- | --- |
| `booking_confirm` | 預約成功 |
| `d1_reminder` | D-1 行前提醒 |
| `deposit_notice` | 旅行團訂金通知 |
| `deposit_confirm` | 訂金確認 |
| `final_reminder` | D-3 尾款提醒 |
| `trip_guide` | 旅行團行前手冊 |
| `weather_cancel` | 天氣取消 |
| `admin_weekly` | Admin 週報 |

Admin 端 `/liff/admin/broadcast` 可直接挑模板群發。

---

## 部署 (Zeabur)

1. 確保 `Dockerfile`、`docker-entrypoint.sh`、`.dockerignore`、`zeabur.json` 已在 repo
2. **bump `src/lib/version.ts`** 的 `APP_VERSION` (例：`20260511_00` → `20260511_01`) — 必做
3. 更新 `CHANGELOG.md` 加一筆
4. `git push` → Zeabur 自動 build
5. Zeabur 開 Postgres add-on，把 `DATABASE_URL` 連到 service
6. 設定所有環境變數（特別是 `LINE_CHANNEL_*`、`R2_*`、`CRON_TOKEN`、`NEXT_PUBLIC_BASE_URL`）
7. 設定 Cron（每天 09:00 / 18:00 GET `/api/cron/reminders?token=...`）
8. LIFF console endpoint URL 改成 Zeabur 網域

詳見 [STATUS.md](./STATUS.md) 中的 deploy checklist。
