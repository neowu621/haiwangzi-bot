# 上線驗證流程（前端 + 後端）

> 目的：每次 push / 部署都照這套跑，確保系統「真的」順利上線、前後端都正常。
> 口訣：**Build 綠 → 推 → 等版本翻 → 跑煙霧測試 → 抽查關鍵流程**。

---

## A. Push 前（本機，必做）

1. **型別/建置綠燈**：`npx next build` 必須 `✓ Compiled successfully`，無 type error。
2. **版本號**：`src/lib/version.ts` 的 `APP_VERSION` 已 bump（`YYYYMMDD_NN`，NN 累加不歸零）。
3. **Schema 變更**：若改了 `prisma/schema.prisma` → 確認 `scripts/migrate-safety.js` 有對應 additive 語句（`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`），且 `npx prisma generate` 過。
4. **不要 push**：`.env`、任何密鑰；`git status` 確認沒有意外檔。
5. **快取/公開 API 安全**：若新增/改動「帶 Cache-Control 的公開 API」→ 確認該回應**不含使用者私有或機敏資料**（grep `authFromRequest|userId|cookies|bearer|secret|token`，應為空）。

## B. 部署後（正式環境，必做）

6. **版本確認**：`curl /api/healthz` 的 `version` == 剛 push 的 `APP_VERSION`（不是還在跑舊版）。
7. **平台狀態**：Zeabur deployment 狀態 `RUNNING`（非 DEPLOYING/FAILED）。卡在「Pulling image」>5 分 → `zeabur service redeploy`。
8. **自動煙霧測試**：
   ```
   node scripts/verify-prod.mjs <APP_VERSION>
   ```
   全部 ✅ 才算過。涵蓋：healthz/版本、首頁、/test 轉址、/liff、/admin/login、受保護 API 401、公開 API 快取標頭、無機敏洩漏。
9. **DB 遷移生效**（若有 schema 變更）：runtime log 出現 `[migrate-safety] ... OK` / `All patches applied`。

## C. 抽查關鍵流程（依本次改動挑，手動或請老闆確認）

- **前端（LINE LIFF / 手機）**：
  - 首頁 `/` 開得開、無預覽標記、學員卡/影片牆/CTA 正常、載入順。
  - LIFF：個人中心 `/liff/profile`、我的預約 `/liff/my`、付款 `/liff/payment` 開得開、能載資料。
  - 後台手機簡版 `/admin/m` 登入後 6 卡有數字。
- **後端 / 通知**：
  - 改到通知/模板 → 觸發一次（如付款駁回、天氣取消、生日補發），確認 LINE/Email/站內到達。
  - 改到 cron → Cronicle `run_event` 跑一次，`get_event_history` code=0。
  - 改到金流/訂單 → 下一筆測試單，確認狀態與抵用金正確。

## D. 回滾

- 版本不符 / 煙霧測試紅燈 / 關鍵流程壞 → 立即 `git revert` 上一個 commit 或重推前一版，重跑 B。

---

### 快速指令
```bash
# 本機
npx next build
# 部署後（把版本換成這次的）
node scripts/verify-prod.mjs 20260610_450
```
