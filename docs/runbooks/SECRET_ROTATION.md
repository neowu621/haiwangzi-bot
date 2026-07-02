# 🔑 金鑰輪換（Secret Rotation）操作手冊

> **背景**：`.env` 檔頭註解記載——這組金鑰已於 **2026-05-11 的對話中外洩**。`.env` 雖在 `.gitignore`、未進版控，但**外洩的舊值仍然有效**，任何拿到舊值的人都能冒用。必須到各平台**重新產生（rotate）並更新 Zeabur 環境變數**，讓舊值作廢。
>
> 建立：2026-07-02（安全稽核 v773）。負責人：老闆本人（工程無法代操，涉及各平台帳號登入）。

---

## 通則（先讀）

- **在哪改值**：正式站的環境變數在 **Zeabur → 專案 → 服務 → Variables**。改完 Zeabur 會重新部署（約 7–9 分鐘）。
- **驗證上線**：`curl https://haiwangzi.xyz/api/healthz` 看 `version` 有沒有換版（或改完值後觀察功能）。
- **一次換一類、換完驗證再換下一類**，避免多項同時壞掉難以定位。
- **本機 `.env` 也要同步更新**（開發用），但正式站以 Zeabur 為準。
- **不要把新值貼進任何對話、截圖、或 commit**。`.env` 保持只在本機/Zeabur。

---

## P0 — 確認外洩，最高優先（2026-05-11 那批）

