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
2. **旅行團尾款提醒** — 3 天後出發、`deposit_paid` 但尾款未清的 booking

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
