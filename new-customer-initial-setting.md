# 新客戶系統初始設定指南

> **版本**：適用 v20260528_xx 以上  
> **目標讀者**：負責部署此系統的工程師或系統管理員

---

## 一、架設前準備清單

### 1.1 LINE 官方帳號（必須）
- [ ] 至 [LINE Business Center](https://business.line.me/) 申請 **LINE 官方帳號（OA）**
- [ ] 在 LINE Developers Console 建立 **Messaging API Channel**，取得：
  - `Channel Access Token`（長期）
  - `Channel Secret`
- [ ] 建立 **LINE Login Channel + LIFF App**，設定 LIFF Endpoint URL 為 `https://你的網域/liff`，取得：
  - `LIFF ID`（格式如 `2xxxxxxxxx-xxxxxxxx`）
  - `LIFF Channel ID`

### 1.2 雲端資料庫（必須）
- [ ] 建立 **PostgreSQL** 資料庫（建議 Zeabur / Supabase / Railway）
- [ ] 取得完整連線字串 `postgresql://user:password@host:port/dbname`

### 1.3 檔案儲存（選用，上傳圖片才需要）
- [ ] 申請 **Cloudflare R2** 帳號
- [ ] 建立兩個 Bucket：`xxx-public`（公開）、`xxx-private`（私有）
- [ ] 產生 R2 API Token（Access Key ID + Secret Access Key）
- [ ] 設定公開 Bucket 的 Public URL（R2 自訂網域或 r2.dev 網址）

### 1.4 Email 寄信（選用，發 Email 通知才需要）
- [ ] 準備一個 **Gmail 帳號**（或 Google Workspace）
- [ ] 開啟兩步驟驗證
- [ ] 產生 **App Password**（16 字元，[設定方式](https://myaccount.google.com/apppasswords)）

### 1.5 部署平台
- [ ] 註冊 **Zeabur** 帳號（或其他支援 Docker 的平台）
- [ ] Fork 或 Clone 此 Repo

---

## 二、環境變數設定

### 🔴 初始設定必填（部署前必須設好，之後只能透過重新部署修改）

| 環境變數 | 說明 | 範例值 |
|---|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 長期存取 Token | `xxxxxxx...` |
| `LINE_CHANNEL_SECRET` | LINE Channel Secret（用於 Webhook 驗簽 + 初始管理員設定） | `abc123...` |
| `LINE_LIFF_ID` | LIFF App ID（伺服器端用） | `2010006458-fyokMnVv` |
| `NEXT_PUBLIC_LIFF_ID` | LIFF App ID（前端 LIFF.init 用，與上方相同） | `2010006458-fyokMnVv` |
| `LINE_LIFF_CHANNEL_ID` | LIFF Channel ID（idToken audience 驗證） | `2010006458` |
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgresql://root:xxx@host:5432/dbname` |
| `JWT_SECRET` | Admin Web Session 簽名金鑰（32 字元以上亂數） | `openssl rand -hex 32` 產生 |
| `CRON_SECRET` | 排程 API 認證金鑰（32 字元以上亂數） | `openssl rand -hex 32` 產生 |
| `NEXT_PUBLIC_APP_NAME` | **品牌名稱**（顯示於後台、LIFF、錯誤訊息） | `東北角海王子潛水團` |
| `NEXT_PUBLIC_BASE_URL` | 部署網址（含 https://） | `https://haiwangzi.zeabur.app` |
| `NEXT_PUBLIC_LINE_OA_ID` | LINE OA 帳號 ID（顯示於首頁） | `@106cqtpd` |
| `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | LINE 加好友連結 | `https://line.me/R/ti/p/@106cqtpd` |
| `NEXT_PUBLIC_APP_TAGLINE` | 首頁標語 | `安全．專業．陪你看見海` |
| `APP_DEFAULT_REGION` | 預設地區名（通知訊息 fallback 用） | `東北角` |

### 🟡 選填（有對應功能才需要）

| 環境變數 | 說明 | 預設 |
|---|---|---|
| `GMAIL_USER` | 寄件 Gmail 帳號 | — |
| `GMAIL_APP_PASSWORD` | Gmail App Password | — |
| `EMAIL_FROM` | 顯示寄件人名稱 + Email | `{APP_NAME} <gmail_user>` |
| `EMAIL_REPLY_TO` | 回信地址 | 同 `GMAIL_USER` |
| `BANK_NAME` | 銀行名稱（顯示於付款頁） | — |
| `BANK_BRANCH` | 分行名稱 | — |
| `BANK_ACCOUNT` | 帳號（顯示於付款頁） | — |
| `BANK_HOLDER` | 戶名 | — |
| `R2_ACCOUNT_ID` | Cloudflare R2 帳號 ID | — |
| `R2_ACCESS_KEY_ID` | R2 存取金鑰 ID | — |
| `R2_SECRET_ACCESS_KEY` | R2 存取金鑰 Secret | — |
| `R2_ENDPOINT` | R2 端點 URL | — |
| `R2_PUBLIC_BUCKET` | 公開 Bucket 名稱 | `xxx-public` |
| `R2_PRIVATE_BUCKET` | 私有 Bucket 名稱 | `xxx-private` |
| `R2_PUBLIC_URL` | 公開 Bucket 的對外 URL | — |

---

## 三、部署步驟

### 3.1 Zeabur 快速部署

1. 在 Zeabur 建立新專案，選擇 **GitHub** 部署方式
2. 選擇 Fork 後的 Repo，選 `master` 分支
3. Zeabur 會自動偵測 `Dockerfile` 並開始 Build
4. 在「環境變數」分頁依據上表填入所有 🔴 必填項目
5. 儲存環境變數後，**重新觸發部署**（讓新 env var 生效）
6. 部署完成後，到「網域」分頁設定自訂網域或使用 `.zeabur.app` 子網域

### 3.2 驗證部署是否成功

```bash
# 健康檢查
curl https://你的網域/api/healthz

# DB 連線確認
curl https://你的網域/api/dbcheck
```

兩者都應回傳 `{"ok":true}` 或類似成功訊息。

---

## 四、初始管理員 / 老闆帳號設定

> ⚠️ 這個步驟**必須在部署完成後、第一次有人使用之前**完成。

### 步驟一：取得你的 LINE User ID

1. 用你的 LINE 帳號**加入剛設定好的 LINE 官方帳號為好友**
2. 加入後，系統會在資料庫建立你的 User 記錄
3. 取得 LINE User ID 的方式：
   - 方法 A：到 LINE Developers Console → 官方帳號的 Messaging API → 「Webhook」→ 傳送測試訊息，從 log 找 `userId`
   - 方法 B：前往 `https://你的網域/admin/settings` 嘗試登入後，從後台「會員管理」查自己的 LINE ID 欄位

### 步驟二：呼叫 Bootstrap API 設定第一個管理員

```bash
curl -X POST https://你的網域/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "lineUserId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "secret": "你的_LINE_CHANNEL_SECRET"
  }'
```

成功回應：
```json
{ "ok": true, "user": { "lineUserId": "U...", "role": "admin", ... } }
```

### 步驟三：登入後台並設定老闆帳號

1. 開啟 `https://你的網域/admin/login`
2. 用管理員的 LINE 帳號掃碼或輸入手機號碼登入
3. 進入「**會員管理**」→ 找到目標會員 → 編輯角色 → 設為 `boss`（老闆）或 `admin`（管理員）

> **角色說明**：
> - `customer`：一般會員（預設）
> - `coach`：教練（可查看自己的場次與出席）
> - `admin`：管理員（可存取全部後台功能）
> - `boss`：老闆（與 admin 相同權限，無法被降級，顯示於報表）

---

## 五、後台可隨時設定的項目

> 以下設定**不需要重新部署**，登入後台後隨時可改。

### `/admin/settings` 系統設定

| 設定 | 說明 |
|---|---|
| Hero 標題 / 副標題 / 歡迎語 | LIFF 首頁顯示文字 |
| Footer 標語（中英文） | LIFF 頁腳文字 |
| 啟動畫面（Splash）開關 | 進入 LIFF 時的動畫 |
| 裝備租借費率 | BCD / 調節器 / 防寒衣 / 蛙鞋 / 面鏡 / 電腦錶 / 整套 |
| 場次預設定價 | 新建場次時的預設氣瓶費 / 夜潛費 |
| 教練預設費用 | 新建教練時的預設費用 |
| 生日禮金金額 | 生日自動發放的禮金點數 |
| VIP 升等門檻 | 各 VIP 等級的潛水次數 / 消費金額門檻 |
| 天氣取消風速門檻 | 超過此風速自動通知取消（m/s） |

### 其他後台功能

| 功能 | 位置 |
|---|---|
| 新增教練 | `/admin/coaches` |
| 新增潛點 | `/admin/sites` |
| 設定 VIP 等級名稱 | `/admin/vip-tiers` |
| 管理會員角色 | `/admin/users` → 編輯 |

---

## 六、LINE 後台設定（LINE Developers Console）

部署完成後需要回到 LINE 後台完成以下設定：

### 6.1 設定 Webhook URL
1. LINE Developers → Messaging API Channel → **Webhook settings**
2. Webhook URL 填入：`https://你的網域/api/webhook`
3. 開啟「Use webhook」
4. 點「Verify」確認回應 200

### 6.2 設定 LIFF Endpoint URL
1. LINE Developers → LINE Login Channel → **LIFF**
2. 找到你的 LIFF App → Edit
3. Endpoint URL 填入：`https://你的網域/liff`

### 6.3 同步 Rich Menu（選用）
1. 登入後台 `/admin/settings`
2. 找到「Rich Menu 同步」按鈕，點擊即可

---

## 七、初始設定完成確認清單

```
[ ] 環境變數全部設定完畢
[ ] /api/healthz 回傳成功
[ ] /api/dbcheck 回傳成功
[ ] 已加入 LINE 官方帳號好友（建立 User 記錄）
[ ] 已呼叫 /api/admin/bootstrap 設定第一個 admin
[ ] 已登入 /admin 後台
[ ] /admin/settings 完成品牌設定（Hero 文字、標語等）
[ ] /admin/sites 新增至少一個潛點
[ ] /admin/coaches 新增至少一個教練
[ ] LINE 後台 Webhook URL 設定完成並 Verify
[ ] LINE 後台 LIFF Endpoint URL 設定完成
```

---

## 附錄：常用指令

```bash
# 產生安全亂數 (JWT_SECRET / CRON_SECRET 用)
openssl rand -hex 32

# 健康檢查
curl https://你的網域/api/healthz
curl https://你的網域/api/dbcheck

# 手動觸發 Bootstrap（第一個管理員）
curl -X POST https://你的網域/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"lineUserId":"U...","secret":"LINE_CHANNEL_SECRET 的值"}'
```

---

*本文件由系統自動維護，如有疑問請聯繫系統管理員。*
