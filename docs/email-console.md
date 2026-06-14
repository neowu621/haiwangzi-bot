# 海王子 客服信箱 Console — 實作規格與導入包

> service@haiwangzi.xyz 對外身分 · Zeabur Email 寄信 · Inbound Parse 收信 · 全部進後台
> 整理日期：2026-06-14 ｜ 歸屬：海王子（Ocean Prince）專案

把這個資料夾合進海王子 repo（建議放 `docs/` + 對應的 `src/` 路徑），就是這個功能的單一真實來源。

---

## 0. 一句話總結

會員端從頭到尾只看到 **service@haiwangzi.xyz** 一個地址；背後**寄信由 Zeabur Email、收信由 Inbound Parse 服務**，兩者各透過 webhook 把狀態與新信餵進海王子後台 DB，前端呈現成一個三欄式收件匣 console。

---

## 1. 架構

```
                    ┌────────── service@haiwangzi.xyz ──────────┐
   客人寄信 ──MX──▶ │  Inbound Parse 服務（Postmark / inbound） │
                    │  收信 → 解析 MIME → POST webhook(JSON)    │
                    └───────────────┬───────────────────────────┘
                                    ▼  /api/webhooks/email/inbound
        ┌──────────────  海王子後台 (Next.js + Hono + Prisma)  ──────────────┐
        │  webhooks/inbound  → 驗章 → 去重(messageId) → threading → 寫 DB    │
        │  webhooks/status   ← Zeabur Email 寄送狀態（本文件重點）           │
        │  PostgreSQL: EmailThread / EmailMessage                            │
        │  Admin Console 頁（ui/email-console.html 為設計稿）                │
        └───────────────┬────────────────────────────────────────────────────┘
                        ▼  回信 / 主動寄信
              Zeabur Email API  POST https://api.zeabur.com/v1/zsend/emails
              from: service@haiwangzi.xyz
                        ▼
                    客人收到
```

**為什麼收/發要分兩家**：寄信不經過你的 MX；MX 只決定「進來的信落在哪」。所以把 MX 指到 Inbound 服務不影響 Zeabur 寄信，兩條路各管一個方向。做了 App 內收件匣後，舊的「ImprovMX→Gmail」可退場，SPF 也只需保留 Zeabur Email 的 include。

---

## 2. 目前進度（截至整理時）

| 項目 | 狀態 | 備註 |
|---|---|---|
| Zeabur Email 寄信 | ✅ 已綁 service@haiwangzi.xyz | DKIM/SPF/DMARC 由 Zeabur 自動建 |
| **Status webhook** | ⚠️ 已建立、**測試失敗** | endpoint=`https://haiwangzi.xyz/api/webhooks/email/status`，事件 7 個全勾。失敗是因為 handler 還沒部署 → 部署本包的 `webhooks.status.ts` 並回 200 後，重按「測試」即轉綠 |
| Webhook 簽章金鑰 | ✅ 已產生 | 進環境變數 `ZSEND_WEBHOOK_SECRET`。**上線前重建一把新金鑰**（舊的曾外露於對話） |
| Inbound Parse 服務 | ⬜ 待開通 | 建議 Postmark Inbound；驗證網域 → MX 指過去 → 填 inbound webhook URL |
| DB schema | ⬜ 待 migrate | 見 `prisma/schema.email.prisma` |
| 後台 Console UI | ⬜ 待實作 | 設計稿 `ui/email-console.html` |

### ⚠️ Endpoint 指向先確認
`https://haiwangzi.xyz`（root domain）必須真的指到 Zeabur 上的後台服務。若 app 其實綁在 `app.haiwangzi.xyz`，請二擇一：把後台綁上 root domain，或把 webhook endpoint 改成 app 實際網址。先用 Zeabur 後台的「測試連線」打一發，回 200 才算通。

---

## 3. 資料模型

見 `prisma/schema.email.prisma`。核心兩張表：

- **EmailThread**：一條對話串。`status`(待回覆/處理中/已結案)、`tags`、`bookingId`(連動訂位)、`assignee`、`lastMessageAt`。
- **EmailMessage**：一封信。`direction`(INBOUND/OUTBOUND)、`messageId`(去重關鍵)、`inReplyTo`/`references`(threading)、`providerId`、`status`(收:RECEIVED；寄:QUEUED→SENT→DELIVERED/BOUNCED/FAILED)、`attachments`。

**Threading**：收 inbound 時用 `In-Reply-To`/`References` 比對既有 `messageId` 命中就掛同串；否則用「寄件人 + 正規化主旨 + 近期」找；再不行開新串。回信務必帶 `In-Reply-To`/`References`，客人端才接同一串。

---

## 4. API 端點