### 1. LINE Messaging API — `LINE_CHANNEL_ACCESS_TOKEN`
1. 進 [LINE Developers Console](https://developers.line.biz/console/) → 你的 **Provider** → **Messaging API channel**。
2. **Messaging API** 分頁 → **Channel access token (long-lived)** → 按 **Reissue（重新發行）**。
3. 舊 token 立即失效；複製新 token。
4. Zeabur 更新 `LINE_CHANNEL_ACCESS_TOKEN` = 新值。
5. **驗證**：改完部署後，觸發一次會推 LINE 的動作（例如後台送測試通知 / 客戶上傳付款證明），確認老闆有收到 LINE 推播。
- ⚠️ `LINE_CHANNEL_SECRET`（webhook 簽章用）是 channel 的固定值、**無法單獨 reissue**。若要徹底更換，只能新建一個 Messaging API channel 並全面搬遷（成本高）。實務上：先把 access token reissue（已能作廢主要外洩風險），channel secret 列入「若確定外洩且風險高才重建 channel」。

### 2. Cloudflare R2 — `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
1. 進 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **R2** → **Manage R2 API Tokens**。
2. **Create API token**：權限給 **Object Read & Write**，範圍限定你的 bucket（`haiwangzi-public` / `haiwangzi-private`）。
3. 建立後**只會顯示一次** Access Key ID 與 Secret Access Key，複製起來。
4. Zeabur 更新 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` = 新值（`R2_ACCOUNT_ID`、`R2_ENDPOINT`、bucket 名不用改）。
5. **驗證**：部署後上傳一張付款截圖 / 潛點照片，確認能上傳且能顯示（presigned URL 正常）。
6. 驗證成功後，回 Cloudflare **刪除舊的 API token**（作廢外洩值）。

### 3. `JWT_SECRET`（後台 / 會員 web session 簽章）
1. 產生新亂數：`openssl rand -hex 32`（32 bytes）。
2. Zeabur 更新 `JWT_SECRET` = 新值。
3. **副作用**：所有現有後台 / 會員 web 登入 session 立即失效 → **大家要重新登入一次**（正常現象，事先知會同事）。
4. **驗證**：用後台帳號重新登入成功即可。

### 4. `CRON_SECRET`（排程認證，兩邊必須一致）
1. 產生新亂數：`openssl rand -hex 32`。
2. Zeabur（本專案）更新 `CRON_SECRET` = 新值。
3. **同時**到 Cronicle（`https://neowu-cron-hub.zeabur.app`）把環境變數 **`HAIWANGZI_CRON_SECRET`** 也改成同一個新值 —— **兩邊值必須相同**，否則排程（每日提醒 / 天氣檢查等）會回 401 失效。
4. **驗證**：手動觸發一次 cron（或等下一次排程），確認 `/api/cron/*` 回 200 而非 401。

---

## P1 — 保險起見一併輪換（曾與外洩檔同存，風險連帶）

> 這些不一定在 2026-05-11 那批，但既然整個 `.env` 曾外洩，建議一併換掉最安全。可排在 P0 之後分批做。

| 變數 | 在哪 rotate | 更新後驗證 | 備註 |
|---|---|---|---|
| `ZSEND_API_KEY` | Zeabur → ZSend 服務金鑰 | 寄一封測試信 | 全站 Email + 客服信箱共用 |
| `ZSEND_WEBHOOK_SECRET` | Zeabur Email → Webhooks 刪除重建 status webhook | 寄信後看送達狀態有更新 | `.env` 註解已警告勿沿用外露值 |
| `INBOUND_WEBHOOK_SECRET` | 自訂強隨機 `openssl rand -base64 32`，同步 Postmark inbound 設定 | 收信備援路徑測試 | 收信主路徑是 IMAP，此為備援 |
| `GMAIL_APP_PASSWORD` / `INBOUND_GMAIL_APP_PASSWORD` | [Google 應用程式密碼](https://myaccount.google.com/apppasswords) 刪舊建新 | 寄/收信測試 | 需先開該 Gmail 兩階段驗證 |
| `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/) → OAuth 用戶端 → 重設密鑰 | 後台 Google 登入測試 | 只影響後台 Google 登入 |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Developers → LINE Login channel | `/pclogin` 會員登入測試 | 桌面會員 OAuth 用 |
| `TURNSTILE_SECRET_KEY` | [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) widget 輪換 | `/contact` 表單送出測試 | 前端 site key 未變可不動 |
| `ADMIN_WEB_SECRET` | 自訂強隨機字串 | 用它重設一次密碼測試 | 後台忘記密碼重設用 |
| `CWA_API_KEY` | [氣象署 opendata](https://opendata.cwa.gov.tw/userLogin) 重新取得 | 天氣 cron 測試 | 影響天氣檢查排程 |
| DB 密碼（`DATABASE_URL`） | Zeabur → PostgreSQL 服務改密碼 | 部署後任一讀 DB 功能正常 | 改完務必同步更新 `DATABASE_URL` |

---

## 完成檢查清單

- [ ] LINE `LINE_CHANNEL_ACCESS_TOKEN` reissue + Zeabur 更新 + 推播驗證
- [ ] R2 新 API token + Zeabur 更新 3 值 + 上傳驗證 + 刪舊 token
- [ ] `JWT_SECRET` 換新 + 重新登入驗證（已知會踢出所有 session）
- [ ] `CRON_SECRET` 換新 + Cronicle `HAIWANGZI_CRON_SECRET` 同步 + cron 200 驗證
- [ ] （P1）ZSend / Gmail / Google / LINE Login / Turnstile / ADMIN_WEB_SECRET / CWA / DB 密碼
- [ ] 本機 `.env` 同步新值
- [ ] 全部完成後，`.env` 檔頭那段「2026-05-11 外洩」警告註解可更新為「已於 YYYY-MM-DD 完成 rotate」

---

## 之後如何預防
- 金鑰**永遠只存在 Zeabur 環境變數與本機 `.env`**，不進聊天、不進截圖、不進 commit。
- `.env` 保持列在 `.gitignore`（目前 ✅）。
- 需要分享設定時，只分享 `.env.example`（無實際值）。
- 定期（如每半年）或人員異動時輪換一次。

相關：[docs/index.html](../index.html)、[docs/DEPLOY_VERIFY.md](../DEPLOY_VERIFY.md)、`.env.example`（變數清單）。
