# Cron 設定 — 海王子潛水團

> 本專案的所有排程任務由共用 **Automation-Hub Cronicle** 觸發，
> 不使用 Zeabur 內建 Cron（保留 Free Plan、跨專案統一管理）。

---

## 架構

```
┌──────────────────────────────────────┐         ┌─────────────────────────────┐
│  Automation-Hub (Zeabur project)    │         │  Haiwangzi-Diving           │
│  ─────────────────────────────────  │  HTTPS  │  ─────────────────────────  │
│  Cronicle                            │ ──────► │  haiwangzi-bot              │
│  https://neowu-cron-hub.zeabur.app   │  Bearer │  /api/cron/reminders        │
│  (web UI: admin / ****)              │         │  (CRON_SECRET 驗證)         │
└──────────────────────────────────────┘         └─────────────────────────────┘
```

- Cronicle 一個實例，未來所有專案的 cron job 都掛在這裡
- 每個專案在 Cronicle 端定義環境變數（e.g. `HAIWANGZI_CRON_SECRET`、`HAIWANGZI_BASE_URL`）
- Job 內容就是 `curl -X POST -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" "$HAIWANGZI_BASE_URL/api/cron/reminders?pollWindowMinutes=30"`

---

## Endpoint：`/api/cron/reminders`

| 項目 | 內容 |
|---|---|
| Method | `POST`（亦支援 `GET` 方便瀏覽器手動測試） |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| Query | `?pollWindowMinutes=30`（選填，預設 30） |
| Dedup | 由 DB `ReminderLog` 表保證：同一 booking + type 只發一次 |

### 回傳

```json
{
  "ok": true,
  "pollWindowMinutes": 30,
  "sent": [
    { "type": "d1_reminder", "userId": "U...", "bookingId": "b..." }
  ],
  "errors": [],
  "counts": { "sent": 1, "errors": 0 },
  "tookMs": 482
}
```

### 觸發內容

1. **D-1 日潛行前提醒** — 明日所有 `open` 的 daily trip，confirmed bookings
2. **潛水團尾款提醒** — N 天後出發、`deposit_paid` 但尾款未清的 booking（N 依每團 `finalReminderDays` 設定，預設 30）
3. 兩通道：LINE Flex + Email（依 user `notifyByLine` / `notifyByEmail` opt-in）

---

## Endpoint：`/api/cron/daily-weather-report`（每日天氣回報）

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET`（皆需 Bearer） |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議（v389） | **一天兩次**(時段在後台「系統設定 → 自動發送 → 🌤️ 每日天氣回報」可調，台灣時間)：<br>🌙 台灣 22:00 → `UTC 0 14 * * *`(前一晚看明日)<br>🌅 台灣 05:00 → `UTC 0 21 * * *`(出發前看今日) |
| 邏輯 | 抓 CWA 即時測站(基隆+宜蘭)風速/氣溫 + 今/明場次摘要 → 依後台勾選的收件人推 LINE/Email |
| 內容開關 | 後台可勾選帶哪些(風速/氣溫/場次摘要/浪高)，存在 `SiteConfig.weatherReportContent` |
| 時段設定 | 存在 `SiteConfig.weatherReportSlots`(台灣時間),後台會自動換算 UTC cron 顯示;**Cronicle 以 UTC 執行** |

> ⚠️ **時區重點**：Cronicle 一律用 **UTC**。後台「發送時段」一律填**台灣時間**,系統自動 −8 小時換算成 UTC cron 給你貼,不要再自己換算(避免 21:00/05:00 搞混)。

### Cronicle job 設定(兩個 event 共用同一指令)

```bash
#!/bin/sh
set -e
curl -fsS -X POST \
  -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" \
  "$HAIWANGZI_BASE_URL/api/cron/daily-weather-report"
```

- Event A：cron `0 14 * * *`(= 台灣 22:00)
- Event B：cron `0 21 * * *`(= 台灣 05:00)

---

## Endpoint：`/api/cron/daily-briefing`（每晚明日訂單預報，非天氣）

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET`（皆需 Bearer） |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議 | 台灣 **21:00** → Cronicle UTC `0 13 * * *` |
| 邏輯 | 老闆/admin 完整版(明日場次+客戶+應收+待審匯款+今日待結算+月統計);教練精簡版(只列場次+客戶+電話,不含金額) |

