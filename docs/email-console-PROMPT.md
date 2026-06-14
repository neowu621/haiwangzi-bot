# 給 Claude Code 的指令 — 海王子 客服信箱 Console 整合

把這份分兩階段貼給 Claude Code。**先貼 Phase 1,review 過再貼 Phase 2。**

前置：先把 bundle 解壓在專案根目錄下的 `./haiwangzi-email-console/`。

技術棧：Next.js + Hono + Prisma + PostgreSQL，部署在 Zeabur。

---

## Phase 1 — 整合進專案

```
我要把一個「客服信箱 console」功能合進這個海王子專案。
bundle 已解壓在 ./haiwangzi-email-console/，請先讀它的 README.md 當規格依據，再完整整合。

技術棧：Next.js + Hono + Prisma + PostgreSQL，部署在 Zeabur。

請執行：

1. 讀 ./haiwangzi-email-console/README.md，了解架構與目的
   （service@haiwangzi.xyz 對外、Zeabur Email 寄信、inbound webhook 收信）。

2. 把程式碼搬到專案對應位置（先看我現有目錄結構，放到正確的地方，不要照搬路徑）：
   - src/lib/zeabur-email.ts、threading.ts
   - src/routes/webhooks.status.ts、webhooks.inbound.ts、admin.email.ts

3. Prisma：把 prisma/schema.email.prisma 的 model（EmailThread / EmailMessage /
   SuppressedEmail）和三個 enum 合併進現有的 prisma/schema.prisma，**不要覆蓋整個檔案**。
   並在我現有的 Booking model 加上反向 relation：emailThreads EmailThread[]。
   完成後給我 migration 指令，**先不要自動 migrate 正式 DB**。

4. 把三支 route 掛載到 Hono app：
   - /api/webhooks/email/status
   - /api/webhooks/email/inbound
   - /api/admin/email
   請依我實際的 Hono 進入點與 basePath 調整路徑前綴，確認對外網址正確是 /api/... 開頭。

5. 把 .env.example 的變數補進專案 .env 範本，並列出我要在 Zeabur 後台補哪些環境變數。

6. ui/email-console.html 只是設計稿，先不接，放 docs/ 參考。README 放 docs/email-console.md。

完成後請告訴我：改了哪些檔案、Booking relation 怎麼加、migration 指令、缺哪些依賴要
npm install、有沒有型別錯誤或要我手動確認的點（特別是 zeabur-email.ts 裡寄信自訂
header 那個 TODO）。

先不要 git push，改完讓我 review。
```

---

## Phase 2 — 寫 inbound 測試並驗收（Phase 1 review 過後再貼）

```
幫我為剛整合的 inbound webhook（/api/webhooks/email/inbound）寫本地測試，
模擬一封客人來信打進去，驗證收信流程正確。

請做：

1. 在專案測試目錄建測試檔（用我現有測試框架，沒有的話用 vitest），測 webhooks.inbound.ts。

2. 準備一個「Postmark inbound 格式」假 payload，模擬客人 林小姐 寄信到 service@haiwangzi.xyz，
   內容「6/22 龍洞兩支想改期」。欄位完整：From / FromFull / To / Subject / TextBody /
   HtmlBody / MessageID / Headers（含 Message-ID）/ Attachments。

3. 至少涵蓋：
   (a) 全新來信 → 開一個新 EmailThread + 一筆 INBOUND EmailMessage，thread.status = WAITING
   (b) secret query 錯誤 → 回 401，DB 不寫入
   (c) 同一封送兩次（messageId 相同）→ 第二次 dedup，不重複建立
   (d) 第二封帶 In-Reply-To 指向第一封 messageId → 掛進同一 thread，不開新串

4. 測試對測試 DB 跑，每個 case 前後清乾淨資料。需要的話告訴我怎麼設測試用 DATABASE_URL。

5. 另給一個獨立手動腳本（scripts/test-inbound.sh），用 curl 對本地 dev server 打一發假
   inbound，讓我肉眼看 DB 有沒有進資料。

跑給我看結果。有失敗的 case 先別急著改 handler，先讓我確認是測試寫錯還是 handler 有 bug。
```

---

## 附：你自己手動快速驗（不靠測試框架）

dev server 跑起來後：

```bash
# 1) 打一發假的客人來信（換成你的 port 和 INBOUND_WEBHOOK_SECRET）
curl -X POST "http://localhost:3000/api/webhooks/email/inbound?secret=你的密鑰" \
  -H "Content-Type: application/json" \
  -d '{
    "From": "amy.lin@gmail.com",
    "FromFull": { "Email": "amy.lin@gmail.com", "Name": "林小姐" },
    "To": "service@haiwangzi.xyz",
    "Subject": "6/22 龍洞兩支想改期",
    "TextBody": "汪汪教練您好，想把 6/22 改到 6/29，謝謝！",
    "HtmlBody": "<p>想把 6/22 改到 6/29，謝謝！</p>",
    "MessageID": "test-msg-001@gmail.com",
    "Headers": [{ "Name": "Message-ID", "Value": "<test-msg-001@gmail.com>" }],
    "Attachments": []
  }'
# 預期 {"ok":true}

# 2) 看資料有沒有進
npx prisma studio
#   → EmailThread 多一筆（林小姐、WAITING）、EmailMessage 多一筆（INBOUND）

# 3) 驗去重：同一條再打一次 → 預期 {"ok":true,"dedup":true}，DB 不多一筆

# 4) 驗 threading：MessageID 改 test-msg-002@gmail.com，
#    Headers 加 {"Name":"In-Reply-To","Value":"<test-msg-001@gmail.com>"}，
#    再打 → 應掛進同一 thread，不開新串
```

---

## 整合後仍需你手動處理（Claude Code 碰不到的外部設定）

對照 README 第 2 節「現況表」逐項補齊：
- Zeabur 環境變數（API key、FROM、ZSEND_WEBHOOK_SECRET、INBOUND_WEBHOOK_SECRET、DATABASE_URL）
- status webhook：deploy 後回 Zeabur 頁按「測試」轉綠；上線前重建一把新金鑰
- Inbound 服務（Postmark）開通、驗網域、MX 指過去、填 inbound webhook URL
- 確認 haiwangzi.xyz root domain 指到後台 app（否則改 endpoint 成 app 實際網址）
