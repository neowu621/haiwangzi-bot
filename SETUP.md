# SETUP — 重灌電腦後，一次把開發環境裝好

> 這份是給「重灌 Windows 後要重新開工」的完整清單。
> **給 Claude Code 的提示**：使用者重灌後若要求「幫我把環境裝起來」，請照本檔由上到下執行；每個工具先用 `winget` 安裝，裝完提醒使用者哪些「秘密金鑰」要自己補（見 §4）。本機 Windows / PowerShell 的地雷見 §7。

- **專案**：`haiwangzi-bot`（東北角海王子潛水團 LIFF App）
- **Repo**：`https://github.com/neowu621/haiwangzi-bot.git`
- **技術棧**：Next.js 16 App Router + React 19 + Prisma 6 + PostgreSQL 16 + Tailwind v4，部署在 Zeabur（連 `master` 自動建置）。
- **正式站**：`https://haiwangzi.xyz`（健康檢查 `https://haiwangzi.xyz/api/healthz`）
- **適用機器**：桌機與筆電皆 Windows，兩台步驟相同；差異只在「雙機同步」（見 §11）。

---

## 系統／硬體需求（Windows）

| 項目 | 最低 | 建議 | 備註 |
|---|---|---|---|
| 作業系統 | Windows 10 22H2 | Windows 11 | 本專案在 Win11 開發 |
| CPU | 64-bit | — | **需支援虛擬化（VT-x／AMD-V）**——Docker Desktop 依賴 |
| 記憶體 | 8 GB | 16 GB | Next 開發 + Docker Postgres + 瀏覽器同開 |
| 硬碟 | 10 GB 可用 | SSD 20 GB+ | `node_modules`(~1GB)、Docker image、`postgres-data`、Next 建置快取 |
| 虛擬化 | WSL2 + 「虛擬機器平台」 | — | Docker Desktop 安裝時會提示啟用；BIOS 需開虛擬化 |
| 網路 | — | — | 需連得到 github.com、npm registry、openrouter.ai、Zeabur |

**軟體版本**：Node **20 LTS 以上**、Git 2.4x、Docker Desktop 4.x、Claude Code 最新版、（選）VS Code。
> 若不想裝 Docker（例如筆電資源吃緊），可改連一個雲端／遠端 PostgreSQL，把 `.env` 的 `DATABASE_URL` 指過去即可——本機開發不是非 Docker 不可，只是最省事。

---

## 0. ⚠️ 重灌「之前」務必先備份這些（不然會不見）

這些**不在 Git 裡**，重灌會清掉，先複製到隨身碟／雲端：

| 要備份的東西 | 位置 | 為什麼 |
|---|---|---|
| **Claude Code 記憶 + 設定** | `C:\Users\neowu\.claude\` 整個資料夾 | 裡面有本專案的 `memory\`（角色模型、部署流程、AI 客服筆記…）、`settings.json`、權限白名單。**這是 Claude「記得這個專案」的關鍵**，不備份就全忘光。 |
| **`.env` 檔（本機密鑰）** | 專案根目錄 `.env` | 被 `.gitignore` 擋著，不會進 repo。裡面是所有 API 金鑰。或改用 §4 的方法從 Zeabur 重新抓。 |
| **Git 全域設定** | `C:\Users\neowu\.gitconfig` | 你的 git 身分（`Lao Wu` / `neowu62@gmail.com`）。 |

> 若已經重灌、忘了備份 `.claude\`：memory 就得重建，但本專案的 `AGENTS.md` / `CLAUDE.md` / `SETUP.md`（就是這份）/ `docs/PROGRESS.md` 都在 repo 裡，Claude 一 clone 就能重新掌握大部分脈絡。

---

## 1. 必裝軟體（用 winget 一次裝完）

開 **PowerShell（系統管理員）** 貼上：

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e        # Node 20+（專案用 20/24 皆可）
winget install --id GitHub.cli -e               # gh：GitHub 認證 / PR
winget install --id Docker.DockerDesktop -e     # 本機 PostgreSQL 用（見 §5）
winget install --id Microsoft.VisualStudioCode -e   # 編輯器（選用）
```

**裝完把終端機關掉重開**（讓 PATH 生效）。驗證：

