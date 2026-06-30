# 開發進度日誌（PROGRESS）

> 給「下次接手的人 / AI」看的。最新在最上面。每則記：完成什麼、改了哪些重要檔案、做了哪些決策、卡在哪、下次先看什麼。
> 版本規則 `YYYYMMDD_NN`（`src/lib/version.ts`，每次 push 必 bump）。部署 = push 到 `master` → Zeabur 自動部署 → 驗 `curl https://haiwangzi.xyz/api/healthz`。

---

## 2026-07-01 — AI 客服改最便宜模型 + 個性活潑（v763）

- 模型：`DEFAULT_MODEL` 改 **`google/gemini-2.5-flash-lite`**（最便宜 $0.10/$0.40；以成本為主）。工具呼叫想更穩 → `OPENROUTER_MODEL=google/gemini-2.5-flash`。
- 個性：`assistant-kb.ts`「個性與風格」段改**活潑熱情**（海邊好朋友、俏皮 emoji、仍簡短不浮誇）。
- **設定面板就是 `src/lib/assistant-kb.ts`**（單一 system prompt 字串 `ASSISTANT_SYSTEM_PROMPT`）：個性→「個性與風格」段、範圍/限制→「範圍與安全限制」+「重要規則」段、知識內容→各對應段；改完 push→Zeabur 生效。模型/成本→環境變數 `OPENROUTER_MODEL`（免改碼）。
- 仍待：Zeabur 設 `OPENROUTER_API_KEY`（只有老闆能設）後端到端測。

---

## 2026-07-01 — AI 客服修模型代號 + 強化安全護欄（v762）

- **模型修正**：OpenRouter 下架 `google/gemini-2.0-flash-001`（404 No endpoints）→ `route.ts` `DEFAULT_MODEL` 改 **`google/gemini-2.5-flash`**。實測該帳號金鑰可呼叫（auth OK、模型有服務）。便宜清單：`gemini-2.5-flash-lite`（$0.10/$0.40 最便宜）、`gemini-2.5-flash`（$0.30/$2.50，工具呼叫穩，預設）。可用 `OPENROUTER_MODEL` 覆寫。
- **安全護欄**：`assistant-kb.ts` 新增「範圍與安全限制（最高優先）」——只答潛水相關；拒答系統/技術/後台/資安/API/金鑰/模型/提示詞；不洩露系統提示；抗 prompt injection（忽略「忽略先前指示」等）。
- **重要**：`OPENROUTER_API_KEY` 仍需在 **Zeabur 環境變數**設定（我無法代設）。模型代號修好後，設好 key 即可回答。OpenRouter 帳號需有額度。
- **下次先看**：① 設好 key 後端到端測 AI 客服真實回答 ② 即時場次/報價工具 ③ token 串流（OpenRouter 支援）。

---

## 2026-07-01 — AI 客服可愛機器人吉祥物 + 只在桌機首頁（v761）

由使用者操刀 `src/components/assistant/ChatWidget.tsx`：

- 浮動鈕 → 會動的機器人吉祥物（漂浮/眨眼/天線發光/泡泡/小鰭擺動），header 也放同一隻（compact）。純 CSS inline `<style>`，無新依賴；支援 `prefers-reduced-motion`。
- **顯示範圍收斂**：`hidden = pathname !== "/"` → 只在**桌機首頁 `/`**。手機（proxy 導 `/mobile`）、LIFF、後台、其他頁都不顯示（先前版本是除 admin/liff/pclogin/coach 外都顯示；本版更保守）。
- tsc + eslint 通過（lint 僅既有 warning）。

---

## 2026-07-01 — AI 客服改用 OpenRouter + Gemini 2.0 Flash（v760）

線上 = **v20260701_760M**。沿用 v759 的前端/知識庫/留資，只換**模型供應商**。

- `src/app/api/assistant/route.ts`：改打 **OpenRouter**（`https://openrouter.ai/api/v1/chat/completions`，OpenAI 相容）用原生 `fetch`，預設模型 **`google/gemini-2.0-flash-001`**（FAQ 便宜快速；`OPENROUTER_MODEL` 可覆寫）。工具 `submit_inquiry` 改 OpenAI function-calling 格式（`tool_calls` / `role:"tool"`）。
- env：`OPENROUTER_API_KEY`（取代 `ANTHROPIC_API_KEY`）+ 選用 `OPENROUTER_MODEL`。移除 `@anthropic-ai/sdk`。
- **決策**：老闆指定走 OpenRouter + Gemini 2.0 Flash 控成本（harness 預設建議 Claude，但使用者明確選定，從之）。知識庫/ChatWidget 與供應商無關，未動。
- **下次先看**：① Zeabur 設 `OPENROUTER_API_KEY` 後端到端測 ② 即時場次/報價工具（OpenAI function 格式，接 DB 場次層）③ 視需要 token 串流（OpenRouter 支援 `stream:true`，SSE）。

---

## 2026-07-01 — 網站 AI 客服小幫手（v759）

線上 = **v20260701_759M**。公開頁加一個浮動 AI 客服，回答課程/潛點/潛旅/費用/預約/安全/裝備。

- **前端** `src/components/assistant/ChatWidget.tsx`：右下角浮動「💬」按鈕 → 聊天面板（client、inline 樣式、無外部依賴）。用 `usePathname` 守衛：`/admin`、`/liff`、`/pclogin`、`/coach` 自動隱藏，只在公開行銷頁顯示。掛在 `src/app/layout.tsx`。
- **後端** `src/app/api/assistant/route.ts`：`POST` → Claude **Haiku 4.5**（`claude-haiku-4-5`）；加速率限制（`checkRateLimit` scope `assistant`，20/min）；知識庫當 system prompt（`cache_control` ephemeral）；非串流工具迴圈（最多 4 圈）。工具 `submit_inquiry` 重用 `prisma` emailThread/Message + `notifyBossNewInquiry`（server 可信、免 Turnstile）寫進客服信箱。缺 `ANTHROPIC_API_KEY` → 503。
- **知識庫** `src/lib/assistant-kb.ts`：靜態精選快照（對應 `_home/data.tsx` 的 COURSES/SPOTS/TRIPS/FAQ）+ 行為規範。**固定字串**以利 prompt cache；不放即時資料。
- 依賴：`@anthropic-ai/sdk`。env：`ANTHROPIC_API_KEY`（`.env.example` 已加）。

**決策 / 注意**：
- 本版**非串流**（Haiku 快，JSON 回覆即可）；要 token 串流可後續加（claude-api skill 的 Streaming Manual Loop）。
- **即時場次空位 / 個人化報價工具尚未做**（v760 候選）：需接 DB 場次資料層（`divingTrip` / `cache.ts` getter），且要真實 `ANTHROPIC_API_KEY` 才能端到端驗。先把 FAQ + 留資基礎上線驗證再疊。
- 寫 Anthropic API 程式前讀 `claude-api` skill（model id / 工具 / 快取）。Haiku 4.5 不支援 `effort`，本版未用 thinking。
- 知識庫是手寫快照，課程/價格有變要同步 `assistant-kb.ts`（與 `_home/data.tsx`）。

