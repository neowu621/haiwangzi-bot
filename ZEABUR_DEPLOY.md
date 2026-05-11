# Zeabur 部署 Checklist

**已準備好**：GitHub repo 推送完成 → https://github.com/neowu621/haiwangzi-bot
**目標**：部署到 `haiwangzi.zeabur.app`

---

## 🚀 早上起來只需要做這幾件事

### 1. Zeabur Dashboard → 加新 Service

開 https://dash.zeabur.com → 進入 **Haiwangzi-Diving** 專案 → 左下角 **「建立服務」**

選 **「GitHub」** → 授權後挑 `neowu621/haiwangzi-bot` → 預設分支 master → 建立。

Zeabur 會自動偵測 Next.js + Dockerfile，開始 build（約 3-5 分鐘）。

### 2. 設定環境變數

進新建的 service → **「環境變數」** tab → 一次貼下面所有變數：

```dotenv
# ─── LINE ───
LINE_CHANNEL_ACCESS_TOKEN=uhMs8Bso929mLK2+sOKw07B7FBcvUfXDS3S3qiKNVtMpJt4RfU65En+s2U/jZLh4eznCRIlhu6kQPuRHa3+amHGtQcWkYmnquoGMspbS9YzZVYvBV10a9nnsLqL+oU0PZthv8quwkm9tltIXIwsc2QdB04t89/1O/w1cDnyilFU=
LINE_CHANNEL_SECRET=1681a22e00d6ba64b5c5780ab66fb54b
LINE_LIFF_ID=2010006458-fyokMnVv
NEXT_PUBLIC_LIFF_ID=2010006458-fyokMnVv

# ─── JWT / Cron ───
JWT_SECRET=MEoyJvXRD6a12AHkzqUsQPxhKYZnVTCe0G9I8N5d3figutcb
CRON_TOKEN=8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS

# ─── Database (用 Zeabur Postgres 的 reference) ───
DATABASE_URL=${POSTGRES_CONNECTION_STRING}

# ─── Cloudflare R2 ───
R2_ACCOUNT_ID=899c8469075e16e2ee6664b2ce84729f
R2_ENDPOINT=https://899c8469075e16e2ee6664b2ce84729f.r2.cloudflarestorage.com
R2_PUBLIC_BUCKET=haiwangzi-public
R2_PRIVATE_BUCKET=haiwangzi-private
R2_PUBLIC_URL=https://pub-1416d47bf5da4c3da3c9f4337ad856c7.r2.dev
R2_ACCESS_KEY_ID=⚠️_TODO_您要去_Cloudflare_R2_控制台建_token_後填這裡
R2_SECRET_ACCESS_KEY=⚠️_TODO_同上

# ─── 銀行匯款資訊 (顯示在付款頁 + 訂金通知 Flex) ───
BANK_NAME=⚠️_TODO_您填例如_玉山銀行
BANK_BRANCH=⚠️_TODO_例如_基隆分行
BANK_ACCOUNT=⚠️_TODO_帳號數字
BANK_HOLDER=⚠️_TODO_戶名

# ─── App ───
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_NAME=東北角海王子潛水團
NEXT_PUBLIC_BASE_URL=https://haiwangzi.zeabur.app
NEXT_PUBLIC_LIFF_MOCK=0
NEXT_TELEMETRY_DISABLED=1
```

> **`DATABASE_URL` 重點**：Zeabur 支援變數引用，`${POSTGRES_CONNECTION_STRING}` 會自動指向您的 Postgres service。
> 如果上面寫法不認，改貼 Postgres service 的「使用說明」面板上「Connection String」（從您截圖看 Postgres service 已 4h ago 運行中）的值。

### 3. 綁定網域

進 service → **「網路」** tab → **「自訂網域」** → 輸入 `haiwangzi.zeabur.app` → 儲存。

> Zeabur `.zeabur.app` 子網域是免費且自動配 HTTPS。

### 4. 設定 Cron Job

進 service → **「Cron」** 或 **「排程任務」** → 新增兩個：

| 名稱 | Cron 表達式 | URL |
| --- | --- | --- |
| 早提醒 | `0 1 * * *` (UTC 01:00 = 台北 09:00) | `https://haiwangzi.zeabur.app/api/cron/reminders?token=8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS` |
| 晚提醒 | `0 10 * * *` (UTC 10:00 = 台北 18:00) | `https://haiwangzi.zeabur.app/api/cron/reminders?token=8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS` |

> 如果 Zeabur 沒有原生 cron 介面，可用免費 cron-job.org 或 GitHub Actions schedule 觸發同一個 URL。

### 5. LINE Developers Console → 更新 LIFF endpoint

開 https://developers.line.biz/console/ → 選您的 channel → LIFF App `2010006458-fyokMnVv` → **Endpoint URL** 改成：