```powershell
git --version
node --version    # 應 >= 20
npm --version
gh --version
docker --version
```

### 1.1 Claude Code CLI

```powershell
npm install -g @anthropic-ai/claude-code
claude --version
```

（首次啟動 `claude` 會要你登入 Anthropic 帳號。）

### 1.2 Zeabur CLI（**選用** — 部署其實靠 git push，不裝也能上線）

只有想在本機看 Zeabur 日誌 / 手動操作才需要。官方安裝（PowerShell）：

```powershell
iwr -useb https://zeabur.com/install.ps1 | iex
```

> 部署**不需要** Zeabur CLI：推到 `origin/master` → Zeabur 自動建置部署。CLI 只是輔助。

---

## 2. 取得程式碼

```powershell
# 建議放在固定路徑（沿用舊習慣）
mkdir "D:\00AI Project" -Force
cd "D:\00AI Project"
git clone https://github.com/neowu621/haiwangzi-bot.git 20260511_haiwangzi
cd 20260511_haiwangzi
```

## 3. 安裝相依套件

```powershell
npm install
```

---

## 4. 環境變數 `.env`（密鑰）

```powershell
Copy-Item .env.example .env
```

然後把值補進 `.env`。**所有密鑰的「正式來源」= Zeabur 後台 → 專案 → Variables**（生產環境正在用的值都在那，直接複製回本機最快）。

**本機開發最低限度要填**（其他留空也能跑起來）：

| 變數 | 說明 | 從哪拿 |
|---|---|---|
| `DATABASE_URL` | 本機 DB 連線（`.env.example` 已預填 localhost 那條，配合 §5 即可） | 已預設 |
| `OPENROUTER_API_KEY` | AI 客服要用；不填則客服停用回 503 | Zeabur Variables，或 openrouter.ai 重新產 |
| `JWT_SECRET` / `ADMIN_WEB_SECRET` | 後台登入 | Zeabur Variables，或 `openssl rand -hex 32` 自產 |

**要完整功能才需要**（LINE / R2 / Email / 金流 / 氣象…）：`LINE_*`、`R2_*`、`GMAIL_*`、`ZSEND_*`、`CWA_API_KEY` 等 → 全部從 **Zeabur Variables 複製**。`.env.example` 每一段都有註解說明用途與申請網址。

> 🔐 **安全**：`.env` 永遠不要 commit（已被 `.gitignore` 擋）。金鑰別貼在對話或程式碼裡。若某把金鑰曾外露，到對應平台（OpenRouter / Zeabur / Google / LINE）**撤銷重產**。

---

## 5. 本機資料庫（PostgreSQL，用 Docker）

```powershell
docker compose up -d          # 起一個 postgres:16（帳密 postgres/postgres，DB=haiwangzi，port 5432）
npm run db:generate           # 產 Prisma Client
npm run db:push               # 把 schema 套到本機 DB
npm run db:seed               # （選）灌初始資料
```

> `docker-compose.yml` 已設好本機 Postgres；資料存在專案內 `./postgres-data`。
> ⚠️ 本機 `.env` 的 `DATABASE_URL` 是 **localhost**，**不是** 生產 DB——所以本機不能 `prisma db push` 到線上（也不該）。線上 schema 變更走 `scripts/migrate-safety.js`（部署時自動加欄位）。

---

## 6. 認證設定（一次做好）

```powershell
# 6.1 Git 身分（沿用舊設定，避免又湊成 neowu@msi.com）
git config --global user.name  "Lao Wu"
git config --global user.email "neowu62@gmail.com"

# 6.2 GitHub 認證（push 用；跑一次跟著指示登入 neowu621 帳號）
gh auth login

# 6.3 （選）Zeabur 登入，只有裝了 CLI 才需要
zeabur auth login
```

> push 走 HTTPS + Git Credential Manager；`gh auth login` 完成後 push 就不會卡認證。

---

## 7. Windows / PowerShell 地雷（Claude 與你都要知道）