**下次先看**：① 真實 key 設好後端到端測 AI 客服 ② 加即時場次/報價工具 ③ 視需要加 token 串流。

---

## 2026-07-01 — 訂單流程全鏈優化 + 角色/代理人權限（v752 → v758）

線上 = **v20260701_758M**。本輪聚焦訂單詳情、到場點名、退款追蹤與角色模型，並產出訂單流程說明頁 `docs/order-flow.html`。（v727–v751 細節見 `CHANGELOG.md`：訂單編輯視窗重設計、到場排序、品牌圖示/Hero WebP 壓縮、課程詢問分頁等。）

- **v752–753 訂單詳情**：移除「✎ 修改總金額」直接改總額入口（金額調整改走「🧮 帳務調整」加收/減免，有審計）；付款紀錄「抵用金折抵/先前已付」兩列補上訂單成立日；新增一鍵「💵 現場收現·結清剩餘」（寫 `現金(實收)=剩餘` 並標付清，重用 `payment-entry`）。動檔 `src/app/admin/bookings/page.tsx`。
- **v754 訂單歷程**：右欄「付款紀錄」+ 左欄「訂單狀態歷史」合併成單一「📋 訂單歷程」時間軸，依 `createdAt` 舊→新交錯（付款事件 + 狀態事件同列）。純前端排序，不改後端。
- **v755 到場點名**：桌機 `/admin/attendance`、手機 `/admin/m/attendance`、教練端 `/liff/coach/today` 三處「到場/未到」一律先 confirm；未付清+到場→現場收現結清；已付+未到→提醒退款。attendance API 回傳補 `totalAmount/paidAmount`。
- **v756 權限修正（修 v755 回歸）**：`payment-entry`（收款/折抵記帳）限老闆（boss/admin/it），移除 coach → 教練/助教不可記帳，到場點名依 `effectiveRoles` 分流（老闆現場收現；教練/助教只標到場+提醒）。未到退款提醒三介面統一「通知老闆」。新增 `docs/order-flow.html`。
- **v757 待退款清單**：訂單管理新增「⏳ 待退款」篩選 chip — 列出「取消/未到、且現金（`paidAmount−creditUsed`）未退」的單，避免漏退。前端衍生、不改 schema、不自動扣款。
- **v758 角色 / 代理人**：釐清 `boss`（老闆/最高權）與 `admin`（**代理人**，營運全權但不含系統設定/永久刪除）為**刻意分階**（`requireRole` 裡 boss⊋admin、it 全通過）。**收緊代理人權限**：`site-config` 寫入 + 訂單永久刪除 → 由 `["admin"]` 改 `["boss"]`（修「文件說不可、API 卻可」的洞）。**顯示正名**「管理員/管理者」→「代理人」（`lib/labels.ts` 等，enum 值不動）。供老闆未來指派多位代理人。

**決策 / 注意**：
- 角色模型細節：`src/lib/auth.ts` `requireRole`（boss 通過 admin 端點、it 永遠通過）。`bootstrap` 建立初始帳號為 `admin` → **老闆本人帳號應在會員管理改成 `boss`**，否則看不到系統設定、不能永久刪除；代理人才用 `admin`。
- enum `admin`→`deputy/manager` 全面改名（217 處 + DB 遷移）**目前不做**，只改顯示。
- 退款目前無自動扣款：突然取消活動（`weather-cancel`）只自動退「折抵抵用金」，現金需老闆手動退；未到也是提醒。待退款清單即為防漏退的補強。

**環境 / 部署**：本機 `git` 不在 PowerShell PATH（用 Git Bash 或先補 PATH）；Node 24 在 `C:\Program Files\nodejs`（非預設 PATH）。部署 = push `master` → Zeabur 自動建置（**約 7–9 分鐘**，會變動）→ 驗 `curl https://haiwangzi.xyz/api/healthz` 的 `version`。在 worktree `crazy-poincare-a00022`（對齊 origin/master）開發。

**下次先看 / 可做**：待退款可加「自動建退款請求」或「老闆總覽待退款徽章」；是否要 enum 改名 `admin→deputy`。

---

## 2026-06-29 — GitHub triage + LIFF 安全/效能改進分支（v20260628_726-C2）

目前工作分支 = **v20260628_726-C2**（prod 基底 **v20260628_726**）。

> 依新指示，Codex 改進分支從 `20260628_726-C1` 起跳，後續同基底改版用 `-C2` / `-C3`。本分支目標：LINE LIFF 安全檢視、10 大載入/安全優化、前後差異與驗證。

- **GitHub 狀態**：repo `neowu621/haiwangzi-bot`，default branch `master`；open issues = 0。
- **PR #1 狀態**：唯一 open PR 是 draft [#1](https://github.com/neowu621/haiwangzi-bot/pull/1)，branch `claude/progress-update-tloc9`。只改 `CHANGELOG.md` / `STATUS.md` / `TODO.md`，原目的為補文件到 `20260529_119`。
- **PR #1 判斷**：`master` 已前進到 `20260628_726`，PR #1 已落後近一個月且 merge state = conflict / dirty。其 `CHANGELOG.md`、`STATUS.md` 內容已過期；不建議 merge。若需要 TODO 內容，應從最新 `master` 重新整理後另開文件/commit。
- **Checks / Actions**：PR #1 沒有綁 status checks；近期 scheduled Actions（`Daily Orders Email`、`Weekly Report Email`、`Daily Cron`、`Daily DB Backup`）皆為 success，沒有 failing checks 需要 debug。
- **近期已上線重點（v711→v726）**：
  - v711→v717：付款憑證通知補場次/總額/應付、老闆結帳與付款核對加金額明細。
  - v713→v718：移除證照號碼，新增岸潛/船潛分類，船潛套裝價與潛水次數邏輯調整。
  - v719→v721：到場點名納入待確認匯款、氣瓶數/潛數修正、付款證明去重與 DB 防重複索引。
  - v722→v724：匯款截圖延後載入、移除 m2、首頁圖片 lazy 載入、修 completed 訂單尾款核可。
  - v725→v726：會員累計消費改為即時加總實付金額，README 當前版本同步到 `20260628_726`。
- **本次文件更新**：同步 `APP_VERSION`、`README.md`、`STATUS.md` header 與「2026-06-29 目前進度」區塊。
- **C2 已完成驗證**：lazy-loaded `/liff/booking` 分頁內容與簽名板、集中 LIFF SDK loader、套件安全升級、HSTS、Prisma seed typing 修正、ESLint 9 flat config；`npm run lint`、`npm audit --json`、`npm run build` pass。改善前後表詳見 `docs/LIFF_SECURITY_PERFORMANCE_AUDIT_20260629.md`。

---

## 2026-06-28 — 訂單金額明細(組成) + 岸潛/船潛分類 + 移除證照號碼（v711→v716）