```
https://haiwangzi.zeabur.app/liff/welcome
```

接著到同 channel → Messaging API 設定 → **Webhook URL** 改成：

```
https://haiwangzi.zeabur.app/api/webhook
```

→ 開啟「Use webhook」、關閉「Auto-reply messages」。

### 6. Seed 範例資料

Zeabur DB 剛建好是空的，需要灌入潛點、教練、近期場次。最簡單用 API：

```bash
curl -X POST "https://haiwangzi.zeabur.app/api/admin/seed?secret=1681a22e00d6ba64b5c5780ab66fb54b"
```

（secret 用 `LINE_CHANNEL_SECRET` 的值）

跑完會建：6 個潛點（鶯歌石/深奧/龍洞 82.8/...）、3 位教練、近 14 天的 7 個日潛場次、2 個旅行團（蘭嶼/綠島）。Idempotent — 可重複跑不會炸。

### 7. 把自己升級為 admin

第一次手機 LINE 開 `https://liff.line.me/2010006458-fyokMnVv`、follow LINE OA 後，User row 會自動建立。然後在 Zeabur Postgres 「指令」面板執行：

```sql
UPDATE users SET role = 'admin' WHERE display_name LIKE '%您的_LINE_顯示名%';
-- 或精確版：
-- UPDATE users SET role = 'admin' WHERE line_user_id = 'Uxxxxxxxxxxxxxxxx';
```

### 8. 驗證

開瀏覽器：
- `https://haiwangzi.zeabur.app/api/healthz` → 應回 `{ ok:true, version:"20260512_01" }`
- `https://haiwangzi.zeabur.app/api/dbcheck` → 應回 DB 連線正常 + 7 trips 等統計

手機 LINE：
- 開 `https://liff.line.me/2010006458-fyokMnVv` → 應載入 welcome 頁（**無**金色 Mock 橫條 = 真實 LIFF 模式）
- 走一輪預約 → 上傳付款 → 切教練視角確認

---

## 🟡 R2 Access Key 還沒拿到怎麼辦？

R2 keys **不是必填**就能啟動。沒有 keys 時：
- 付款上傳走 **base64 fallback**（圖檔存進 Postgres bytea，小圖 OK，大圖會吃儲存空間）
- 潛點照片、Rich Menu 等需要公開預覽的 R2 功能**暫時不可用**

R2 keys 申請方式：
1. https://dash.cloudflare.com → R2 → 您的 bucket → **「Manage R2 API Tokens」**
2. 建一組 token：權限 `Object Read & Write`，限定到 `haiwangzi-public` + `haiwangzi-private`
3. 拿到後填回 Zeabur 環境變數的 `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`、Zeabur 自動 redeploy

順手在 R2 控制台兩個 bucket 都加 CORS（**Cloudflare → R2 → bucket → Settings → CORS**）：

```json
[
  {
    "AllowedOrigins": [
      "https://haiwangzi.zeabur.app",
      "https://liff.line.me"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 🐛 常見問題

### Build 失敗：`prisma generate` not found
Zeabur 應該會用 Dockerfile build，Dockerfile 裡有 `RUN npx prisma generate`。如果 Zeabur 沒用 Dockerfile，請在 service Settings 設 build command 為 `npx prisma generate && npm run build`。

### 啟動失敗：`db push failed`
查看 logs。可能原因：
- `DATABASE_URL` 沒設或值錯
- Postgres service 還沒 ready（等 30 秒後 redeploy）
- Schema 跟既有 DB 有衝突（極小機率，因為您的 Zeabur DB 是新的）

手動修復：在 service 「指令」執行 `npx prisma db push --accept-data-loss`

### LIFF 「Invalid endpoint URL」
LINE LIFF endpoint 必須是 HTTPS 且能載入頁面。確認：
1. `https://haiwangzi.zeabur.app/liff/welcome` 直接從瀏覽器能開 200
2. LIFF console 的 Endpoint URL 完全一致（含 https://、/liff/welcome 結尾）

### Flex Message 沒收到
- LINE_CHANNEL_ACCESS_TOKEN 過期或錯誤
- Webhook URL 設錯（要 `/api/webhook`）
- HMAC 簽章驗證失敗 → 確認 LINE_CHANNEL_SECRET 正確

### Cron 沒觸發
- 確認 URL 含 `?token=CRON_TOKEN_VALUE`
- 訪問 URL 直接看回應，401 = token 錯、200 = 正常但 `sent: []` 是因為當下沒符合條件的提醒

---

## ✅ 完成後

Zeabur 上線網址：**https://haiwangzi.zeabur.app**

請在手機 LINE 完整跑一輪預約流程，覺得 OK 就可以準備上正式營運。
