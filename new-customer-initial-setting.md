# 新客戶系統初始設定指南

> **版本**：適用 v20260528_95 以上
> **目標讀者**：負責部署此系統的工程師或系統管理員

---

## 零、申請前必備清單（部署前一週開始準備）

> 以下資訊需要**事先申請好**，部署當下才不會卡關。
> 建議用試算表先把所有金鑰整理好（**Token / Secret 請勿存在程式碼 repo 內**）。

### 0.1 LINE 相關（必申請，最耗時 1-3 天審核）
| 申請項目 | 申請網址 | 取得資訊 | 備註 |
|---|---|---|---|
| LINE 官方帳號（OA） | [business.line.me](https://business.line.me/) | OA ID（`@xxxxxxx`） | 一般帳號免費 |
| Messaging API Channel | [LINE Developers Console](https://developers.line.biz/console/) | `Channel Access Token`、`Channel Secret` | 從 OA 建立 |
| LINE Login Channel | 同上 | `Channel ID`、`Channel Secret` | LIFF 需要 |
| LIFF App | LINE Login Channel → LIFF | `LIFF ID`、`LIFF Channel ID` | Endpoint 先暫填 `https://example.com/liff` 等網域確定後再改 |

### 0.2 雲端服務帳號（必申請）
| 服務 | 用途 | 取得資訊 |
|---|---|---|
| **Zeabur**（或 Vercel / Railway） | 部署平台 | 註冊帳號、綁定 GitHub |
| **PostgreSQL DB**（Zeabur 內建 / Supabase / Neon） | 資料庫 | `DATABASE_URL` 連線字串 |
| **GitHub 帳號** | Repo 託管 | Fork 本專案到自己的帳號 |
| **網域**（選用） | 自訂網址 | DNS 控制權；無自訂可用 `xxx.zeabur.app` |

### 0.3 Gmail 寄信（若要寄通知信，必申請）
| 步驟 | 說明 |
|---|---|
| 1. 準備 Gmail 帳號 | 建議用品牌專用帳號，例如 `mybrand.coast@gmail.com` |
| 2. 開啟兩步驟驗證 | [Google 帳號 → 安全性 → 兩步驟驗證](https://myaccount.google.com/security) |
| 3. 產生 App Password | [產生 App Password](https://myaccount.google.com/apppasswords)，取得 16 字元密碼 |

> ⚠️ 必須先完成「兩步驟驗證」，App Password 選項才會出現。

### 0.4 Cloudflare R2（若要支援照片上傳，選用）
| 步驟 | 說明 |
|---|---|
| 1. 註冊 Cloudflare 帳號 | [cloudflare.com](https://www.cloudflare.com/) |
| 2. 啟用 R2 | Dashboard → R2 → 啟用（需綁信用卡，10 GB 免費） |
| 3. 建立兩個 Bucket | `{brandname}-public`（公開）、`{brandname}-private`（私有） |
| 4. 產生 R2 API Token | R2 → Manage R2 API Tokens → 建立 Read & Write 權限 |
| 5. 設定公開 Bucket 自訂網域（選用） | 用自有網域當 CDN，或用預設 `pub-xxxxx.r2.dev` |

### 0.5 銀行 / 付款資訊（選用，要顯示銀行轉帳資訊才需要）
| 資料 | 範例 |
|---|---|
| 銀行名稱 | 玉山銀行 |
| 分行 | 板橋分行 |
| 帳號 | 0123-4567-8901-2345 |
| 戶名 | XXX潛水有限公司 |

### 0.6 品牌資產（必準備）
| 項目 | 規格 | 用途 |
|---|---|---|
| **Logo 圖片** | 正方形 PNG，建議 512×512 或 1024×1024，背景透明或圓形裁切 | 後台側欄、首頁、LIFF、Email |
| **Favicon**（瀏覽器標籤圖示）| `.ico` 或 32×32 PNG | 瀏覽器分頁 |
| **品牌名稱（中/英）** | 例如「東北角海王子潛水團」 | `NEXT_PUBLIC_APP_NAME` |
| **品牌標語** | 例如「安全．專業．陪你看見海」 | `NEXT_PUBLIC_APP_TAGLINE` |
| **預設地區名稱** | 例如「東北角」 | 通知訊息 fallback |

### 0.7 自行決定的安全密碼（必準備）
| 密碼 | 用途 | 建議產生方式 |
|---|---|---|
| `JWT_SECRET` | Admin Web Session 簽名金鑰 | `openssl rand -hex 32`（32 字元亂數） |
| `CRON_SECRET` | 排程 API 認證金鑰 | `openssl rand -hex 32` |
| `ADMIN_WEB_SECRET` | **管理後台共用門禁密碼**（登入第一步） | 自訂 12 字元以上強密碼，例如 `Brand@2026-Adm!n` |

---

## 一、架設前準備檢核

完成 0.x 後，把所有金鑰整理成下面這份清單再開始部署：

```
LINE 相關：
[ ] LINE OA ID（@xxxxxxx）
[ ] LINE_CHANNEL_ACCESS_TOKEN
[ ] LINE_CHANNEL_SECRET
[ ] LIFF_ID
[ ] LIFF_CHANNEL_ID

雲端：
[ ] Zeabur 帳號 + GitHub 已連結
[ ] DATABASE_URL（PostgreSQL）
[ ] 部署網域確認

Gmail（選用）：
[ ] GMAIL_USER
[ ] GMAIL_APP_PASSWORD

R2（選用）：
[ ] R2_ACCOUNT_ID
[ ] R2_ACCESS_KEY_ID
[ ] R2_SECRET_ACCESS_KEY
[ ] R2_ENDPOINT
[ ] R2_PUBLIC_URL

品牌：
[ ] Logo 圖片（PNG，正方形）
[ ] 品牌名稱（NEXT_PUBLIC_APP_NAME）
[ ] 標語（NEXT_PUBLIC_APP_TAGLINE）
[ ] 預設地區（APP_DEFAULT_REGION）

自訂密碼（用 openssl rand -hex 32 產生）：
[ ] JWT_SECRET
[ ] CRON_SECRET
[ ] ADMIN_WEB_SECRET
```

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
| **`ADMIN_WEB_SECRET`** | **後台登入「管理密碼」共用門禁** | 自訂強密碼如 `Brand@2026-Adm!n` |
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

### 3.1 替換品牌資產（Fork 後、第一次部署前）
1. 將 Logo 圖片以**檔名 `logo.png`**（正方形，建議 512×512 以上）覆蓋 `public/logo.png`
2. （選用）製作 Favicon `.ico` 覆蓋 `src/app/favicon.ico`
3. Commit & Push 到自己的 Repo

### 3.2 Zeabur 快速部署

1. 在 Zeabur 建立新專案，選擇 **GitHub** 部署方式
2. 選擇 Fork 後的 Repo，選 `master` 分支
3. Zeabur 會自動偵測 `Dockerfile` 並開始 Build
4. 在「環境變數」分頁依據上表填入所有 🔴 必填項目
5. 儲存環境變數後，**重新觸發部署**（讓新 env var 生效）
6. 部署完成後，到「網域」分頁設定自訂網域或使用 `.zeabur.app` 子網域

### 3.3 驗證部署是否成功

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
2. **第一步輸入「管理密碼」** = 你設定的 `ADMIN_WEB_SECRET`
3. 第二步：選擇你的身分（剛剛 bootstrap 設好的帳號）
4. 第三步：首次登入會要求設定個人密碼（至少 8 字元）
5. 登入後進入「**會員管理**」→ 找到目標會員 → 編輯角色 → 設為 `boss`（老闆）或 `admin`（管理員）

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

### 🔑 安全密碼變更

| 密碼 | 變更方式 | 影響 |
|---|---|---|
| **管理密碼 `ADMIN_WEB_SECRET`** | Zeabur → Variables → 編輯 → 重新部署 | 所有現有 admin session 立即失效，所有人需用新密碼重新登入 |
| **個人密碼**（每位 admin/boss 自己的）| `/admin/login` → Step 1 過後選身分 → 點「忘記密碼？用管理密碼重設」 | 只影響該帳號 |
| `JWT_SECRET` | Zeabur → Variables → 編輯 → 重新部署 | 所有 admin/LIFF session 立即失效 |
| `CRON_SECRET` | Zeabur → Variables → 編輯 → 重新部署 | 排程器需同步更新 |
| `LINE_CHANNEL_SECRET` | LINE Console 重新產生 → 同步更新 Zeabur Variables | Webhook 簽章 + Bootstrap API 受影響 |

---

## 六、LINE 設定完整 SOP

> ⚠️ **安全鐵則**：所有 LINE 金鑰（Channel Secret、Channel Access Token）**只能**從 LINE Developers Console 直接複製到 Zeabur Variables。**絕對不要**貼到 chat、email、文件、git。

### 6.0 LINE 後台架構速覽

LINE 平台分成 **3 個獨立物件**，新手很容易搞混：

```
LINE Business Center
└── LINE Official Account（OA）        ← 一般行銷後台（OA Manager）
    └── 對應的 Messaging API Channel    ← 在 Developers Console，用來收 webhook / 主動發訊息
LINE Developers Console
├── Provider（廠商，如「Haiwangzi Diving」）
│   ├── Messaging API Channel          ← 對應上面的 OA，給「機器人」用
│   └── LINE Login Channel             ← 給 LIFF / 使用者登入用
│       └── LIFF App                   ← 跑在 LINE 內建瀏覽器的 SPA
```

**對應到本系統的 env var**：

| LINE 後台位置 | env var |
|---|---|
| Messaging API Channel → Basic settings → **Channel secret** | `LINE_CHANNEL_SECRET` |
| Messaging API Channel → Messaging API → **Channel access token (long-lived)** | `LINE_CHANNEL_ACCESS_TOKEN` |
| LINE Login Channel → LIFF → **LIFF ID** | `LINE_LIFF_ID` + `NEXT_PUBLIC_LIFF_ID` |
| LINE Login Channel → Basic settings → **Channel ID**（純數字） | `LINE_LIFF_CHANNEL_ID` |
| LINE OA Manager → Settings → **LINE ID**（`@xxxxxxx`） | `NEXT_PUBLIC_LINE_OA_ID` |

---

### 6.1 申請 LINE OA + Messaging API Channel

1. 到 [LINE Business ID](https://account.line.biz/login) 用 LINE 帳號登入
2. 進 [LINE Official Account Manager](https://manager.line.biz/) → **建立帳號** → 一般帳號 / 認證帳號（一般免費，先選一般即可）
3. 填寫 OA 名稱（如「海王子潛水團」）、業種、地區
4. 建立完成後，到 OA Manager → **Settings → Messaging API** → **Enable Messaging API**
5. 系統會問你要綁哪個 Provider（公司主體）。沒有就建一個（如 `Haiwangzi Diving`）
6. 啟用完成後，**這個 OA 就對應到 LINE Developers Console 裡一個 Messaging API Channel**

### 6.2 設定 Messaging API（取得 Channel Secret + Token）

1. 進 [LINE Developers Console](https://developers.line.biz/console/) → 你的 Provider → Messaging API channel
2. **Basic settings** 分頁
   - 找到 **Channel secret** → 點顯示 → 直接複製到 Zeabur Variables `LINE_CHANNEL_SECRET`
3. **Messaging API** 分頁
   - 找到 **Channel access token (long-lived)** → 點 **Issue** → 產生一組長 token
   - 直接複製到 Zeabur Variables `LINE_CHANNEL_ACCESS_TOKEN`
4. **OA 的 LINE ID**（`@xxxxxxx`）顯示在 OA Manager → Settings → 第一頁，複製貼到 Zeabur Variables `NEXT_PUBLIC_LINE_OA_ID`
5. 加好友連結組成方式：把 `@` 換成 `%40`
   - 例：OA ID = `@894bpmew` → `NEXT_PUBLIC_LINE_ADD_FRIEND_URL = https://line.me/R/ti/p/%40894bpmew`

### 6.3 設定 Webhook（讓 LINE 把訊息送到本系統）

1. 同樣在 Messaging API channel → **Messaging API** 分頁
2. **Webhook settings**：
   - **Webhook URL**：填 `https://你的網域/api/webhook` ⚠️**注意只有一個斜線**，不要寫成 `.app//api/webhook`
   - 開啟 **Use webhook**（綠色開關）
   - 關閉 **Webhook redelivery**（會造成重複處理）
3. 點 **Verify** → 應回 **Success**（HTTP 200）
   - 若回 404：URL 寫錯（多斜線、少 `/api`、網域錯）
   - 若回 401：`LINE_CHANNEL_SECRET` 在 Zeabur 沒設或值不對
   - 若回 5xx：本系統部署有問題，先看 Zeabur Build/Runtime logs

### 6.4 關掉 LINE 內建的自動回覆（重要）

> 如果不關，使用者傳訊息時 LINE 會用罐頭訊息回他，蓋掉本系統的客製回覆。

1. 進 [LINE Official Account Manager](https://manager.line.biz/)
2. 選你的 OA → **Settings → 回應設定（Response settings）**
3. 把以下開關設成：
   - **聊天（Chat）**：開啟
   - **Webhook**：開啟
   - **自動回應訊息（Auto-response messages）**：**關閉**
   - **歡迎訊息（Greeting message）**：**關閉**（本系統有客製化歡迎流程）

### 6.5 建立 LINE Login Channel + LIFF App

> 注意：**LIFF 不能建在 Messaging API Channel 裡**，必須另外建一個 LINE Login Channel。

1. LINE Developers Console → 同一個 Provider → **Create a new channel** → 選 **LINE Login**
2. 填基本資料：
   - App types：勾 **Web app**
   - 其他填寫公司資訊
3. 建好後進這個 Login Channel → **Basic settings** → 記下 **Channel ID**（純數字）→ Zeabur `LINE_LIFF_CHANNEL_ID`
4. 切到 **LIFF** 分頁 → **Add** → 建立 LIFF App：
   - **LIFF app name**：自訂，如「海王子潛水團LINE-AP」
   - **Size**：選 **Full**
   - **Endpoint URL**：`https://你的網域/liff` ⚠️ 一定要是這個路徑，不是首頁
   - **Scope**：勾 `openid`、`profile`
   - **Bot link feature**：選 `On (Aggressive)`（讓 LIFF 內可以加 OA 為好友）
   - **Channel consent for OpenID Connect**：勾選
5. 建好後 LIFF 列表會顯示 **LIFF ID**（格式如 `2010xxxxxx-xxxxxxxx`）
6. 複製這個 LIFF ID 同時填入 Zeabur：
   - `LINE_LIFF_ID`
   - `NEXT_PUBLIC_LIFF_ID`（兩個值要一樣）

### 6.6 把 OA 連結到 Login Channel（讓使用者一進 LIFF 就能加好友）

1. LIFF 編輯頁 → **Linked OA**（已連結的 LINE OA）→ 選你的 OA
2. 儲存

### 6.7 全部設好後的驗證流程

照順序測：

```bash
# (1) 健康檢查
curl https://你的網域/api/healthz
# → {"ok":true,...}

# (2) DB 連線
curl https://你的網域/api/dbcheck
# → {"ok":true,...}
```

```
# (3) LINE Webhook
LINE Developers Console → Webhook settings → Verify
→ Success ✓

# (4) LIFF 開啟
手機 LINE → 加 OA 為好友 → 點 OA 圖文選單 → 開啟 LIFF
→ 應該能登入並進入會員頁

# (5) 主動發訊息（驗證 Access Token）
登入 admin → /admin/broadcast → 發測試訊息
→ LINE 應該收到
```

### 6.8 同步 Rich Menu（選用）
1. 登入後台 `/admin/settings`
2. 找到「Rich Menu 同步」按鈕，點擊即可

### 6.9 LINE 金鑰異動時要做什麼

| 你做了什麼 | 後果 / 要連帶做的事 |
|---|---|
| Reissue Channel Secret | Zeabur `LINE_CHANNEL_SECRET` 立刻換成新值並 Redeploy，否則 Webhook 簽章驗證會失敗（401）；Bootstrap API 也要用新值 |
| Reissue Channel Access Token | Zeabur `LINE_CHANNEL_ACCESS_TOKEN` 換新值並 Redeploy，否則主動推播會失敗（401） |
| 改 OA ID（`@xxx`） | 同步改 `NEXT_PUBLIC_LINE_OA_ID` + `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` |
| 改 LIFF App 的 Endpoint URL | 通常是換網域時才會改；改完 LINE 內開 LIFF 才會跳到新網域 |
| Reissue LIFF ID（罕見） | 同步改 `LINE_LIFF_ID` + `NEXT_PUBLIC_LIFF_ID` |
| 重建 LINE Login Channel | 連帶 LIFF ID + LIFF Channel ID 都會換，所有 LIFF 相關 env var 都要更新 |

---

## 七、初始設定完成確認清單

```
申請前準備：
[ ] LINE OA / Messaging API / LIFF 全部申請完成，金鑰已記錄
[ ] PostgreSQL DB 建好，DATABASE_URL 已記錄
[ ] Gmail App Password 已產生（如需 Email 通知）
[ ] R2 Bucket 已建好（如需照片上傳）
[ ] Logo 圖片已準備（正方形 PNG）
[ ] JWT_SECRET / CRON_SECRET / ADMIN_WEB_SECRET 已產生

部署：
[ ] public/logo.png 已替換成自己的品牌 Logo
[ ] 環境變數全部設定完畢（含 ADMIN_WEB_SECRET）
[ ] /api/healthz 回傳成功
[ ] /api/dbcheck 回傳成功

帳號初始化：
[ ] 已加入 LINE 官方帳號好友（建立 User 記錄）
[ ] 已呼叫 /api/admin/bootstrap 設定第一個 admin
[ ] 已使用 ADMIN_WEB_SECRET + 個人密碼登入 /admin
[ ] /admin/settings 完成品牌設定（Hero 文字、標語等）
[ ] /admin/sites 新增至少一個潛點
[ ] /admin/coaches 新增至少一個教練

LINE 設定：
[ ] Messaging API Channel：Channel Secret 已填入 Zeabur
[ ] Messaging API Channel：Channel Access Token 已 Issue 並填入 Zeabur
[ ] Messaging API Channel：Webhook URL = https://網域/api/webhook（單斜線）並 Verify 通過
[ ] Messaging API Channel：Use webhook 已開啟
[ ] OA Manager：自動回應訊息已關閉
[ ] OA Manager：歡迎訊息已關閉
[ ] LINE Login Channel：Channel ID 已填入 LINE_LIFF_CHANNEL_ID
[ ] LIFF App：Endpoint URL = https://網域/liff
[ ] LIFF App：Size = Full
[ ] LIFF App：Bot link feature = On (Aggressive)
[ ] LIFF App：已 Linked OA
[ ] LIFF ID 已填入 LINE_LIFF_ID 與 NEXT_PUBLIC_LIFF_ID
```

---

## 附錄：常用指令

```bash
# 產生安全亂數 (JWT_SECRET / CRON_SECRET / ADMIN_WEB_SECRET 用)
openssl rand -hex 32

# 產生人類友善的強密碼（給 ADMIN_WEB_SECRET，需手動記住）
openssl rand -base64 16

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