目前線上 = **v20260628_716**。

- **v711 — 站內訊息(老闆)補完整場次+金額**:付款憑證通知(`api/bookings/[id]/payment-proofs`)的 notifyAdmins/LINE push 改顯示 場次 label + 訂單總額 + 應付(remaining = total − paid，**已扣抵用金**) + 客戶填報金額。修正原本只回顯客戶輸入的 `data.amount`(導致 1100 vs 應付 1250)。
- **v712 — 訂單金額明細(組成)**:`Booking.priceBreakdown Json?`(下單時凍結);`daily`/`tour` route 寫入組成;共用 `<PriceBreakdown>`(`src/components/admin/`)在 老闆結帳(`/admin/tonight`)兩區(已下單待匯款／待確認匯款)以「金額明細 ▾」展開顯示「氣瓶/減免/裝備 → 訂單總額 − 抵用金 = 應付」。
- **v713 — 移除證照號碼(certNumber)**:`個人資訊`(liff/profile·m2·pclogin)與下單確認只保留**證照等級**選擇,移除號碼輸入與驗證。
- **v714 — 日潛 岸潛/船潛 分類**:`DivingTrip.isBoat`(migrate-safety 加欄)。船潛=「每人套裝價·含 X 潛」**不乘支數**(`divesAmount = pricing.extraTank × 人`),岸潛沿用(`× 支 × 人`);減免/裝備/抵用金不變。後台場次表單加 岸潛/船潛 切換 + 「氣瓶費」欄船潛改標「套裝價(每人·含N潛)」;場次管理列 + 顧客場次卡(CalendarContent/trip 詳情/m2)顯示 🚤船潛/🏖岸潛。船潛仍照常累積潛次(attendance route 不變)。
- **v715/v716 — 明細更完整 + 舊訂單估算**:新訂單明細把每支減免折進氣瓶行(`(650−25)×3支×2人`),優惠代碼(%)另列;**舊訂單**(無凍結明細)改用場次現價(`extraTank/baseTrip/isBoat`,由 `api/admin/payment-proofs` + `api/admin/bookings` 回傳)重建「氣瓶毛額 + 基本費 + 裝備 − 折抵合計 = 訂單總額 − 抵用金 = 應付」,不再只顯示合併的「氣瓶/場次費」。
- **下單必填驗證**:沿用既有 —— daily/tour route 與前端皆需有效 refId、participants≥1、聯絡資訊(姓名/電話)、證照等級;裝備為選填。

---

## 2026-06-27 — LIFF 底部導覽重構(首頁/訊息通知/潛水預約整合)（v696→v697）

目前線上 = **v20260627_697**。

- **v696**:LIFF 頂部品牌列(`LiffShell` Wordmark)點擊由 `/liff/welcome` → `/`(官網手機首頁)。
- **v697 — 底部 5 分頁重構**(老闆要對齊 m2 的分頁概念):
  - `BottomNav` NAV 重寫 → 首頁(`/liff/home`)/ 訊息通知(`/liff/messages`,未讀紅點移此)/ 潛水預約(`/liff/booking`)/ 我的預約(`/liff/my`)/ 個人中心(`/liff/profile`)。
  - **潛水預約整合頁** `/liff/booking`:把原本三個分頁(一日潛水/旅行潛水/預約潛水)合一,頂部三選項**即時切換**。做法:抽出 `CalendarContent`/`TourContent`/`WishesContent`(`src/components/liff/`,把原頁 body 移出、去掉 LiffShell 外框),booking 頁用單一 LiffShell + 三按鈕切換;**lazy 掛載(首次點到才載)+ 切換只切 display(保留狀態、不重抓)**。願望單送出成功改 inline `done` 畫面(原本 `router.push` 跳出)。
  - **首頁** `/liff/home` 移植 m2 `HomeIntro`;**訊息通知** `/liff/messages` 複製 m2 `MsgTab` 但改 `liff.fetchWithAuth`(LINE Bearer)。共用色盤 `src/components/liff/mobileShared.tsx`(C/Sect/SPOT_IMG,**不動 m2**)。
  - 舊路由 `/liff/calendar`·`/liff/tour`·`/liff/wishes/new` 改成 server `redirect()` 到 `/liff/booking?tab=...`。場次/願望**詳情頁**與下單流程不變。
- **決策/注意**:m2 與 LIFF 各自獨立(刻意不共用元件,只共用 `_home/data` 與後端 API);`/api/me/notifications`·`/api/me/contact` 後端 `authFromRequest` 同吃 cookie 與 LINE Bearer,所以 LIFF 端直接用 `fetchWithAuth` 即可。`/liff/welcome` 暫留(LINE 進入/好友閘),日後可轉址到 `/liff/home` 收斂。
- **延續(載入慢)**:v694 已證實瓶頸是前端 JS bundle(226KB gzip)在 webview 的 hydration,非 DB/API;本重構讓潛水三頁切換**不再整頁重載**,間接改善體感。見 [[data-read-tiering]]。

---

## 2026-06-26（續4）— m2 後台管理接真實資料 + 截圖延後載入（v695）

目前線上 = **v20260626_695**。

- **m2 後台管理(`Admin`)從假資料 → 真實**:接 `/api/admin/stats`(neowu62=admin,同顆 `hwz_member` cookie + `requireRole(["admin","coach"])` 可存取)。今日營運(今日新訂單/待確認匯款/待結算/未付款)**移到最上面**;新增「待確認客戶訂單」清單(真實 `pendingProofsDetails`,**預設縮起、點擊展開**);磚:到場點名→切教練、老闆結帳→展開訂單,其餘標「桌機後台處理」。
- **轉帳截圖延後載入**(會員 `OrderCard`):不預載縮圖,改 icon(類型+金額+待核/已核),點擊才開全螢幕 modal 載入大圖。符合 [[data-read-tiering]] 之外的「圖片延後載入」手機鐵則。
- **載入慢的真因(v694 量測結論,延續)**:DB 1ms、API 280ms 都不是瓶頸;瓶頸是 LIFF JS bundle(739KB 原始 / 226KB gzip / 14 chunks)在 webview 的下載+hydration。**下次優化方向**:動態載入重元件(SignaturePad/Dialog/`@line/liff`)、m2 拆分巨型 client 元件、圖片延後(本版截圖已做)。
- **待辦**:m2 後台「寫入動作」(確認到帳/取消/退款核可)尚未移植,仍在桌機後台 → 要做需接 admin 寫入 API + 確認 hwz_member cookie 對寫入端點的權限。

---

## 2026-06-26（續3）— 效能探針 / 載入慢診斷（v694）

目前線上 = **v20260626_694**。

> 老闆反映「日潛/旅遊潛水仍很慢、轉很久」,問「不是已經靜態快取了?」。先量測再修。

