# TODO — 待辦與後續事項

> 整理時間：2026-05-29（版本 `20260529_119`）
> 用途：跨裝置 / 新 session 接手時的待續清單。完成後請打勾或移除，並更新 [STATUS.md](STATUS.md)。

---

## 🔴 P0 — 影響正式營運（建議優先）

### 1. Cron 排程不完整（只跑了 3 / 11 個端點）
`.github/workflows/cron-daily.yml` 每天 08:00（Asia/Taipei）只觸發 3 個：
`lv1-prepay-reminder`、`cleanup-old-payment-proofs`、`daily-settlement-reminder`。

`src/app/api/cron/` 下其實有 **11 個端點**，以下這些目前**沒有任何排程在跑**：

- [ ] `reminders` — D-1 / D-3 預約提醒（STATUS 原規劃 Cronicle 每 30 分鐘跑一次）**← 客戶體驗核心，務必排上**
- [ ] `weather-check` — 風速 / 海況檢查通知
- [ ] `birthday-credits` — 生日禮金發放
- [ ] `admin-weekly` — admin 每週報表
- [ ] `expire-trip-photos` — 旅行團照片過期清理
- [ ] （`reset-demo` / `test-email` / `test-r2` 應為手動測試用，不需排程）

> 決策點：要全部塞進同一個 GitHub Actions workflow（不同 step / schedule），還是用 Zeabur cron / Cronicle？
> `reminders` 需要高頻（30 分鐘），不適合每日 workflow，要獨立排程。

### 2. 環境變數 / 外部服務設定（需使用者在 Zeabur / Cloudflare 操作）
- [ ] `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` — 未設時付款憑證走 base64 直接存進 Postgres 字串欄，大檔會撐爆 DB
- [ ] R2 兩個 bucket 的 CORS 設定（否則瀏覽器 PUT 會 CORS 失敗）
- [ ] 銀行匯款資訊 `BANK_NAME` / `BANK_BRANCH` / `BANK_ACCOUNT` / `BANK_HOLDER`（未填時付款頁與訂金 Flex 顯示空白 / 「—」）

---

## 🟡 P1 — 功能補完 / 已知缺口

- [ ] **過期場次自動結束 cron**（v113 明確標註「暫不實作」）：每天 03:30 把日期已過但 status 仍為 `open` 的場次自動 update 為 `completed`。目前只在顯示層 / 編輯層擋，DB 內仍可能殘留 `open`。
- [ ] **LiffShell Splash 畫面**（`src/components/shell/LiffShell.tsx:69`）：v18 因 hydration race 暫時停用，設計 OK，待修好再開回。
- [ ] **錯誤回報接口**（`src/lib/error-report.ts:73`）：Sentry / Better Stack 目前只是留位 (stub)，尚未接上真正的錯誤監控。

---

## 🟢 P2 — 文件 / 收尾

- [ ] STATUS.md 下半部的「部署 Checklist」與「接下來需您補的設定」仍是舊的本機開發版內容，待與目前已上線狀態對齊（本次只更新了 header + 近期進度）。
- [ ] 確認 GitHub Actions cron 打的網域 `https://haiwangzi.zeabur.app` 與實際正式網域一致。

---

## 📌 接手指引

- 目前進度 PR：[#1](https://github.com/neowu621/haiwangzi-bot/pull/1)（branch `claude/progress-update-tloc9`）
- 逐版變更：[CHANGELOG.md](CHANGELOG.md)（已補到 `20260529_119`）
- 整體現況：[STATUS.md](STATUS.md)
- 每次 push 前記得 bump `src/lib/version.ts` 的 `APP_VERSION`