```bash
curl -fsS -X POST -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" "$HAIWANGZI_BASE_URL/api/cron/daily-briefing"
```

---

## Endpoint：`/api/cron/weather-check`

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議 | 每天 06:00 (台灣) — Cronicle 用 UTC：`0 22 * * *` |
| 邏輯 | 抓 CWA O-A0001-001 即時測站 → 風速超過 `WEATHER_WIND_THRESHOLD`（預設 10 m/s）|
|  | **若 `SiteConfig.weatherAutoCancel = false`（預設）**：只推警告給場次教練 + admin |
|  | **若 = true**：自動把當日 open 場次設 cancelled + 推 LINE Flex + Email 給客戶 |

---

## Endpoint：`/api/cron/expire-trip-photos`

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議 | 每天 02:00 (台灣) — Cronicle 用 UTC：`0 18 * * *` |
| 邏輯 | 找 `TripPhoto.expiresAt < now` 的照片 → 刪 R2 物件 + DB row |

### 回傳範例

```json
{
  "ok": true,
  "expired": 12,
  "r2Deleted": 12,
  "dbDeleted": 12,
  "r2Errors": []
}
```

---

## Endpoint：`/api/cron/admin-weekly`

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET` |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議 | 週一 09:00 (台灣) — Cronicle 用 UTC：`0 1 * * 1` |
| 邏輯 | 寄上週營運週報 Flex 給 admin/boss |

---

## Endpoint：`/api/cron/birthday-credits`（生日抵用金）

| 項目 | 內容 |
|---|---|
| Method | `POST` / `GET`（皆需 Bearer） |
| Auth | `Authorization: Bearer <CRON_SECRET>` |
| 排程建議（v388 起） | **每月 1 號** 台灣 08:00 — Cronicle 用 UTC：`0 0 1 * *` |
| 邏輯 | 發給「生日落在當月」且今年尚未領過的會員，金額 = `SiteConfig.birthdayCreditAmount`（0=停用）、效期 = `birthdayCreditExpiryDays`（0=不過期） |
| Dedup | `users.birthday_credit_year` 確保**一年只發一次**（即使中途重跑也不重發） |
| 補發 | 註冊當月生日者，於 Email 驗證通過時即時補發（共用同一去重欄位，不會重複） |

> ⚠️ **v388 變更**：原本是「每天跑、發當天生日者」（`0 0 * * *`），
> 現改為「每月 1 號跑、發當月生日者」。請把 Cronicle event 的 cron 由每日改為 **`0 0 1 * *`**。
> `0 0 1 * *`（UTC）= 台灣時間每月 1 號 08:00；落在當月 1 號內，符合「月初發放」需求。

### Cronicle job 設定

| 欄位 | 值 |
|---|---|
| Event Name | `haiwangzi-birthday-credits` |
| Timing | cron expression `0 0 1 * *`（每月 1 號 UTC 00:00 = 台灣 08:00） |
| Plugin | Shell Script |

```bash
#!/bin/sh
set -e
curl -fsS -X POST \
  -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" \
  "$HAIWANGZI_BASE_URL/api/cron/birthday-credits"