- **實測結論(重要)**：
  - curl `/api/trips`·`/api/tours` ⇒ server+DB ~50ms、含 DNS+TCP+TLS 的 TTFB ~280ms,**三次一致**(快取生效)。
  - `/api/healthz?db=1` ⇒ `dbPingMs` = **1ms(暖)/ 33ms(冷首連)**。
  - → **DB 與 API 都不是瓶頸**。LIFF calendar/tour 早就用原生 `fetch` 在 mount 立即發(不等 LINE token)。所以「轉很久」在**裝置端**:LINE webview 的 JS bundle 載入/hydration,或手機網路首連。
- **加了量測點(`?debug=1` 才顯示)**：`/liff/calendar`、`/liff/tour`、m2 `ApiList` 顯示「查詢往返 X / 進頁→開查 Y」;`/api/healthz?db=1` 回 `dbPingMs`。檔案:`src/app/liff/calendar/page.tsx`、`src/app/liff/tour/page.tsx`、`src/app/m2/page.tsx`、`src/app/api/healthz/route.ts`。
- **判讀**:Y 大 → JS/hydration 慢(拆 bundle/首屏輕量/骨架);X 大但 curl 才 280ms → 裝置網路慢(預連線/骨架/樂觀 UI);X、Y 都小仍慢 → 慢在進這頁之前(LiffShell + LINE SDK init)。
- **下次先看**:等老闆用手機在 LINE 開 `?debug=1` 回報 X/Y 數字 → 才決定優化方向。不要再往 DB/快取找(已證實非瓶頸)。見 [[data-read-tiering]]。

---

## 2026-06-26（續2）— 公開資料「版本號失效」快取（v693）

目前線上 = **v20260626_693**。

> 老闆反映「手機載入久 = 一直讀 DB」。把「大家都一樣、有人改才變」的共享資料(場次/潛旅/營業設定/政策/裝備價)加上**進程內快取 + 版本號失效**;個人資料維持即時。

- **引擎 `src/lib/cache.ts`**：`cached(key, domain, backstopMs, load)` + `bumpVersion(domain)`。每個 domain(`config`/`trips`/`tours`)一個整數版本;讀取記下版本,版本沒變且未過 backstop → 回快取(零 DB)。
- **集中蓋章 `src/lib/prisma.ts`**：`$extends` 攔截 `divingTrip`/`tourPackage`/`booking`/`siteConfig` 的寫入 → 自動 `bumpVersion`。**所有寫入都過 Prisma,所以不可能漏勾**(後台 CRUD/seed/bulk/下單/取消全涵蓋)。預約改空位 → 同時 bump trips+tours。
- **讀取端**：`/api/config`+`/api/site-config` 共用 `getSiteConfigRow()`(`src/lib/site-config-cache.ts`,6h backstop);`/api/trips`·`[id]`·`/api/tours`·`[id]` 包 `cached`(10min backstop)。m2 前端公開 fetch 移除 `no-store`。
- **決策/注意**：
  - 不新增資料表、不動 schema(部署用 `db push`,零變更最安全);版本號放記憶體 → **前提是 Zeabur 單一容器**。多實例會各自有計數器 → 需改放共用儲存(DB 一列 / Redis),`cache.ts` 介面不變。
  - backstop TTL 是安全網(萬一未來改用 interactive `$transaction` 導致蓋章沒觸發,也會自癒)。
  - 個人資料一律不快取:`/api/me`、`/api/bookings/my`、`/api/me/notifications`、`/api/me/contact`、`/api/me/credits` 維持 `no-store`。
  - ⚠️ **首屏仍受個人資料即時讀取影響**——共享快取救的是「純看共享頁 / 尖峰多人」,不是「第一次進場等個人資料」。若要再快,下一步可做「先顯示靜態殼、個人資料背景載入」。

---

## 2026-06-26（續）— 第二版手機 UI /m2（獨立路由·完整下單·訂單/個人複製 LIFF）（v684→v692）

目前線上 = **v20260626_692**。

> 老闆要做一個「第二版 LINE LIFF 手機 UI」當作未來主介面的雛形。**整條 v685→v692 都在 `src/app/m2/page.tsx` 一個檔**（純 inline-style 新「皮」），完全獨立、不碰 `/admin`·`/liff`·`/pclogin`·官網 `/`；後端**全沿用既有 API、不新增**（除了一支 UAT 登入 `/api/m2/session`）。

### m2 是什麼 / 為何獨立（v685）
- 新增路由 `/m2`：密碼閘 → 會員身分 → 底部 5 分頁（首頁/訊息/潛水/訂單/個人）；isAdmin 才在「個人→管理」顯示教練點名/IT 後台內嵌畫面。`/admin` 系統/IT 加「🆕 New UI (m2)」入口。
- 用 inline-style + 自有色盤 `C`（navy/accent/teal/coral…），不引入 shadcn，刻意與既有介面解耦，方便獨立演進。

### 首頁=官網內容 / 潛水接真實場次 / 底部釘底（v686/687/688）
- 首頁沿用官網 `src/app/_home/data`（COURSES/SPOTS/BUILTIN_REVIEWS/FAQ/社群+LINE）呈現手機版官網介紹（資料同源，官網改 m2 同步）。
- 潛水分頁接 `/api/trips`（一日）、`/api/tours`（旅遊）真實場次。
- 版面改 `height:100dvh` 固定外框、中間內捲、頂/底列 `flex-none` + safe-area，底部分頁列釘底不隨內容捲走。

### 接真實帳號 + ⚠️ UAT backdoor（v689）
- 密碼改 `msi`；`/api/m2/session` POST 驗密碼 → 以 `M2_DEFAULT_EMAIL`(neowu62) 查帳號用 `createMemberWebJwt` 發**會員** session，set `hwz_member` cookie（**與 `/pclogin` 同一顆**，path=/，30 天；DELETE=登出）。
- 訊息/訂單/個人改接 `/api/me`·`/api/me/notifications`·`/api/me/contact`·`/api/bookings/my`。教練/IT 入口移到個人→管理。

### 完整下單系統，移植自 LIFF（v690→v691）
- 一日潛水 `DailyBook`（對齊 `/liff/dive/trip`）：`/api/trips/[id]` 計價 + `/api/me` 預填。欄位齊全：人數·潛次 stepper、裝備租借（數量+VIP折）、個人資料（證照等級/號碼/潛次）、緊急聯絡人、潛伴、優惠代碼（`/api/promo/validate`）、抵用金、政策同意+手寫簽名（沿用 `SignaturePad`/`PolicyText`）、費用明細 → `POST /api/bookings/daily`（完整 payload：tankCount/rentalGear/participantDetails/signatureDataUrl/creditUsed/promoCode…）。
- 旅遊潛水 `TourBook`（對齊 `/liff/tour`）：`/api/tours/[id]` + 加購/含不含/報名資料/抵用金/政策簽名/訂金 → `POST /api/bookings/tour`。
- 課程 `CourseList`（沿用官網 COURSES + LINE 報名）；客製送需求 → 客服。**金額一律後端權威重算，client 計價僅顯示。** 詳情端點是 `/api/trips/[id]`、`/api/tours/[id]`（public，LIFF 用 `${tripId}` 對應 `[id]`）。