- **PowerShell 5.1 沒有 `??`、`?.`、三元運算子** → 用會直接 parse error，改 `if/else`。
- **中文 POST body** 要用 UTF-8 bytes 送，不然亂碼。
- **PowerShell console 顯示中文可能是亂碼**，但實際伺服器/瀏覽器是正常的（別被 console mojibake 誤導）。
- 若某些終端機 `git` / `node` 不在 PATH：用 **Git Bash**，或手動把 `C:\Program Files\Git\cmd`、`C:\Program Files\nodejs` 加進 PATH。
- 換行：`.gitattributes` 會把 LF 轉 CRLF，commit 後 SHA 可能與預期不同（內容不變，正常）。

---

## 8. 跑起來 & 日常指令

```powershell
npm run dev        # 開發伺服器 http://localhost:3000
npm run build      # 生產建置（部署前驗證）
npm run lint       # ESLint
npx tsc --noEmit   # 型別檢查（push 前必過）
```

## 9. 改版 / 部署流程（本專案鐵則）

每次有版本調整：

1. bump `src/lib/version.ts` 的 `APP_VERSION`（格式 `YYYYMMDD_NN`，NN 全域累計、**v771 起不再加 `M` 尾碼**）。
2. **同步更新 5 份日誌**：`CHANGELOG.md`、`docs/PROGRESS.md`、`STATUS.md`、`README.md`（當前版本兩處）。
3. `npx tsc --noEmit` + `npm run lint` 都要過。
4. **push 前先問**要「現在推」還是「等整合」。
5. push 到 `origin/master` → Zeabur 自動建置 → **輪詢 `https://haiwangzi.xyz/api/healthz`** 直到回傳 `version` == 剛推的版本（建置可能 3–15 分鐘），回報「哪版已上線」。

（`npm run ship -- "訊息"` 有一鍵 bump+commit+push 的輔助腳本 `scripts/ship.ps1`。）

---

## 10. 快速自我檢查清單

- [ ] `git --version` / `node --version` / `npm --version` / `gh --version` / `docker --version` 都有輸出
- [ ] `claude --version` 有輸出且已登入 Anthropic
- [ ] 已 `git clone` 且 `npm install` 成功
- [ ] `.env` 已從 `.env.example` 複製並補上 `OPENROUTER_API_KEY` 等
- [ ] `docker compose up -d` 起了 postgres、`npm run db:push` 成功
- [ ] `git config user.email` == `neowu62@gmail.com`、`gh auth status` 已登入
- [ ] `npm run dev` 能開 `http://localhost:3000`
- [ ] （已備份）舊機的 `C:\Users\neowu\.claude\` 已還原，Claude 記得這個專案

---

## 11. 雙機（桌機 ↔ 筆電）同步實務

核心原則：**程式碼靠 Git 同步；密鑰（`.env`）與 Claude 記憶（`.claude\`）各機獨立、不會自動跨機。**

**每次的鐵律**
- **開工前先 `git pull`**，收工前一定 **commit + push**。養成「離開電腦前先 push」——沒 push 換另一台就看不到。
- 一次只在一台改同一段；兩台都有未 push 的 WIP 時，先在一台 push，另一台 `git pull --rebase` 收斂。
- 兩台都用 **`npm ci`**（照 `package-lock.json` 裝，版本完全對齊）而非 `npm install`。

**版本號要小心撞號**（本專案 `NN` 全域累計、不歸零）
- **bump `src/lib/version.ts` 前先 `git pull`**，確認最新版號再 +1。否則兩台可能各自出一個相同 `NN`（曾發生過 v771 由另一線同時 commit）。push 被拒（non-fast-forward）就先 pull --rebase 再推。

**各機獨立、要手動處理的**
- **`.env`**：被 gitignore、不進 Git。兩台各自從 **Zeabur Variables** 複製，保持一致；日後改了任何金鑰，兩台都要更新。
- **`.claude\`（記憶／設定）**：不跨機。要讓筆電也有專案記憶，把桌機的 `C:\Users\<你>\.claude\projects\<本專案>\memory\` 複製到筆電同路徑（注意兩台使用者名稱路徑可能不同）；不複製也行，靠 repo 的 `SETUP.md`／`AGENTS.md`／`docs/PROGRESS.md` 重建脈絡。
- **本機 DB**：兩台的 Docker Postgres 各自獨立（volume 在各自機器），**測試資料不共用**；正式資料只在 Zeabur。不要期待本機資料同步。

**換行**：`.gitattributes` 已統一 CRLF，兩台一致，不會因換行狂 diff。
