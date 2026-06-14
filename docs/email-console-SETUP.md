# 客服信箱 Console — 整合後狀態 & 初始設定（v521）

> 整合日期：2026-06-14 ｜ 對應 commit：客服信箱 console Phase 1
> 模擬畫面：`docs/email-console-mockup.png`（三欄式 console，含林小姐改期範例）
> 設計稿原檔：`docs/email-console.html`（先不接，純參考）

---

## 1. 一句話

客人寄信到 **service@haiwangzi.xyz** → Inbound（Postmark）解析成 JSON 打 `inbound` webhook → 進後台 DB 開 thread；
後台回信 → Zeabur Email 寄出 → 客人收到、接同一串；寄送狀態由 Zeabur 的 `status` webhook 回報（送達/退信/投訴）。

---

## 2. 已整合（程式都進專案了，未 push、未動正式 DB）

| 區塊 | 位置 |
|---|---|
| 寄信封裝 + status 驗章 | `src/lib/zeabur-email.ts`（寄信**委派給既有 `src/lib/email/zsend.ts`**，只加 threading 標頭；不另設環境變數） |
| ZSend 寄信（已擴充支援自訂 headers + 回傳 providerId） | `src/lib/email/zsend.ts`（既有檔，向後相容） |
| 對話串比對 | `src/lib/email-threading.ts` |
| 收信 webhook | `src/app/api/webhooks/email/inbound/route.ts` |
| 寄送狀態 webhook | `src/app/api/webhooks/email/status/route.ts` |
| 後台列表 | `GET /api/admin/email/threads` |
| 後台詳情 / 改狀態 | `GET·PATCH /api/admin/email/threads/[id]` |
| 後台回信 | `POST /api/admin/email/threads/[id]/reply` |
| 後台主動新信 | `POST /api/admin/email/compose` |
| DB 模型 | `prisma/schema.prisma`：EmailThread / EmailMessage / SuppressedEmail + 3 enum |

**Booking 反向 relation**：`Booking` model 加了 `emailThreads EmailThread[]`；`EmailThread.bookingId` 用 `@db.Uuid` 對齊 `Booking.id`。

---

## 3. 6 個原本待確認的點 — 已全部用官方文件查證並處理

| # | 點 | 結果 |
|---|---|---|
| ① | 寄信自訂 header（In-Reply-To/References） | ✅ Zeabur Email REST API **支援** `headers` 物件，threading 客人端會接同串 |
| ② | status webhook 簽章格式 | ✅ 官方就是 `HMAC-SHA256({timestamp}.{rawBody})`、`sha256=hex`，與程式**完全一致** |
| ③ | status webhook payload 結構 | ⚠️→✅ 官方是巢狀信封 `{ event, email:{id,to[]}, data:{...} }`，**已修正解析**（provider id 取 `email.id`、收件人取 `email.to[]`/`data.*_recipients`） |
| ④ | compose 主動新信端點 | ✅ bundle 沒附程式，**已補上** `/api/admin/email/compose` |
| ⑤ | 附件存物件儲存 | ✅ **已接 R2 私密 bucket**（新增 `email` prefix）；base64 → 上傳 → DB 存 key+metadata；R2 沒設定時自動退回只存 metadata、不擋收信 |
| ⑥ | open/click engagement | ✅ EmailMessage 加 `openedAt`/`clickedAt`，webhook 收到 open/click 寫入 |

回應欄位也修正：Zeabur send 回 `{ id, message_id, status }`，provider id 取 `id`。

---

## 4. ⬇️ 你要輸入的初始變數（Zeabur 後台 → 環境變數）

> 🔑 重點：寄信**沿用專案既有的 ZSend**（`src/lib/email/zsend.ts`），它已在 Zeabur 設好、目前正常運作。
> console **不另設新寄信變數**（原 bundle 的 `ZEABUR_EMAIL_*` 已移除）。真正要「新增」的只有 2 個 webhook 密鑰。

**A. 已經有、不用動（確認存在即可）：**

| 變數 | 說明 |
|---|---|
| `ZSEND_API_KEY` | ZSend Bearer 金鑰，**已設、寄信正常** |
| `ZSEND_FROM` | 寄件身分（須為 ZSend 已驗證網域）。console 回信就用這個地址 |
| `ZSEND_API_ENDPOINT` | 免設，預設 `https://api.zeabur.com/api/v1/zsend/emails`（注意有 `/api/`） |
| `DATABASE_URL` / `R2_*` | 沿用現有；附件存私密 bucket，沒設 R2 也能收信（只少附件檔） |

**B. 這次要新增的（2 個）：**