### 訂單=複製「我的預約」+ 個人各項可點進子頁（v692）
- 訂單 `OrdersTab` 對齊 `/liff/my`：通知中心入口、4 分段（即將前往/📝願望單/已結束/已取消）、願望單（`/api/dive-wishes`）。訂單卡：`deriveBookingDisplay` 衍生狀態、人數/氣瓶、裝備 chips、旅潛付款進度條+4步+訂金/尾款、付款方式選擇（`/pay/[id]?t=token`）、付款截止日（`computePaymentDeadline`）、取消（`DELETE /api/bookings/[id]`）、同意聲明 modal、申請退款（送 `/api/me/contact`）、轉帳截圖縮圖。
- 個人 `MeTab` 各列可點進子頁：個人資訊 / 證照·潛伴（含潛伴 CRUD）/ 通知偏好 → `PATCH /api/me`；預約紀錄→訂單分頁；潛水紀錄；抵用金明細 → `/api/me/credits`（餘額/收支/逐筆）。

### 決策 / 注意
- 一切建在「沿用既有後端」之上：能複用就不新增 API；`booking-status`/`payment-deadline` 是純函式，`SignaturePad`/`PolicyText` 無 LIFF 相依，直接 import。
- 只動 `src/app/m2/page.tsx`（其餘檔案皆只讀）。所有版本 `tsc 0`、`build 通過`、`healthz` 已驗（v692 LIVE）。
- v684（非 m2）：老闆結帳卡片加「已下單·待匯款」計數，移除已搬走的待到場；到場點名改顯示待到場徽章。

### ⚠️ 下次先看 / 上線前必做
- **移除 UAT backdoor**：`/api/m2/session` 弱密碼 `msi` → 以 neowu62 發會員 session，且**與 `/pclogin` 共用 `hwz_member` cookie**。正式上線前**務必換成正規 LINE 登入並移除此端點**。
- 潛水課程目前只是 LINE 連結（未做線上報名）；coach/admin 內嵌畫面仍為示意（靜態），待接 `/api/admin/attendance/today` 等真實資料。
- 細節見記憶 [[m2-second-ui]]；手機不導桌機鐵則見 [[mobile-no-desktop-bounce]]、角色見 [[admin-roles-attendance]]。

---

## 2026-06-26 — 到場點名 + 角色化後台 + 手機/桌機區隔 + /pclogin 強化（v671→v683）

目前線上 = **v20260626_683**。

### 到場點名 + 後台角色（v677/678/679/683，重點）
- **教練/助教可登入後台**：`/api/admin-web/auth` + `set-password` 的 `BACKEND_LOGIN_ROLES = [admin,boss,it,coach,assistant]`。`AdminShell` NAV_GROUPS 每組加 `roles` 白名單 → **教練/助教只看「到場點名」**，其餘群組限 admin/boss/it。我的最愛(favItems)也要依 `visibleHrefs` 過濾。教練/助教登入後 `/admin` 與 `/admin/m` 都 redirect 到到場點名。
- **到場點名頁**：桌機 `/admin/attendance`、手機 `/admin/m/attendance`（兩套，手機不跑桌機）。API `GET /api/admin/attendance/today`（requireRole coach/assistant/boss/admin，回今日場次/潛旅 confirmed/completed/no_show 名單）；點名走既有 `POST /api/coach/bookings/[id]/attendance`。到場點名也放進「營運/分析」給 admin/boss/it。
- **v683 修助教 403**：`/api/coach/*`（today/media/trip-photos/weather-cancel）原本只 `coach|...`，補上 `assistant`。**款項類 `/api/coach/payment-proofs` 維持只給老闆/admin**（教練助教不碰款項）。見 [[admin-roles-attendance]]。

### 手機後台不導桌機（v676/679/680，鐵則）
- 移除 `MobileAdminShell` 頂部「完整版」+ 各頁所有導向桌機 `/admin/*`(非 `/admin/m`)的連結。卡片 drill-in（訂單/會員/訪客）改純顯示 `div`。驗證 `grep href="/admin/` 非 m 為空。見 [[mobile-no-desktop-bounce]]。

### /admin/m 速度（v675/676）
- 會員查詢/抵用金「搜尋才查」（後端 `/api/admin/users?q=` 限 60；移除 VIP 篩選）。潛旅名單/老闆結帳 `/api/admin/bookings?light=1`（跳過簽名 presigned URL/狀態log/退款）。潛旅名單英文狀態→`deriveBookingDisplay` 中文 + 已付/未付。pg_trgm 索引（v677）。

### 老闆結帳精簡（v675/681/682）
- 加「🧾 已下單·待匯款」。移除「待到場確認」（改用到場點名）。訂單管理 `/admin/bookings` 預設 `filterTripPeriod=future`（只看活動未開始）。

### /pclogin（v671/672/674）
- 加「📨 線上洽詢/揪團」分頁（搬自 /contact，登入會員免填身分/免 Turnstile，`/api/contact` 加會員快速通道）。我的訂單 旅潛拆「已付訂金/尾款(截止日)」（LIFF v673 同步）。通知頁改兩欄（左通知/右客服對話）。見 [[pclogin-notes-pay]]。

### 注意
- 版本日期 2026-06-26 起 NN 接續累計（v676 起 date=20260626）。所有版本 tsc 0、build 通過、healthz 已驗。

---

## 2026-06-25 — 訂金通知模板 + 活動提醒落地 + 老闆結帳/通知體驗（v665→v670）

目前線上 = **v20260625_670**。（v622–v664 為先前 session，細節見 `git log`；本段只記本 session。）

### 訊息模板（v665）
- 新增可編輯模板 **`deposit_pending`「老闆訂金[確認中]」**（內部、發老闆）。客戶上傳**訂金**證明時，老闆收到 ① 站內通知 ② LINE Flex（客戶/團名/金額/後5碼/方式 + 「前往核對」深連結 `/verify-proof/<id>`）。可在訊息模板頁編輯標題/按鈕/試送。
  - 新增 `src/lib/flex/deposit-pending.ts`；註冊 6 處：`flex/index.ts`(import/FLEX_TEMPLATES/LABELS/META)、`message-content.ts`(MSG_EDITABLE_FIELDS/HERO_EMOJI/MSG_SAMPLE_PARAMS/buildDynamicBody)、`admin/templates/page.tsx`(TRIGGER_TIMING/SCOPE_TAGS)。
  - wiring：`api/bookings/[id]/payment-proofs/route.ts` 的 deposit 分支改用此模板（站內標題讀 override；LINE 改推 Flex）。尾款/退款維持原文字推播。
- `deposit_confirm` 顯示名 →「老闆訂金[已確認]」（只改 label，客戶看到的是內容不是模板名）。