```

### 回傳範例

```json
{
  "ok": true,
  "date": "6/1/2026",
  "amount": 100,
  "grantedCount": 3,
  "failedCount": 0,
  "granted": ["U..."],
  "failed": []
}
```

---

## Endpoint：`/api/healthz`（保溫 / keep-warm）

| 項目 | 內容 |
|---|---|
| Method | `GET` |
| Auth | **不需要**（純健康檢查，無敏感資料） |
| 排程建議 | 每 5 分鐘 — Cronicle：`*/5 * * * *` |
| 目的 | 防止 Zeabur 容器閒置休眠。流量低時容器會睡著，當天第一位客人需等 ~60 秒冷啟動；每 5 分鐘戳一次讓它保持喚醒 |

### Cronicle job 設定

- **Plugin**: Shell Script（或 HTTP Request plugin）
- **Schedule**: `*/5 * * * *`（每 5 分鐘）
- **Command**:
  ```bash
  curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://haiwangzi.zeabur.app/api/healthz
  ```
- 不需要 CRON_SECRET（healthz 是公開端點）

> ✅ **已實測（2026-06）確認需要**：DB/後端/R2 都很快（查詢 5ms、healthz 0.06s），
> 但容器閒置會休眠 → 老闆隔一陣子開後台第一次特別慢（重新登入也只是順便喚醒容器）。
> 故建議**啟用此 keepalive job**。實測指令參考：`curl -w "連線 %{time_connect}s 總 %{time_total}s\n" .../api/healthz`。

---

## 設定步驟

### 1. 產生密鑰

```bash
openssl rand -hex 32
```

得到一段 64 字元 hex，例如：`8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS`

### 2. Zeabur — haiwangzi-bot service

加環境變數：

```
CRON_SECRET=<上一步的值>
```

> 已部署可在 Zeabur dashboard → Haiwangzi-Diving project → haiwangzi-bot service → Variables 加。
> 加完會自動 redeploy。

### 3. Cronicle (Automation-Hub) — 設密鑰環境變數

進入 https://neowu-cron-hub.zeabur.app，**Admin → Servers → 該 server → Edit Configuration**
（或直接在 Zeabur 設 service env），加：

```
HAIWANGZI_CRON_SECRET=<同樣的值>
HAIWANGZI_BASE_URL=https://haiwangzi.zeabur.app
```

> 兩邊值**必須一致**，否則 endpoint 會回 401。

### 4. Cronicle Web UI — 建立 Job

登入 https://neowu-cron-hub.zeabur.app
（帳號 `admin` / 密碼見密碼管理工具）

**Schedule → Add Event**

| 欄位 | 值 |
|---|---|
| Event Name | `haiwangzi-reminders` |
| Category | Production |
| Target | All Servers / 任一可用 server |
| Plugin | Shell Script |
| Timing | Every 30 minutes（cron expression: `*/30 * * * *`） |
| Script | 見下方 |
| Timeout | 60 秒 |

#### Script 內容

```bash
#!/bin/sh
set -e

curl -fsS -X POST \
  -H "Authorization: Bearer $HAIWANGZI_CRON_SECRET" \
  "$HAIWANGZI_BASE_URL/api/cron/reminders?pollWindowMinutes=30"
```

> 用 `-f` 讓 HTTP 4xx/5xx 觸發 Cronicle 警告；`-s -S` 安靜但有錯印 stderr。

### 5. 手動測試

Cronicle UI → 該 event → **Run Now** → 看 Log。

或本機直接 curl：

```bash
# Production
curl -X POST \
  -H "Authorization: Bearer 8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS" \
  "https://haiwangzi.zeabur.app/api/cron/reminders?pollWindowMinutes=30"

# Local dev
curl -X POST \
  -H "Authorization: Bearer 8upfLU5qr7i4a2mP3VocnRNKwMytABXEl0e1h9YS" \
  "http://localhost:3000/api/cron/reminders?pollWindowMinutes=30"
```

預期回傳：`{"ok":true,"pollWindowMinutes":30,"sent":[],...}`（當下無符合條件時 sent 為空陣列）

---

## 安全性

- `CRON_SECRET` 是 32+ 字元亂數，採時序安全的字串比較（Next.js handler 內）
- 端點只能用 Bearer header 傳，避免 token 出現在 access log
- Endpoint 沒有 rate limit；Cronicle 的 cron 頻率自身就是節流（30 min 一次）
- 想 rotate 密鑰：兩邊 env 同時改，等 redeploy 完即生效

---

## 為什麼不用 Zeabur Cron / GitHub Actions

| 方案 | 優 | 缺 |
|---|---|---|
| **Cronicle (本方案)** | Web UI 可即時看 log、跨專案共用一個實例、彈性高 | 多吃一個 service（但攤平多專案後其實划算） |
| Zeabur Cron | 原生整合 | Developer Plan 才有（$5/月起跳），跨專案要重複設 |
| GitHub Actions | 免費 | 不能 < 5 分鐘、log 在 GitHub 不便檢視、推播延遲不可控 |

未來新專案要加 cron 直接在 Cronicle 加 event 即可，不需新建 service。

---

## 跨專案參考

- its-17-time（團購）— 採用 GitHub Actions 備援 + Zeabur Cron，可參考其 `docs/CRON_SETUP.md`（位於 `D:\00AI Project\20260418_Group Buying\app\docs\CRON_SETUP.md`）的設計思路（Bearer auth + pollWindowMinutes）。本專案的 API design 與其對齊。