| 變數 | 怎麼拿 |
|---|---|
| `ZSEND_WEBHOOK_SECRET` | Zeabur Email → Webhooks 建 status webhook 時取得。⚠️ 上線前刪掉重建一把新的 |
| `INBOUND_WEBHOOK_SECRET` | 自己產強隨機字串：`openssl rand -base64 32` |

> ⚠️ **寄件地址確認**：console 回信用 `ZSEND_FROM`。若你要客人看到的是 `service@haiwangzi.xyz`，
> 請確認 `ZSEND_FROM` 設的就是這個（且已在 ZSend / SES 完成網域驗證）。目前若是別的地址（例 `noreply@...`），
> 客人收到的寄件人會是那個 —— 要改成 service@ 就把 `ZSEND_FROM` 換掉。

---

## 5. Migration（你 review 完才做）

本專案用 `prisma db push`（無 migrations 目錄）。新增 3 張表 + 3 enum + EmailMessage 2 個欄位。
```bash
npx prisma db push        # 對本機/測試 DB 先驗；我已先跑過 prisma generate（只生型別）
```
⚠️ `docker-entrypoint.sh` 每次部署會自動跑 `prisma db push` → 一旦 push 上 master，正式 DB 會自動建這些表。

---

## 6. 仍需你手動處理的外部設定（程式碰不到）

1. **Zeabur 環境變數**：填上面第 4 節 5 個變數。
2. **status webhook**：endpoint = `https://haiwangzi.xyz/api/webhooks/email/status`，部署後回 Zeabur 按「測試」→ 應轉綠（200）；上線前重建金鑰。
3. **Inbound（Postmark）**：開通 → 驗證 haiwangzi.xyz → MX 指過去 → inbound webhook URL = `https://haiwangzi.xyz/api/webhooks/email/inbound?secret=<INBOUND_WEBHOOK_SECRET>`。
4. **確認 root domain**：`haiwangzi.xyz` 要真的指到後台 app，否則把上面 endpoint 換成 app 實際網址。

---

## 7. 最終架構（v521 完成）— 收信改走 Gmail IMAP

實際採用的收信路徑（已實測通過）：

```
客人 → service@haiwangzi.xyz →(ImprovMX 轉寄)→ haiwangzi.northeast.coast@gmail.com
     → 系統 IMAP 定時讀(/api/cron/email-inbound-poll) → ingestInboundEmail → 後台收件匣
回信 → 後台 /admin/email 按寄出 → Zeabur Email(ZSend) → 客人
```

已完成的程式（全部 build 通過）：
| 區塊 | 檔案 |
|---|---|
| 收信入庫共用邏輯 | `src/lib/email-inbound.ts`（去重→threading→寫 DB） |
| Gmail IMAP 讀信器 | `src/lib/gmail-reader.ts`（imapflow + mailparser；只收轉進來的 @haiwangzi.xyz 信、過濾私人信；附件存 R2 私密 bucket；標已讀） |
| 收信 cron | `src/app/api/cron/email-inbound-poll/route.ts`（Bearer CRON_SECRET，建議每 1–3 分鐘） |
| Console 前端頁 | `src/app/admin/email/page.tsx`（三欄：列表/篩選/搜尋 · 對話 · 回信/改狀態） |
| 後台選單入口 | AdminShell 「行銷/通知」群組 → 📧 客服信箱 |
| Postmark webhook | `src/app/api/webhooks/email/inbound`（保留為備援，與 IMAP 共用 ingest） |

新增依賴：`imapflow`、`mailparser`、`@types/mailparser`。

### ✅ 上線清單（go-live）
1. **Gmail App Password**：到 `haiwangzi.northeast.coast@gmail.com` 開兩步驟驗證 → 產生 App Password → 設 Zeabur 環境變數 `INBOUND_GMAIL_APP_PASSWORD`（`INBOUND_GMAIL_USER` 已預設該信箱）。
2. **Zeabur 環境變數**：確認 `ZSEND_API_KEY`/`ZSEND_FROM`(發信，既有)、`INBOUND_GMAIL_*`(收信)、`CRON_SECRET`(既有)。
3. **部署**：push 上 master → `docker-entrypoint.sh` 自動 `prisma db push` 建 email 三張表。
4. **排程收信**：在排程器(Cronicle)加一個每 1–3 分鐘打 `GET https://haiwangzi.xyz/api/cron/email-inbound-poll`、帶 `Authorization: Bearer <CRON_SECRET>`。
5. **驗收**：寄信到 service@ → 等 cron 跑 → 後台 `/admin/email` 看到該信 → 回信 → 客人收到。

### 待選強化（非必要）
- 快速範本（改期確認/訂位確認/海況預報/裝備提醒/退費說明）做成帶變數樣板。
- 右側「連動訂位」context 卡（thread.bookingId → 顯示訂位資訊）。
- Inbound 本地測試（vitest）。