### 活動提醒（activityNote）落地到客戶端（v666）
- 來源：`DivingTrip.activityNote` / `TourPackage.activityNote`（v664 已加，場次/團層級、客戶可見）。
- LIFF：我的預約卡（`liff/my/page.tsx`）+ 日潛下單頁（`liff/dive/trip/[tripId]`）+ 潛旅下單頁（`liff/tour/[packageId]`）顯示綠色 `📣 活動提醒`。detail API（`api/trips/[id]`、`api/tours/[id]`）本就 `...spread` 全欄，不用改後端。
- 預約確認訊息（v667）：`booking_confirm` 動態主體加 `📣 活動提醒` + `📝 您的備註`。

### 桌機 /pclogin 體驗（v666/668/669）
- nav 數量徽章：我的訂單=進行中、通知=未讀（`/api/me` 新增 `stats.unreadNotifications`，30 天視窗 count）。
- 通知篩選加「近一周」並設**預設**。
- 潛旅目的地 enum 補中文 `destZh`（原本桌機印 lanyu/green_island…英文）。
- **登入未讀彈窗**（v668）：`UnreadPopupPc`，每 session 一次、3 秒自動關，對齊 LIFF。
- **客服對話分頁**（v669）：`/api/me/contact` GET 加 `before` 游標、預設 30 則；前端固定高度捲動框 + 自動到最新 + 載入更早。

### 老闆結帳 /admin/tonight（v667）
- 新增 **🧾 已下單·待匯款** 區（status=pending 未上傳證明）。
- 待確認匯款卡片重排：出團日期時間移頂、付款方式備註+上傳時間/電話移右側。

### 訊息模板頁版面（v670）
- 左欄 256→300px + 名稱自動換行（不再 `…` 截斷）。

### 決策 / 注意
- **「L8ne pay 轉帳」非系統錯字**：是客戶在付款備註 `note` 手打的自由文字（Line→L8ne），程式不可改；要改只能改該筆 DB（訂單 `020260623-4N`，老闆尚未決定）。
- 雙向客服對話只在桌機 /pclogin；手機客戶走 LINE。
- 所有版本 tsc 0 error、`/api/healthz` 已驗到對應版本。

---

## 2026-06-21（續）— 付款核對獨立頁 + 老闆結帳補資訊 + 修付款重複 BUG（v618→v621）

目前線上 = **v20260619_621**。