```
# Webhook（對外，需驗章 + 去重，不需登入）
POST /api/webhooks/email/status    # Zeabur Email 寄送狀態 → 更新 message.status
POST /api/webhooks/email/inbound   # Inbound 服務送來的新信 → upsert thread + message

# 後台 Console（需 admin 登入）
GET   /api/admin/email/threads           # 列表 ?status= &tag= &q= &cursor=
GET   /api/admin/email/threads/:id       # 對話串詳情（含 messages）
POST  /api/admin/email/threads/:id/reply # 回信 → Zeabur Email → 寫 OUTBOUND
POST  /api/admin/email/compose           # 主動新信
PATCH /api/admin/email/threads/:id       # 改狀態/指派/標籤/連動訂位
```

對應程式：`src/routes/webhooks.status.ts`、`webhooks.inbound.ts`、`admin.email.ts`；寄信與驗章封裝在 `src/lib/zeabur-email.ts`。

---

## 5. Status webhook 事件對應（這支 webhook 的全部用途）

> ⚠️ 這支 webhook **只回報「你寄出去的信」的後續**，不會收到客人來信。收信是 inbound webhook 的事。

| Zeabur 事件 | 意義 | 動作 |
|---|---|---|
| 發送 send | SES 已收下，準備投遞 | message → `SENT` |
| 投遞 delivery | 對方伺服器已收下＝真送達 | message → `DELIVERED`（console 顯示 ✓ 已送達） |
| 退信 bounce | 地址無效/信箱滿/拒收 | message → `BOUNCED`，**該訂位標紅 + 通知汪汪改用 LINE/電話**，email 標記無效 |
| 投訴 complaint | 被檢舉垃圾信 | 加入抑制名單、停止再寄（保護網域信譽） |
| 拒絕 reject | 根本沒寄出（內容/抑制名單） | message → `FAILED`，記 log 告警 |
| 開啟 open | 對方開信（追蹤像素，有誤差） | engagement 紀錄（可選） |
| 點擊 click | 對方點了信中連結 | engagement 紀錄（天候/改期確認信回饋） |

---

## 6. 導入 SOP

**Phase 0 — 帳號**
1. 開通 Inbound 服務（建議 Postmark），驗證 haiwangzi.xyz。
2. 確認 Zeabur Email 已綁 service@、DKIM/SPF/DMARC 綠燈。

**Phase 1 — DNS（Zeabur DNS 面板）**
3. MX 指向 Inbound 服務（取代舊 ImprovMX）。
4. 加 Inbound 服務要求的驗證 TXT（若有）。
5. SPF 維持單一一筆（只留 Zeabur Email 的 include）；DMARC 保留。

**Phase 2 — Webhook**
6. Zeabur Email status webhook：endpoint = `/api/webhooks/email/status`，金鑰進 `ZSEND_WEBHOOK_SECRET`。（已建立，待 handler 上線後測試轉綠）
7. Inbound 服務 webhook：URL = `/api/webhooks/email/inbound`，密鑰進 `INBOUND_WEBHOOK_SECRET`。

**Phase 3 — 後端**
8. 合併 `prisma/schema.email.prisma` → `prisma migrate`。
9. 掛上三支 route（webhooks 兩支 + admin 一支），設定環境變數。

**Phase 4 — 前端**
10. 依 `ui/email-console.html` 做三欄 Console，套 admin 權限。
11. thread 綁 `bookingId`，右側 context 面板顯示訂位卡。
12. 快速範本（改期確認/訂位確認/海況預報/裝備提醒/退費說明）做成帶變數樣板。

**Phase 5 — 測試上線**
13. 端到端：外部寄入 service@ → 後台收得到；後台回信 → 客人收到且接同串；測 bounce 標紅；重送同信測去重。
14. **重建一把新的 status webhook 金鑰**作正式上線用。

---

## 7. 環境變數

見 `.env.example`。

---

## 8. 安全 / 維運

- **驗章**：兩個 webhook 都必須驗簽（status 用 HMAC-SHA256，raw body）；否則任何人可偽造客人來信或假狀態。
- **冪等**：webhook 是 at-least-once，靠 `messageId`/`providerId` 去重。
- **防重放**：status webhook 檢查 timestamp 新鮮度（±5 分鐘）。
- **附件**：存物件儲存，DB 只留 URL + metadata。
- **權限**：`/api/admin/**` 全要登入；信件含個資，設保存期限。
- **保底**：初期可讓 Inbound 服務同時轉一份到海王子 Gmail 當備份，穩定後再關。

---

## 9. 檔案清單

```
haiwangzi-email-console/
├── README.md                       ← 本文件
├── .env.example
├── prisma/schema.email.prisma      ← 合併進你的 schema
├── src/lib/zeabur-email.ts         ← 寄信封裝 + status 驗章
├── src/lib/threading.ts            ← 對話串比對
├── src/routes/webhooks.status.ts   ← Zeabur Email 狀態 webhook
├── src/routes/webhooks.inbound.ts  ← Inbound 收信 webhook（Postmark 範例）
├── src/routes/admin.email.ts       ← 列表/詳情/回信/狀態
└── ui/email-console.html           ← UI 設計稿
```