### 付款核對流程（v619/620）
- **問題**：付款證明通知「前往查看」連到整頁列表（/admin/bookings），LIFF 內還要再登入後台、沒聚焦那一筆。
- **v619 獨立核對頁**：通知深連結 `/verify-proof/<proofId>` → 中轉頁依環境導 **手機 LIFF `/liff/coach/verify`**（LINE 登入）或 **瀏覽器 `/admin/verify`**（後台登入）。共用元件 `components/PaymentVerifyView`（圖+確認入帳/退回，退回需填原因並通知客戶）。GET 單筆 `/api/admin/payment-proofs/[id]` 統一驗證（admin/boss）。**點通知不自動確認**。
- **v620 補資訊**：核對頁 + 老闆結帳（`/admin/tonight`、`/admin/m/tonight`）補 出團日期/潛點/**該場次目前已參加人數(X/容量)**、客戶備註 notes、管理備註 adminNotes。列表 API 批次抓場次 + groupBy 算已參加，避免 N+1。

### 修付款上傳重複證明 BUG（v621，重點）
- **根因**：LINE WebView 慢，React 按鈕 disable 來不及生效，客戶連點「送出」→ 多次 submit() 同時觸發 → 產生多筆相同付款證明（同一筆款被記多次，非重複付款）。
- **修正（雙保險）**：①前端 submit() 加**同步防重入鎖**（`submittingRef` useRef，第一個 await 前上鎖）+ uploaded 也擋；②後端 payment-proofs POST **去重**（5 分鐘內相同 訂單+類型+金額+後5碼 未審核 → 回既有那筆、不新建/通知）。
- 順手：訂單資訊補「N 支氣瓶・M 人・📍地點」；上傳按鈕加大加色。
- 既有重複髒資料用後台靜默刪除（coach reject = delete，不通知客戶）清掉多餘筆。

### 其他
- v618 修抵用金管理時間欄尾端多冒號（改明確格式參數，不再 slice）。

### 下次先看
- 付款核對頁只對「v619 後上傳」的新通知生效（舊通知 linkUrl 寫死）。
- 多筆付款證明**勿都核可**（會重複加 paidAmount）；正確只核可 1 筆、其餘刪除。

---

## 2026-06-21 — 抵用金通知 + 下單/簽名穩定性 + cron 全救回 + 安全/死碼 + 天氣取消（v604→v617）

目前線上 = **v20260619_617**。本日一連串改動，全部已部署 + 線上實測正常。

### 天氣取消手動觸發（v617）
- 決策：天氣取消**改為手動**，由老闆/教練決定（不自動）。
- 發現缺口：「天氣取消通知」模板原本**無任何 UI 觸發點** —— `weather-check` cron 沒掛 Cronicle、`coach/trips/weather-cancel` route 無按鈕、場次管理「取消場次」只改狀態不通知不退款。
- 修：場次管理「取消場次」modal 加勾選「🌊 天氣取消：通知客戶並退款」。勾選 → 走 `coach/trips/weather-cancel`（取消該場次所有訂單 + 發天氣取消通知 LINE/Email/站內 + 退抵用金 v603）；不勾 → 維持原狀（僅改狀態）。有報名時預設勾。
- 待辦/可選：教練端（LIFF coach 頁）也可加同樣按鈕；`weather-check` 自動取消 cron 仍未掛排程（目前走手動，不需要）。

### 抵用金（v604/605/606/607/608/610）
- v604 餘額 0 顯示灰字（LIFF + /pclogin）。
- v605 抵用金管理刪除防呆：只准刪「未使用發放筆」，餘額 clamp ≥ 0（要扣餘額請用「新增抵用金」填負數）。
- v606 一次性補退工具 `/api/admin/backfill-cancel-credit-refunds`（已補退 O20260620-1P）。
- v607 退抵用金時在訂單歷程補一行（`ensureRefundStatusLog`，from==to 顯示單一狀態）。
- v608 訂單列表顯示「↩ 抵用金已退 NT$X」標記（admin bookings API 回 `creditRefunded`）。
- v610 **抵用金異動統一通知**：`grantCredit` 掛 `notifyCreditChange`（src/lib/notify-credit.ts），通道由後台抵用金管理頁開關（SiteConfig credit_notify_line/email/inapp，預設 Email+站內）。已有專屬通知（首單/生日/VIP/退款）+ backfill 用 `skipNotify` 避免重複。

### 下單 / 簽名穩定性（v611/612/614）
- **問題**：下單常「連線逾時」。根因＝簽名上傳 R2 卡在 await 關鍵路徑（R2 SDK 預設重試 3 次、無逾時）。
- v611 簽名上傳改背景 + R2 client 加 maxAttempts=2 / 連線5s / 傳輸8s。
- v612 **簽名 DB-buffer**：下單先存 `booking.signaturePending`（秒回）→ 背景 `flushPendingSignature` + cron `/api/cron/flush-signatures`（Cronicle 每10分）補傳 R2，成功清空。簽名 100% 不掉。admin 列表不外送 base64（改 `hasPendingSignature`）。
- v614 簽名匯出由全解析 PNG → 縮 640px + JPEG 0.7（SignaturePad.tsx），payload 80~250KB → 8~20KB。

### Cron 全站救回（重大）
- 發現 Cronicle `HAIWANGZI_BASE_URL` 指向**已死的 haiwangzi.zeabur.app** → 所有排程 404 失敗（行前提醒/自動結案/天氣/生日禮金等先前都沒在跑）。
- 修：(A) 把每個 event 腳本網址硬寫 `https://haiwangzi.xyz`；(B) zeabur 更新該服務全域變數為 xyz。實測 reminders/auto-complete/weather/credit-expiry/flush-sig 全 code=0。
- v613 proxy.ts 移除舊網域轉址（保留 www→apex）。

### 安全強化 + 死碼（v614/615/616）— 經 3 個並行 agent 審計
- v614 安全：cron/email-inbound-poll fail-closed；**admin/users 不再外送 webPasswordHash**（改 hasWebPassword）；contact 加限流 + Turnstile 正式環境 fail-closed；promo/validate 限流；bootstrap 守衛補 roles[]。
- v615 清死碼：templates.ts −415 行（10 個 legacy 函式）+ vip-tier/booking-status/未用 import。
- v616 22 個 cron + email webhook 密鑰比對改 timing-safe（safeEqual）。
- 審計確認本就安全：無 IDOR、admin/coach 路由全 requireRole、admin JWT 每次重查 DB 角色、Raw SQL 全參數綁定、webhook 驗簽。

### 雜項（v601/602/609）
- v601 Email 改 Gmail 寄信（DB emailProvider，避開 awstrack）+ composeEmail 按鈕導小編 LINE。
- v602 一日潛水日曆改週一起始。v609 訂單管理預設篩選「進行中需關注付款」。

### 下次先看
- 抵用金通知通道在「後台→抵用金管理」頁頂可調（預設 Email+站內）。
- 簽名補傳健康度：cron flush-signatures（每10分）；DB `signaturePending IS NOT NULL` 即待補。
- cron 全部走 `https://haiwangzi.xyz`（勿再用 zeabur.app）。

---

## 2026-06-20 — 訂單取消自動退還抵用金（v603）+ 雜項（v601 Email、v602 日曆）

### v603：取消退還抵用金（重點）
- **問題**：抵用金在下單當下就被 `spendCreditFIFO` 扣掉（＝預付），但所有取消路徑都沒退 → 用了又取消＝蒸發。
- **解法**：新增 `lib/refund-booking-credit.ts` → `refundBookingCredit(bookingId)`，退還 `booking.creditUsed`。
  - 冪等鍵：`reason=refund + refType=booking_cancel + refId`（同訂單只退一次）。
  - 與 admin 手動退款 route（`refType=booking`）**分流不重複**。退還永不過期（`expiresAt=null`）。
- **接入**：客戶自取消 `DELETE /api/bookings/[id]`、admin `admin/bookings/[id]`（DELETE 軟取消 + PATCH 改取消狀態）、`cancel-all`、`coach/trips/weather-cancel`。各回應加 `creditRefunded`。
- **待辦/可選**：取消通知文案可加一句「已退還抵用金 NT$X」；promo `usedCount` 取消時尚未回沖（次要）。

### v601 / v602（雜項）
- v601：`composeEmail` 按鈕一律導小編 LINE OA；寄信 provider 由 zsend(SES) 改 **gmail**（DB `emailProvider`，已改線上）→ 連結不再被 `awstrack.me` 包裝。
- v602：`liff/calendar` 日曆改**週一起始**。

---

## 2026-06-19（續3）— 節慶優惠 Phase 2 完成（2a + 2b）

### 完成（v592 後端 / v593 前端 / v594 推廣）
- **2a 後端**：下單套代碼(取其優+可疊抵用金)、早鳥結案發放(30天)、抵用金「先用最近到期」FIFO + 到期作廢、promo validate/active API。
- **2a 前端**：LIFF + `/pclogin` 下單加優惠代碼輸入;`/pclogin` 加「通知」頁籤(與手機同模式);Dump 加優惠代碼下拉;移除 `/dtest`。
- **2b**：發送精靈(`/admin/promo-codes` + `/api/admin/promo/send`,對象 全部/VIP5/有Email/活躍 × 管道 LINE/Email/內部,**預覽人數→確認才送**);進入彈窗 `components/PromoPopup`(LIFF welcome + `/pclogin`,今日不再顯示)。

### 改了哪些重要檔案
- `lib/credit-fifo.ts`(FIFO)、`lib/early-bird.ts`(結案發放)、`lib/promo.ts`(驗證/折扣/早鳥)。
- `api/bookings/daily`(套代碼+早鳥+FIFO)、`api/me`(讀餘額先清過期)、`coach/.../attendance`(掛早鳥)。
- `api/promo/validate|active`、`api/admin/promo/send`。
- `liff/dive/trip/[tripId]`、`pclogin/PcLoginApp`(代碼+通知+彈窗)、`admin/trips`(Dump)、`admin/promo-codes`(發送精靈)、`liff/welcome`(彈窗)。

### 卡在哪 / 下次先看什麼
- 抵用金 FIFO 是新模型(CreditTx.consumedAmount);退款/取消目前用 grantCredit(+) 還原成新 lot — 若要更精準的「還原到原 lot」之後可加強。
- 早鳥/代碼的 tour(潛旅)端尚未接(目前只日潛 daily);潛旅下單要套代碼需在 `/api/bookings/tour` 比照 daily 加。
- 驗收路徑:後台「🎏 節慶優惠」建公開檔 → LIFF/`/pclogin` 下單輸入該碼 → 看折扣;早鳥需設級距 + 到場完成才發。

---

## 2026-06-19（續2）— 桌面會員登入入口改名

### 完成（v591）
- **桌面會員登入/下單入口 `/dtest` → `/pclogin`**（官網「會員登入」鈕、LINE Login next、法務頁返回、robots 全部更新）。
- 舊網址 `/dtest` 保留為 301 轉址(書籤不失效)。元件 `DtestApp` → `PcLoginApp`。
- 補充:**桌面確實能下單** —— 官網「會員登入」→ `/pclogin`(瀏覽器 LINE Login)→ 下單 → `/pay`。和手機 LIFF 同會員、同後端(`/api/bookings/daily`)。Phase 2 優惠代碼/早鳥提示/彈窗要 **LIFF + /pclogin 兩邊都加**。

---

## 2026-06-19（續）— 節慶優惠 Phase 1（後台）

### 完成（v590）
- **節慶優惠代碼系統 Phase 1（後台管理）**:可建檔期、自動產 7 碼、設早鳥回饋。客戶端套用 = Phase 2。
- 規格(與老闆討論定案):全部走代碼(無自動套用)、公開/私密、兩種折扣(每支氣瓶 NT$ / 訂單 %)、期間/適用/限制(每人/總量/滿額/客群)、疊加「取其優 + 可疊抵用金」。
- 日潛早鳥回饋:提早預約 + 滿額(預設 1000,後台可設)→ **訂單結案後(完成、無退款)** 送抵用金,越早越多(級距後台設)。

### 改了哪些重要檔案
- `prisma/schema.prisma` + `scripts/migrate-safety.js`:`promo_codes` 表 + SiteConfig 早鳥欄位 + Booking(promo_code/promo_discount/early_bird_credit/early_bird_granted)。
- `src/lib/promo.ts`(新):`genUniquePromoCode`(7碼排除易混淆字)、`validatePromoCode`、`computeCodeDiscount`、`earlyBirdCredit`。
- `src/app/api/admin/promo/route.ts` + `[id]`:CRUD + `?gen=1` 產碼。
- `src/app/api/admin/site-config/route.ts`:早鳥欄位 Zod + 讀寫。
- `src/app/admin/promo-codes/page.tsx`(新):管理頁(早鳥設定 + 代碼列表 + 分區表單)。**注意:`/admin/promotion` 是海報產生器,沒覆蓋**,新頁走 `/admin/promo-codes`。
- `src/components/admin-web/AdminShell.tsx`:側欄「行銷/通知」加「🎏 節慶優惠」。

### 卡在哪 / 下一步（Phase 2）
- **下單套用**:`/api/bookings/daily` 套代碼折扣(取其優+可疊抵用金)+ 記錄;LIFF 預約頁加代碼輸入框 + 可用提示。
- **早鳥發放**:訂單結案(完成/無退款)時把 `early_bird_credit` 入帳(改 creditBalance + CreditTx),取消/退款不發。
- **發送精靈**(LINE/Email/內部 + 預覽人數 + 確認)+ **會員進入彈窗**。
- 既有「每支 25 元」tankPromo → 之後可遷成一筆公開代碼檔。

### 下次先看什麼
- `src/lib/promo.ts`(所有折扣/早鳥邏輯集中在此)→ 接 `/api/bookings/daily` 的價格計算(現有 `getActiveTankPromo` 附近)。

---

## 2026-06-19

### 完成
- **訪客分析**：後台總覽訪客卡新增「近 24 小時」每小時活動圖（v584 長條 → v585 平滑曲線 → v586 移到卡片上排填滿空白）。
- **後台操作說明更新**（v587）：`/admin/guide` 新增「頁面架構總覽」（前台/後台 × 桌機/手機 + 裝置分流）與「新功能補充」章節。
- **官網連結強化**（v588）：共用 footer 永遠帶官網（沒設定 fallback 到 `NEXT_PUBLIC_BASE_URL`）→ 每封 Email + 每則 LINE 文字訊息都帶官網；歡迎 Flex 加「認識我們·官方網站」按鈕。
- **文件整理**（本次）：更新 `README.md`（用途/功能/環境變數/已知問題/下一步）、新建本檔。

### 改了哪些重要檔案
- `prisma/schema.prisma` + `scripts/migrate-safety.js`：新增 `hourly_stats` 表（每小時訪客）。
- `src/components/VisitCounter.tsx` / `src/app/api/track/visit/route.ts`：beacon 加 per-hour 旗標、upsert 每小時桶。
- `src/app/api/admin/stats/visits/route.ts`：回傳近 24 小時 `hours[]` + `last24`。
- `src/app/admin/page.tsx`：訪客卡 24 小時曲線（SVG area+line，Catmull-Rom 平滑）。
- `src/app/admin/guide/page.tsx`：操作說明新增架構 + 新功能章節。
- `src/lib/social-footer.ts`：官網 fallback。
- `src/lib/flex/welcome.ts`：歡迎卡加官網按鈕。

### 決策
- 24 小時用「每小時瀏覽量」畫曲線（不做每小時 unique，太複雜）；資料從 v584 上線才開始累積。
- 官網連結覆蓋策略：Email + LINE 文字 + 歡迎卡（不對「純 Flex 卡」自動加 footer，避免每張卡後面多一條，屬刻意保留）。

### 卡在哪
- Google 尚未收錄 `haiwangzi.xyz`（新站排程延遲，非 bug，已驗證可被 Googlebot 抓取）。每日排程 `haiwangzi-index-check` 追蹤中。

### 下次先看什麼
- 訪客資料流：`VisitCounter.tsx` → `/api/track/visit` → `daily_stats` / `hourly_stats` → `/api/admin/stats/visits` → `/admin/page.tsx`。
- 任何 schema 變更**必經** `scripts/migrate-safety.js`（`prisma db push` 不可靠）。

---

## 2026-06-18

### 完成
- **手機後台**（v576）：8 區塊全部改手機版設計 `/admin/m/*`（老闆結帳/訂單/願望單/客服信箱/日潛/會員/潛旅/抵用金）+ 返回首頁列。
- **自建訪客計數器**（v577 建表 + 首頁、v578 桌機顯示、v579 GA 連結、v581 左右兩塊）。
- **GA4 深入分析嵌進後台**（v580）：OAuth refresh token（繞過服務帳戶金鑰組織政策）→ `/admin/analytics` 看訪客趨勢/熱門頁/來源/裝置。
- **保險提醒**（v582）：下訂後 5 個位置引導加保個人海域險（富邦第 1 類）。
- **官網外部連結欄位**（v583）：系統設定新增「官方網站」，自動附 Email/LINE footer。

### 改了哪些重要檔案
- `src/app/admin/m/*`（6 新頁）、`src/components/admin-web/MobileAdminShell.tsx`（title/back）。
- `src/lib/google-analytics.ts`（GA OAuth + Data API）、`src/app/api/admin/ga/*`、`prisma` 新增 `daily_stats` / `google_oauth`。
- `src/lib/insurance.ts` + `src/components/InsuranceNotice.tsx`（保險文案/元件，集中一處）。
- `src/lib/social-footer.ts` / `src/app/admin/settings/page.tsx` / `src/app/api/admin/site-config/route.ts`（官網欄位，Zod 白名單要同步加）。

### 決策
- GA 用 OAuth（DB 存 refresh token）而非服務帳戶金鑰（被組織政策 `iam.disableServiceAccountKeyCreation` 鎖）。
- 保險文案保守：「建議自行投保 + 詳細依保險條款請洽富邦」，不細述條款（避免客訴）。

### 卡點 / 待辦（老闆端）
- Google Search Console 已驗證 + 提交 sitemap；商家檔案已建。等收錄。
- GA `/admin/analytics` 需老闆按一次「連接」授權（已完成，資源 ID `541485375`）。

---

## 更早

完整歷程見 git log（`git log --oneline`）。版本由 `20260513_03` 起，重大里程碑：客服信箱 + LINE 整合、通訊紀錄、會員排序/VIP 篩選、Dump 一週場次、Turnstile/contact 修復等。
