# Changelog

## 20260628_726-C2 - 2026-06-29 (Codex verification gate completion)

- Added ESLint 9 flat config so `npm run lint` is part of the C1/C2 verification gate again.
- Verification: `npm run lint`, `npm audit --json`, and `npm run build` pass. Lint still reports existing warnings for later cleanup.

## 20260628_726-C1 - 2026-06-29 (Codex LIFF security/performance completion)

- Implemented C1 branch improvements: lazy-loaded `/liff/booking` tab bodies, lazy-loaded booking signature pads, centralized LIFF SDK loading, upgraded vulnerable dependencies, added HSTS, and fixed Prisma seed typings so production build verification passes.
- Added before/after audit: `docs/LIFF_SECURITY_PERFORMANCE_AUDIT_20260629.md`.
- Verification: `npm audit --json` reports 0 vulnerabilities and `npm run build` passes.

版本規則：`YYYYMMDD_NN`，NN 為跨日累計、不歸零的計數器。每次 push GitHub 都需要 bump。

> ⚠️ 註：此 CHANGELOG 自 v621 後曾長時間未補（v622–v664 的細節見 `git log` 與 `docs/PROGRESS.md`）。以下從 v665 起恢復記錄。

> 🆕 **第二版手機 UI `/m2`（v685→v692）** —— 完全獨立的新路由，不動 `/admin`、`/liff`、`/pclogin`、官網 `/`；後端全沿用既有 API（不新增）。只動 `src/app/m2/page.tsx`（另沿用 `SignaturePad`/`PolicyText`/`booking-status`/`payment-deadline` 純元件/函式，皆只讀）。⚠️ 目前登入是 UAT backdoor（弱密碼 `msi` → 以 neowu62 身分發會員 session），**正式上線前必須換成 LINE 登入並移除 `/api/m2/session`**。

## 20260628_726-C1 — 2026-06-29 (Codex LIFF 安全/效能改進分支起點)

- 依指示將 Codex 改進分支版本由 `20260628_726` 改為 `20260628_726-C1`，後續同基底迭代使用 `-C2`、`-C3`。
- 本分支目標：LINE LIFF 網路安全檢視、10 大安全與載入優化、改善前後差異比對、GitHub 分支驗證。

## 20260627_711 — 2026-06-27 (付款證明通知補場次+總額+應付尾款)

- 老闆收到的「新付款證明待核對」站內通知 + LINE 推播,原本只照抄客戶自填金額(看不到真正應付)。改為顯示:**場次**(日潛 日期/時間/潛點、潛旅 團名/出發日)、**訂單總額**、**應付款**(`remaining = totalAmount − paidAmount`,已扣抵用金)、以及**客戶填報金額**(對照用)。
- 解決:抵用金退回後,應付以訂單實際 `remaining` 為準(例 1250),不再只顯示客戶填的 1100。新增 `buildSessionLabel()`。
- 動檔:`src/app/api/bookings/[id]/payment-proofs/route.ts`。

> 註:v701–v710 由另一工作流推送(訂單潛次/氣瓶、應付餘額顯示、底部分頁 v709、客服信箱一鍵結案…),細節見 `git log`。

## 20260627_700 — 2026-06-27 (個人中心改 m2 風格 lazy 子頁,減少讀取)

- `/liff/profile` 整頁改 m2 風格:主清單只載入**一次** `/api/me`(姓名/統計/各項目);點項目才進子頁。
  - 子頁:個人資訊 / 證照·潛伴 / 通知偏好 用已載入資料**即時開啟**(零額外讀取),儲存 PATCH `/api/me`;Email 驗證 `send-verify-email`。
  - 抵用金明細才**另外即時讀** `/api/me/credits`(顯示讀取中)。
  - **移除「預約紀錄 / 潛水紀錄」兩列**(依老闆指示);保留抵用金明細。
  - 管理區(staff)「教練到場點名」→ `/liff/coach/today`;登出 `liff.logout()`。
- 沿用 `src/components/liff/mobileShared`(C/Sect)。改版前先以可點互動預覽與老闆確認過版面/感受。

## 20260627_699 — 2026-06-27 (訊息通知:站內訊息/發送訊息各佔一半 Y 軸)

- `/liff/messages` 改為上下 50/50:上半「站內訊息」(通知列表,獨立捲動)、下半「發送訊息給客服」(對話獨立捲動 + 輸入框釘在下半底部)。容器 `height: calc(100dvh - 152px)`,兩半 `flex:1`。

## 20260627_698 — 2026-06-27 (LIFF 微調:移除找不到日期/通知中心、我的預約卡片可收合)

- 一日潛水 / 旅行潛水:移除頂部「找不到日期？」入口(`CalendarContent`/`TourContent`,並移除 onGoWishes prop)。
- 我的預約 `/liff/my`:移除「通知中心」入口(已移到底部「訊息通知」分頁)。
- 我的預約:**每筆預約預設收合**,點整列(右側顯示狀態+金額+箭頭)才展開明細(活動提醒/取消/同意聲明/裝備/付款進度/付款方式/截圖/今日照片)。

## 20260627_697 — 2026-06-27 (LIFF 底部導覽重構:首頁/訊息通知/潛水預約整合)

- **底部 5 分頁**改為 **首頁 / 訊息通知 / 潛水預約 / 我的預約 / 個人中心**(`BottomNav` NAV 重寫;未讀紅點移到訊息通知)。
- **潛水預約整合頁** `/liff/booking`:一日潛水 / 旅行潛水 / 預約潛水 三合一,頂部三選項**即時切換**(lazy 掛載 + 保留狀態,不重載)。抽出 `CalendarContent` / `TourContent` / `WishesContent`(`src/components/liff/`)。願望單送出改 **inline 成功狀態**(不再跳出頁面)。
- **首頁** `/liff/home`:移植 m2 `HomeIntro`(手機版官網介紹,沿用 `_home/data`)。
- **訊息通知** `/liff/messages`:複製 m2 `MsgTab`(通知 + 客服對話),改用 `liff.fetchWithAuth`(`/api/me/notifications`、`/api/me/contact` 後端本就雙認證)。共用色盤 `src/components/liff/mobileShared.tsx`。
- 舊路由 `/liff/calendar`、`/liff/tour`、`/liff/wishes/new` → **轉址**到 `/liff/booking` 對應子分頁(舊書籤/連結仍可用)。
- 不動 m2、後端 API、我的預約/個人中心內容、場次/願望詳情與下單流程。

## 20260626_696 — 2026-06-26 (LIFF 頂部 logo 改連官網手機首頁 /)

- `LiffShell` 左上品牌列(Wordmark：logo+版本)點擊由 `/liff/welcome` 改為 `/` —— 從任何 LIFF 頁點 logo 都回到官網手機首頁(MobileHome)。

## 20260626_695 — 2026-06-26 (m2 後台管理接真實資料 + 轉帳截圖點擊才載入)

- **m2 後台管理(Admin)有功能了**：`今日營運`移到最上面並接真實 `/api/admin/stats`(今日新訂單/待確認匯款/待結算/未付款);新增「待確認客戶訂單」清單(真實 `pendingProofsDetails`,**預設縮起、點擊展開**);「到場點名」磚 → 切教練畫面、「老闆結帳」磚 → 展開待確認訂單;其餘磚標示「桌機後台處理」。neowu62=admin,`/api/admin/stats` 用 `authFromRequest`(同顆 `hwz_member` cookie)+ `requireRole(["admin","coach"])` 可存取。
- **轉帳截圖改點擊才載入(會員 OrderCard)**：不再預載縮圖,改 icon(類型+金額+待核/已核),點擊才開全螢幕視窗載入大圖 —— 省流量/加速,符合手機鐵則。
- 待辦:m2 後台完整結帳/訂單/團務「寫入動作」(確認到帳/取消等)尚未移植,目前在桌機後台。

## 20260626_694 — 2026-06-26 (效能探針：定位場次/潛旅載入慢的環節 — 證實非 DB)

- **量測結論**：curl 實測 `/api/trips`·`/api/tours` = server+DB 僅 ~50ms、含連線握手 TTFB ~280ms(三次一致);`/api/healthz?db=1` 回 **`dbPingMs` 1ms(暖)/33ms(冷首連)**。→ **DB 與 API 都不是瓶頸,v693 快取有效**。載入久發生在「裝置端」(LINE webview JS 載入/hydration、或手機網路首連)。
- **可視化探針(`?debug=1` 才顯示,一般使用者無感)**：`/liff/calendar`、`/liff/tour`、m2 潛水清單顯示「⏱ 查詢往返 Xms · 進頁→開查 Yms」。Y 大=JS/hydration 慢;X 大=裝置網路/server 慢。
- **`/api/healthz?db=1`**：回 `dbPingMs`(`SELECT 1` 往返),預設不打 DB 維持健康檢查輕量。
- 下一步:依手機端 `?debug=1` 實測數字決定優化方向(首屏輕量化 / 骨架 / 預連線)。

## 20260626_693 — 2026-06-26 (公開資料「版本號失效」快取：場次/潛旅/設定平時零 DB)

- **目的**：消費者「純看」共享資料(場次/潛旅/營業設定/政策/裝備價)時不必每次重打 DB，降延遲、抗尖峰;個人資料維持即時。
- **`src/lib/cache.ts`**：進程內記憶體快取 + 每 domain 版本計數器(`config`/`trips`/`tours`)+ backstop TTL 安全網(`cached(key, domain, backstopMs, load)`)。
- **`src/lib/prisma.ts`**：Prisma `$extends` 集中蓋章 —— `divingTrip`/`tourPackage`/`booking`/`siteConfig` 任何寫入自動 `bumpVersion()`。因所有寫入都過 Prisma，後台 CRUD/seed/bulk-import/下單/取消全涵蓋、不漏勾;預約會改空位 → 同時失效 `trips`+`tours`。
- **`src/lib/site-config-cache.ts`**：`/api/config`、`/api/site-config` 共用 `siteConfig` 整列快取(6h backstop)。
- **`/api/trips`·`/api/trips/[id]`·`/api/tours`·`/api/tours/[id]`**：包 `cached`(10min backstop)。
- **m2 前端**：公開 fetch(場次/潛旅 清單·詳情)移除 `cache:"no-store"` 改吃快取;個人 API(`/api/me`·`bookings/my`·`notifications`·`credits`)維持 `no-store` 即時。
- **效果**：命中快取時零重查詢;後台按儲存或有人下單 → 版本 +1，下個讀取自動更新(空位即時準)。⚠️ 前提=單一容器(Zeabur 單實例);多實例日後把版本號改放共用儲存(DB 一列/Redis)即可,讀寫介面不變。

## 20260626_692 — 2026-06-26 (m2 訂單=複製我的預約；個人各項可點進子頁)

- **訂單分頁 = 完整複製 LIFF「我的預約」(`/liff/my`)**：通知中心入口、4 分段（即將前往/📝願望單/已結束/已取消）、願望單清單（`/api/dive-wishes`，新需求→客製）。訂單卡用 `deriveBookingDisplay` 衍生狀態徽章、人數/氣瓶、裝備 chips、旅潛付款進度條 + 預約/訂金/尾款/出發 4 步 + 訂金/尾款金額、付款方式選擇（`/pay/[id]?t=token`）、付款截止日（`computePaymentDeadline`）、取消訂單（`DELETE /api/bookings/[id]`）、同意聲明 modal（簽名圖 + 取消/安全政策）、申請退款（送 `/api/me/contact`）、轉帳截圖縮圖。
- **個人分頁各項可點進子頁**：個人資訊（姓名/手機/Email+發驗證信/生日/緊急聯絡人）、證照·潛伴（證照等級/編號/潛次 + 常用潛伴 CRUD）→ `PATCH /api/me`；通知偏好（LINE/Email）；預約紀錄→訂單分頁；潛水紀錄（海王子累積氣瓶/已完成）；抵用金明細（`/api/me/credits`：餘額/收支/逐筆 + 原因圖示）。全沿用 m2 既有 `C` 色系。

## 20260626_691 — 2026-06-26 (m2 潛水四類完整下單系統移植自 LIFF)

- 一日潛水 `DailyBook`：接 `/api/trips/[id]` 計價 + `/api/me` 預填/抵用金/VIP裝備折/氣瓶折/教練價。完整欄位：人數·潛次 stepper、裝備租借（數量+VIP折）、個人資料（姓名/手機/證照等級/號碼/累計潛次）、緊急聯絡人、潛伴（人數>1）、優惠代碼（`/api/promo/validate`）、抵用金、政策同意+手寫簽名（沿用 `SignaturePad`/`PolicyText`）、費用明細 → `POST /api/bookings/daily`（完整 payload）。
- 旅遊潛水 `TourBook`：接 `/api/tours/[id]`：人數/加購/含不含/報名資料/緊急聯絡人/抵用金/政策簽名/訂金 → `POST /api/bookings/tour`。
- 潛水課程 `CourseList`：沿用官網 `COURSES`（體驗/OW/AOW/Fun Dive）+ LINE 報名；客製維持送需求。金額後端權威重算，client 計價僅顯示。

## 20260626_690 — 2026-06-26 (m2 可運作下單)

- 點場次 → 預約表單（人數 + 同意聲明）→ `POST /api/bookings/daily|tour` 產生真實訂單 → 自動跳訂單分頁。客製潛水送需求 → 客服（`/api/me/contact`）；email 未驗證提示（後端會擋 403）。

## 20260626_689 — 2026-06-26 (m2 接真實帳號 neowu62)

- 密碼改 `msi`；新增 `/api/m2/session`（POST 驗密碼 → 以 `M2_DEFAULT_EMAIL` 查到的帳號用 `createMemberWebJwt` 發 **會員** session，set `hwz_member` cookie；與 `/pclogin` 同一顆，DELETE 為登出）。訊息/訂單/個人接 `/api/me`·`/api/me/notifications`·`/api/me/contact`·`/api/bookings/my`；訊息客服框釘底；教練/IT 入口移到個人→管理。⚠️ UAT backdoor，上線前要移除。

## 20260626_688 — 2026-06-26 (m2 底部 5 分頁固定釘底)

- 容器改 `height:100dvh` 固定高、中間區 `flex:1;minHeight:0;overflowY:auto` 內捲、頂列/底列 `flex-none`、加 `env(safe-area-inset-bottom)` padding —— 底部分頁列不再隨內容捲走。

## 20260626_687 — 2026-06-26 (m2 潛水分頁接真實場次)

- 一日潛水 → `/api/trips`、旅遊潛水 → `/api/tours`（空位/額滿/候補/訂金徽章 + 載入態）。客製/課程暫維持靜態。

## 20260626_686 — 2026-06-26 (m2 首頁=手機版官網/產品介紹)

- 沿用官網 `src/app/_home/data` 同一份資料常數（課程 COURSES / 潛點 SPOTS / 評價 BUILTIN_REVIEWS / FAQ / 社群 + LINE）於 m2 首頁呈現濃縮版官網內容；主視覺 + 「看場次」切到潛水分頁。只動 m2 首頁分頁，不影響官網。

## 20260626_685 — 2026-06-26 (第二版手機 UI m2 骨架)

- 新增完全獨立路由 `/m2`（`src/app/m2/page.tsx`，純 inline-style 新「皮」）：密碼閘 → 三角色（會員/教練助教/IT老闆）→ 會員 5 分頁 / 教練點名 / IT 管理（靜態 UAT 版）。`/admin` 系統/IT 加「🆕 New UI (m2)」入口。不動既有架構。

## 20260626_684 — 2026-06-26 (老闆結帳卡片數字修正)

- 老闆結帳卡片加「已下單·待匯款」計數（`pendingOrders`）、移除已搬走的「待到場」；到場點名改顯示「待到場」徽章（桌機側欄 + 手機卡）。*(非 m2)*

## 20260626_683 — 2026-06-26 (修教練 LIFF 助教 403)

- `/api/coach/today` 等教練 API 補上 `assistant` 角色（與教練同權限做現場作業：今日場次/到場/照片/天氣取消）。款項類 `/api/coach/payment-proofs` 維持只給老闆/admin（教練助教不碰款項）。

## 20260626_682 — 2026-06-26 (訂單管理預設未來場次)

- `/admin/bookings` 預設 `filterTripPeriod` 由 `all` → **`future`**：預設只顯示「活動未開始/未過期」+ 進行中付款狀態的訂單，濾掉活動已過的舊單。仍可點「全部/今明/過期場次」chip 切換。

## 20260626_681 — 2026-06-26 (老闆結帳移除待到場確認)

- 桌機 `/admin/tonight` + 手機 `/admin/m/tonight` 移除「待到場確認」區（含批次到場邏輯/狀態/計算）。已由獨立「到場點名」取代，避免重複。老闆結帳專注收款。

## 20260626_680 — 2026-06-26 (手機後台徹底不導桌機)

- 鐵則：手機後台不可有導向桌機 `/admin/*` 的連結。清掉 8 個漏網：頭部完整版/完整模板/編輯場次/編輯此團、訂單/會員卡 drill-in（改純顯示）、訪客卡（改純顯示）、老闆結帳到場/待匯款改連 `/admin/m/*`。驗證 `grep href="/admin/` 非 m 為空。

## 20260626_679 — 2026-06-26 (手機/桌機到場點名區隔)

- 新增手機版 `/admin/m/attendance`（MobileAdminShell）。手機端到場點名導向全改手機頁（不再跑桌機介面）；`/admin/m` 首頁加「🐠 到場點名」卡。`/admin` 登入導向依寬度分流（手機→手機版、桌機→桌機版）。

## 20260626_678 — 2026-06-26 (到場點名也給老闆/管理者/IT)

- 「到場點名」加進「營運/分析」群組（緊鄰老闆結帳，admin/boss/it 可見）；「現場作業」群組改只給 coach/assistant，避免重複。

## 20260626_677 — 2026-06-26 (到場點名功能 + 角色登入 + pg_trgm)

- **到場點名**：新頁 `/admin/attendance` + `GET /api/admin/attendance/today`（今日場次/潛旅的 confirmed/completed/no_show 名單，依場次分組），點名走既有 `POST /api/coach/bookings/[id]/attendance`。
- **後台登入開放教練/助教**：`/api/admin-web/auth` + `set-password` 的 `BACKEND_LOGIN_ROLES` 加 coach/assistant。`AdminShell` NAV_GROUPS 角色白名單（教練/助教只看到場點名，其餘群組限 admin/boss/it）；我的最愛也依角色過濾；登入後自動導到 /admin/attendance。
- **pg_trgm**：`migrate-safety.js` 加 users real_name/display_name/phone/code 的 GIN trgm 索引（會員 `?q=` 搜尋加速）。

## 20260626_676 — 2026-06-26 (/admin/m 載入優化 + 移除完整版)

- `/admin/m/tonight` 的 `/api/admin/bookings` 改 `?light=1`。移除 `MobileAdminShell` 頂部「完整版」桌機跳轉鈕 + 各頁 header 跳轉連結。

## 20260625_675 — 2026-06-25 (手機後台多項)

- 老闆結帳加「🧾 已下單·待匯款」（桌機+手機）。會員查詢/抵用金改「搜尋才查」（後端 `/api/admin/users?q=` 限 60 筆，打開不抓全部）+ 移除 VIP 篩選。潛旅展開名單修中文狀態（deriveBookingDisplay）+ 已付/未付 + `?light=1` 加速。
- `/api/admin/bookings?light=1`：跳過簽名 presigned URL/狀態log/退款查詢（名單載入快）。

## 20260625_674 — 2026-06-25 (/pclogin 通知頁兩欄)

- 桌機通知頁改兩欄：左=訊息通知列表、右=訊息反饋（客服對話）；窄畫面 `auto-fit` 自動疊回單欄。

## 20260625_673 — 2026-06-25 (LIFF 旅潛金額明細)

- 手機 LIFF 我的預約 旅潛卡顯示「已付訂金 / 尾款」明細（對齊桌機）。

## 20260625_672 — 2026-06-25 (/pclogin 旅潛金額拆分)

- `/pclogin` 我的訂單 旅潛拆「已付訂金 / 尾款（截止日）」；`/api/bookings/my` 回 `finalDeadline`。

## 20260625_671 — 2026-06-25 (/pclogin 線上洽詢分頁)

- `/pclogin` 預約頁加「📨 線上洽詢/揪團」分頁（搬自公開 /contact，兩張卡：疑問→客服信箱、揪團→願望單）。登入會員免填姓名/Email/電話、免 Turnstile（`/api/contact` 加會員快速通道：authed 跳過 turnstile + 用會員身分 + 綁 lineUserId tag「會員洽詢」）。

## 20260625_670 — 2026-06-25 (訊息模板左欄加寬)

- `/admin/templates` 左欄「依流程選擇」256→300px；模板名稱由 `…` 截斷改**自動換行**，長名（老闆訂金[確認中/已確認]）完整顯示。中間「填寫資料」仍 `1fr` 自動吸收。

## 20260625_669 — 2026-06-25 (客服對話分頁)

- `/api/me/contact` GET 加分頁：預設只回**最近 30 則**（由舊到新）+ `hasMore`/`oldestAt`；`?before=<ISO>` 往上補更早 30 則。減少手機流量。
- 桌機 `/pclogin` 通知頁對話框：**固定高度 320px 捲動框** + 進入/送出**自動到最新** + 框頂「↑ 載入更早訊息」（載入更早時保持位置）。
- 註：雙向客服對話只存在桌機 /pclogin；LIFF 客戶走 LINE 對話，無此串。

## 20260625_668 — 2026-06-25 (桌機登入未讀彈窗)

- 桌機 `/pclogin` 登入後若有未讀站內通知 → 自動跳一次彈窗（每 session 一次 sessionStorage、3 秒自動關、對齊 LIFF `UnreadPopup`）。未讀數用 `/api/me` 的 `stats.unreadNotifications`，零額外往返。

## 20260625_667 — 2026-06-25 (預約確認備註 + 老闆結帳待匯款 + 卡片重排)

- 日潛「預約確認」(booking_confirm) 動態主體加 `📣 活動提醒`（場次 activityNote）+ `📝 您的備註`（Booking.notes），有才顯示。改 `bookings/daily/route.ts` params + `message-content.ts`。
- 老闆結帳 `/admin/tonight` 新增 **🧾 已下單·待匯款** 區（status=pending 未上傳證明），讓老闆知道有單在等收款。
- 待確認匯款卡片重排：出團日期/時間移到**最上面**；付款方式備註 + 上傳時間/電話移到**右側**（核可/駁回上方）。

## 20260625_666 — 2026-06-25 (LIFF 活動提醒 + 桌機 nav 徽章 + 通知近一周 + 目的地中文)

- LIFF 我的預約卡 + 日潛/潛旅**下單頁**顯示綠色 `📣 活動提醒`（trip/tour.activityNote；detail API 本就 spread 全欄）。
- 桌機 `/pclogin` nav 徽章：我的訂單=進行中筆數、通知=未讀數（`/api/me` 加 `stats.unreadNotifications`）。
- 桌機通知篩選加 **近一周** 並設為預設（filter `week`）。
- 潛旅目的地 enum（northeast/green_island/lanyu/kenting/other）桌機原本印英文代碼 → 補中文（蘭嶼/綠島/墾丁/東北角/海外）；LIFF 本就有對照。

## 20260625_665 — 2026-06-25 (老闆訂金確認中 可編輯模板 + 訂金確認改名)

- 新增可編輯訊息模板 **deposit_pending「老闆訂金[確認中]」**（內部，發老闆）：客戶上傳**訂金**證明 → 站內 + LINE Flex 通知老闆去核對（可在訊息模板頁編輯字句/試送）。新增 `flex/deposit-pending.ts` + 註冊 6 處 + wiring `payment-proofs/route.ts` 訂金分支。
- `deposit_confirm` 顯示名「訂金確認」→ **「老闆訂金[已確認]」**。

## 20260619_621 — 2026-06-21 (修付款上傳重複證明 BUG + 氣瓶數 + 上傳按鈕)

- **BUG 根因**：LINE WebView 慢，React 按鈕 disable 來不及生效，客戶連點「送出」→ 多次 submit() → 產生多筆相同付款證明（同款被重複記錄）。
- **修正（雙保險）**：前端 submit() 加同步防重入鎖（useRef，第一個 await 前上鎖）+ uploaded 擋；後端 payment-proofs POST 去重（5 分鐘內相同 訂單+類型+金額+後5碼 未審核證明 → 回既有、不新建/通知）。
- 訂單資訊補「N 支氣瓶・M 人・📍地點」；「轉帳截圖」上傳按鈕加大加色。
- 既有重複髒資料以後台靜默刪除清理（coach reject = delete，不通知客戶）。

## 20260619_620 — 2026-06-21 (付款核對/老闆結帳補資訊)

- 核對頁 + 老闆結帳（/admin/tonight、/admin/m/tonight）補：出團日期/潛點/該場次目前已參加人數(X/容量)、客戶備註、管理備註。列表批次抓場次避免 N+1。

## 20260619_619 — 2026-06-21 (付款核對獨立頁)

- 付款證明通知深連結到 /verify-proof/<proofId>（中轉頁依環境導 手機 LIFF /liff/coach/verify 或 瀏覽器 /admin/verify）→ 直接跳那一筆，看完截圖再按 確認/退回（不自動確認）。GET 單筆核對 API 統一驗證。

## 20260619_618 — 2026-06-20 (修抵用金管理時間多冒號)

- admin/credits 時間欄改明確格式參數（不再 slice），消除尾端多餘冒號。

## 20260619_617 — 2026-06-21 (天氣取消手動觸發)

- 場次管理「取消場次」加勾選「🌊 天氣取消：通知客戶並退款」→ 走 coach/trips/weather-cancel：
  取消該場次所有訂單 + 發天氣取消通知(LINE/Email/站內) + 自動退抵用金。不勾＝僅改狀態。有報名預設勾。
- 補足缺口：天氣取消模板原本無 UI 觸發點（cron 未排程、route 無按鈕）。

## 20260619_616 — 2026-06-21 (cron 密鑰 timing-safe)
- 22 個 cron + email webhook 的 Bearer/secret 比對改用 safeEqual（常數時間）。

## 20260619_615 — 2026-06-21 (清除死碼)

- 刪 src/lib/email/templates.ts 10 個 legacy 死函式（-415 行，客戶 Email 早已改走 notify-template/flex）。
- 刪 vip-tier `VIP_TIER_MAP`/`getNextTierProgress`、booking-status `isActionable`、bookings 頁未用 import（皆 grep 多次確認 0 引用）。

## 20260619_614 — 2026-06-21 (安全強化 + 簽名上傳優化)

- 安全：cron/email-inbound-poll fail-closed；admin/users 不再外送密碼雜湊；contact 加限流 + Turnstile 正式環境 fail-closed；promo/validate 限流；bootstrap 守衛補 roles[]。
- 簽名：SignaturePad 匯出由全解析 PNG → 縮 640px + JPEG 0.7（payload 80~250KB → 8~20KB），移除每筆重複序列化。

## 20260619_613 — 2026-06-21 (移除舊網域轉址)
- proxy.ts 移除 haiwangzi.zeabur.app 轉址（舊網域停用）；保留 www→apex。

## 20260619_612 — 2026-06-20 (簽名 DB-buffer + 自動補傳)
- 下單簽名先存 DB 暫存欄位（秒回）→ 背景 + cron /api/cron/flush-signatures 補傳 R2，簽名不掉。

## 20260619_611 — 2026-06-20 (修下單連線逾時)
- 簽名上傳改背景 + R2 S3Client 加逾時/限重試，避免拖過前端 12 秒逾時。

## 20260619_610 — 2026-06-20 (抵用金異動統一通知，通道可選)

- 任何抵用金變更都通知會員：在 `grantCredit` 統一掛 `notifyCreditChange`（LINE/Email/站內）。
- 通道由後台「抵用金管理」頁開關控制（SiteConfig：creditNotifyLine/Email/InApp），**預設 Email + 站內、LINE 關**。
- 已有專屬通知（首單/生日/VIP/退款）與一次性 backfill 加 `skipNotify` 避免重複/濫發。
- 補滿先前無通知的來源：註冊禮金、早鳥、取消退還、admin 手動新增。

## 20260619_609 — 2026-06-20 (訂單管理預設篩選進行中)
- 訂單管理預設只顯示 等待付款/待確認匯款/已確認付款(訂金)/已完成付款；點「全部」或 chip 看其他。

## 20260619_608 — 2026-06-20 (訂單列表顯示「抵用金已退」標記)
- admin bookings API 回 creditRefunded；列表狀態欄顯示「↩ 抵用金已退 NT$X」。

## 20260619_607 — 2026-06-20 (退抵用金在訂單歷程留紀錄)
- 退款時寫 BookingStatusLog（system，from==to 顯示單一狀態）；backfill 可回補歷程行。

## 20260619_606 — 2026-06-20 (補退漏網訂單工具)
- /api/admin/backfill-cancel-credit-refunds：盤點/補退 v603 前已取消未退的訂單（冪等）。

## 20260619_605 — 2026-06-20 (抵用金管理刪除防呆)
- 只允許刪未使用的發放筆；使用/退還紀錄與已折抵發放擋下；餘額 clamp ≥ 0。

## 20260619_604 — 2026-06-20 (抵用金餘額 0 顯示灰字)
- LIFF + /pclogin 下單頁餘額 0 時顯示說明而非隱藏。

## 20260619_603 — 2026-06-20 (訂單取消自動退還抵用金)

- **問題**：下單時抵用金即用 `spendCreditFIFO` 扣掉（抵用金＝預付），但各取消路徑都沒退回 → 客戶用了抵用金又取消＝憑空蒸發。
- **修正**：新增冪等 helper `lib/refund-booking-credit.ts`，訂單取消時退還 `booking.creditUsed`（寫一筆 `reason=refund / refType=booking_cancel` 的 +CreditTx，永不過期）。同張訂單只退一次；與 admin 手動退款（`refType=booking`）分流，不重複退。
- **接入 4 條取消路徑**：客戶自取消（`DELETE /api/bookings/[id]`）、admin 軟取消 + PATCH 改取消狀態（`admin/bookings/[id]`）、批次取消（`cancel-all`）、天候取消（`coach/trips/weather-cancel`）。
- 回應新增 `creditRefunded` 欄位。

## 20260619_602 — 2026-06-20 (一日潛水日曆改週一起始)

- LIFF `liff/calendar`：星期表頭與每週起始由「週日」改「週一」（`startOfWeek` 改算當週週一）。

## 20260619_601 — 2026-06-20 (Email 按鈕鎖小編 LINE + 改 Gmail 寄信)

- `composeEmail` 按鈕一律導小編 LINE OA（涵蓋所有 Email 路徑）；寄信 provider 由 zsend(SES,有 awstrack 追蹤) 改 gmail，連結乾淨不被包裝。

## 20260611_482 — 2026-06-11 (/dtest 登入頁改版 + 隱私權/服務條款)

- **登入頁改版**：未登入走全螢幕海洋漸層的「加入海王子會員」頁 — 品牌 crest、Email 使用說明卡（4 用途 + 不外洩聲明）、同意條款 checkbox（勾選後才能按 LINE 註冊/登入）、「已經是會員了？直接登入」。
- **新增 `/privacy`（隱私權政策）+ `/terms`（服務條款）**：品牌化標準範本（老闆可再修文字），登入頁條款連結指向這兩頁。
- 驗證：未勾選同意 → LINE 按鈕停用無連結；勾選後啟用導向 OAuth；兩法律頁皆 200。

## 20260611_481 — 2026-06-11 (瀏覽器會員下單 /dtest — 真 LINE Login web OAuth)

- **架構**：瀏覽器（桌面）會員登入走 LINE Login web OAuth，與手機 LIFF 同一 Provider → 同一個 lineUserId = 同一會員。驗證後簽會員 web JWT 放 httpOnly cookie（30 天）。
- **auth.ts**：新增 `createMemberWebJwt` / `tryVerifyMemberWebJwt` + `authFromRequest` 加 member-web 分支與 cookie fallback；`verifyLineLoginIdToken`（LINE Login audience + nonce）。`getOrCreateUser` 改 export。
- **OAuth 路由**：`/api/auth/line/login`（state+nonce cookie 防 CSRF）、`/api/auth/line/callback`（驗 state→換 token→驗 id_token→簽 cookie→導回）、`/api/auth/line/logout`。未設定 channel 時優雅回 503。
- **/dtest 桌面下單介面**：登入閘（LINE 登入）、Email 驗證 banner、瀏覽日潛/潛旅、**完整下單表單（日潛 + 潛旅）**重用既有 `/api/bookings/daily`、`/api/bookings/tour`、下單後導向 `/pay/[id]`、我的訂單、會員中心。所有 API 走 cookie session。
- **首頁**：右上加「會員登入」入口（手機選單也加），導向 /dtest。
- **env**：新增 `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` / `LINE_LOGIN_CALLBACK_URL`（.env.example 含設定說明）。
- ⚠ 需老闆在 LINE Console 同 Provider 下建 LINE Login channel + 設 2 個環境變數 + callback 白名單，登入才會通。

## 20260611_480 — 2026-06-11 (訊息模板「填什麼發什麼」全面統一)

- **單一組稿來源** `src/lib/message-content.ts`：欄位預設值 / 動態主體 / Email 外殼 / 樣本參數 — 後台填寫、預覽、試送、正式發送(LINE/Email/站內) 全走同一份
- **notifyCustomer v2**：三通道內容全由模板組稿；尊重模板層 LINE/Email/站內開關 + 會員 opt-in；通知列文字(altText)＝後台欄位；Email 不再用寫死模板
- **6 個 flex builder 接上 override**（deposit_notice / deposit_confirm / final_reminder / trip_guide / overcap_alert / admin_weekly 之前完全忽略後台設定）+ booking_confirm 移除過時「當日現場收費」+ d1 加按鈕 + weather_cancel bodyText
- **真實發送點改模板驅動**：booking_confirm(原只發email→三通道)、deposit_confirm(原無發送點→訂金核可時發)、welcome(webhook reply 改吃 override+補站內)、d1/訂金催繳/尾款×2(cron)、weather-check、attendance、首單獎勵、退款申請、超賣、週報、broadcast(sync→async)
- **footerHint 真正可存**（DB 缺 footer_hint 欄位，存了會掉）：schema + migrate-safety + API + 表單
- **後台模板頁**：區塊2新增「內容主體（動態資料）」唯讀區；三預覽改用真組稿（副標/說明分離、動態主體真實化、站內按鈕標示「前往查看/關閉通知」）
- 站內通知詳情視窗「關閉通知」按鈕改珊瑚橘（與「前往查看」同色，易辨識）

## 20260608_399 — 2026-06-08 (後台前端效能：快取 + 去重 + SWR)

## 20260608_406 — 2026-06-08 (首頁最新動態進階：精選置頂/數量/排除/長片濾鏡)

- 後台 系統設定→🏠首頁→auto 模式進階：⭐精選置頂影片ID（放大格）、顯示數量(3~8)、🚫排除影片ID清單、影片類型(長片+Shorts / 只長片)
- 前台 /test 套用：排除→長片濾→精選置頂→限數量；精選那支自動放大格
- /api/youtube/recent 多抓到 15 支供前端過濾；SiteConfig +home_video_featured_id/count/exclude_ids/filter（migrate-safety 補欄）

## 20260608_402 — 2026-06-08 (公開行銷首頁 階段1：靜態主體，先放 /test)

- **先放 `/test` 測試**（根頁 `/` 維持原 LINE landing）；移植原型「藍色實拍版」→ Next.js（Hero/潛點6/潛旅6/最新動態/關於汪汪/評價6/FAQ 7類23題/CTA/Footer）
- 設計系統 `home.css`（深藍實拍風 + 青光、Noto Serif/Sans TC + Outfit）；base64 圖抽成 /home/src-XX 檔案（示意，待汪汪實拍替換）
- 互動：上升氣泡、reveal-on-scroll、右側點點 scroll-spy、漢堡選單、FAQ 手風琴、YouTube facade 點擊就地播放、三叉戟 loader、底部 LINE 列
- 最新動態先用初始影片；YouTube 自動抓(MediaPost)+IG(Behold)+後台動態訊息分頁 = 下一版

## 20260608_401 — 2026-06-08 (後台連線測速診斷工具)

- 側欄加「🔬 連線測速」面板：從你的瀏覽器實測到伺服器的延遲（協定/最快暖/最慢首次/平均/抖動）+ 一鍵複製結果
- 頂部加即時延遲徽章（點一下重測）
- 用途：判定「後台慢」是網路/線路問題還是客戶端問題（伺服器在東京，理論上台灣 <100ms）

針對「用久變慢 / 切頁卡載入 / 連點讀不到」（實測非 DB、非容器資源，是高延遲下連線壅塞）做前端優化：

### 核心資料層（新）
- `src/lib/admin-cache.ts`：模組級快取（stale-while-revalidate）+ 同 URL 去重 + 變更失效 + `useCachedFetch` hook
- `adminFetch`：**GET 去重** — 同一 path 同時只發一支（連點/快速切頁不再疊一堆請求 → 解連線壅塞）

### 套用（6 大頁：先秀快取秒開、背景重新驗證、本地變動同步回快取）
- 訂單管理 / 會員管理 / 潛水團 / 抵用金 / 日潛場次 / 總覽

### 並行化（stage 2）
- 總覽：stats 與願望單數原本序列等待 → 改 `Promise.allSettled` 並行
- 日潛場次原本已並行（Promise.allSettled）

### 效果
- 切走再切回同頁：≈0 秒秒開（先秀上次資料）+ 背景更新
- 連點 / 快速切頁：去重 → 不塞車、不卡
- 用久變慢：不再累積重複請求
- ※ 第一次載入的固有延遲（伺服器區域遠）仍需靠「搬區域」解，前端無法消除

## 20260608_398 — 2026-06-08 (自動發送收件人勾選即時儲存)

- 經查：收件人勾選邏輯本身正確（toggle→state→checked→Save→API 一致），**非 bug**；問題是要再按「儲存」才生效易被誤會「沒用」
- 改為**勾選即自動儲存**（toggle/清除無效收件人都即時 POST），加「儲存中…/✓已儲存」即時提示，不用再按下方按鈕
- 另：已清掉 DB 殘留的舊格式裸信箱收件人（`neowu@msi.com`）

## 20260608_397 — 2026-06-08 (場次管理：搜尋 filter + 狀態/收費微調 + keepalive)

- 場次管理頂部加**搜尋輸入框**（依 編號 / 地點 / 教練 / 日期 即時過濾）
- 狀態欄「自動」標籤改**置於「已完成」下方**（垂直堆疊）
- 預估收費**移除 NT$**：無收費（0）顯示「—」，有值顯示純數字
- **GitHub Actions keepalive**：每 5 分鐘 ping `/api/healthz` 防止 Zeabur 容器閒置 cold start（不需 Cronicle）

## 20260608_396 — 2026-06-08 (老闆結帳付款證明圖修正)

- 老闆結帳「待確認匯款」付款證明圖：**沒上傳圖（現金/只填後5碼）→ 顯示「🚫 無圖」**，不再卡著空轉
- 圖片載入失敗（presigned 404 等）→ `onError` 自動退成「載入失敗」placeholder，不再無限轉圈
- 縮圖(thumb)當 fallback、`loading="lazy"`

## 20260608_395 — 2026-06-08 (FAQ 對齊實際 + 改保守)

- **移除過度承諾**：VIP 福利原寫「行程折扣 9/8/7 折」→ 改為「裝備折扣（折數依等級、店家設定）」；天氣取消原寫「退款100%/轉抵110%」→ 改為「店家協助辦理，依當下狀況與公告」
- VIP 等級名稱修正「蝙蝠魟」→「鬼蝠魟 🪼」
- 抵用金來源補上 **註冊禮金 / 首單獎勵 / 滿級回饋**
- 全面加「各項優惠金額/門檻依實際狀況調整，以系統顯示與最新公告為準，海王子保留調整權利」但書

## 20260608_394 — 2026-06-08 (付款證明「無圖片」placeholder)

- 訂單管理付款證明：客戶**沒上傳截圖**（僅填後 5 碼）時，顯示「🚫 無圖片（僅填後 5 碼）」虛線框 icon，與「已清理/載入失敗」區分
- （效能診斷結論：DB/後端/R2 都正常，「載入久」是容器閒置 cold start → 解法為 Cronicle keepalive 每 5 分鐘戳 /api/healthz）

## 20260607_393 — 2026-06-07 (自動發送分頁微調)

- tab 名稱「🌤 天氣」改回「📨 自動發送」（涵蓋天氣回報 + 訂單預報，名稱較準）
- 「📋 每晚 21:00 明日訂單預報」區塊**移到分頁最上方**（天氣回報之上）

### 一鍵補發改進
- 補發前**列出實際要補發的會員名單**（dry-run 端點回傳 members）：💰金額分頁 + 抵用金管理對話框都顯示
- 💰金額分頁 **生日禮金列新增「一鍵補發」按鈕**（原本只有註冊有）；兩者都先列名單再確認

## 20260607_392 — 2026-06-07 (氣瓶限時折扣：自動套用 + 理由 + 起訖日)

### 🔥 氣瓶限時折扣（會動到結帳金額）
- 系統設定 → 💰金額 →「🔥 氣瓶限時折扣」：**開關 / 每支折抵 NT$ / 理由 / 開始日 / 結束日**
- 下單金流：**潛水費 = (每瓶費 − 折抵) × 瓶數 × 人數**（只折氣瓶，不折附加/裝備；折抵不會使每瓶費變負）
- 起訖日限時，過期自動失效；理由文字會顯示給客戶
- LIFF 下單頁：顯示 🔥 理由橫幅 + 每瓶原價刪除線→折後價 + 「氣瓶折扣 −$X」列
- 新增共用 `src/lib/tank-promo.ts`（`getActiveTankPromo`）；後端 `/api/bookings/daily` + `/api/me` 共用
- SiteConfig 新增 `tank_promo_enabled/discount/reason/start/end`（已加入 migrate-safety）

## 20260607_391 — 2026-06-07 (金額頁改版：裝備橫式表 + 抵用金統一表格)

### 系統設定 → 💰 金額：版面重整
- **🤿 裝備租借**：改橫式表（裝備項目一行、設定價格一行）
- **🎁 抵用金/優惠**：改統一表格（項目 / 抵用金 / 有效天數 / 觸發條件 / 說明），一次看完 7 種抵用金來源（註冊/生日/首單/VIP升等/VIP滿級/Admin手動/退款）；原本分散的「抵用金有效天數」整併進每列
- 註冊禮金列直接放「一鍵補發舊會員」鈕；生日列標註「填一次不可改、補發至抵用金管理」
- **移除**教練預設費用、天氣取消風速門檻 input（值仍保留於存檔，不會被清掉）；風速門檻未來移到「天氣」分頁
- tab **「📨 發送」改名「🌤 天氣」**
- 裝備標籤「整套(七折)」→「整套優惠」（後台 + LIFF 同步）

### 📣 場次 Dump 自動優惠開頭（新）
- 系統設定 → 💰金額 →「📣 場次 Dump 優惠開頭」：**開關 + 可編輯文案 + 套用預設**
- 開啟後，場次管理「Dump 一週場次」貼 LINE 的文字最上方自動帶優惠 + 分隔線（不用每次手貼）
- SiteConfig 新增 `dump_promo_enabled`、`dump_promo_text`（已加入 migrate-safety）

## 20260607_390 — 2026-06-07 (一鍵補發優惠：註冊禮金 + 生日禮金 預覽再確認)

### 抵用金管理 → 「🎁 一鍵補發」按鈕（先預覽、再發送）
- 點按鈕跳出對話框，先跑 **dry-run** 顯示「預計補發人數 + 每人金額 + 總額」，**確認後才真的入帳**，可取消
- **註冊禮金**（一生一次）：已驗證 Email、從未領過 `signup_reward` 者
- **生日禮金**（一年一次）：生日月**已到/當月**、今年未領者；**未來月份生日不在此補**（交給每月 1 號 cron 自動發），與 cron 共用 `birthday_credit_year` 去重
- 金額未設（=0）時顯示「未設金額」提示，不會誤發

### 後端
- 新增 `/api/admin/backfill-birthday-credits`（GET=dry-run、POST=執行；admin/boss）
- 沿用既有 `/api/admin/backfill-signup-reward`（已內建 dry-run）

## 20260607_389 — 2026-06-07 (天氣回報設定重新編排)

### 系統設定 → 自動發送：天氣回報改成 5 步驟版面
- **① 是否啟用**、**② 發送時段**、**③ 發送給誰與路徑**、**④ 發送內容**、**⑤ API 測試** 清楚分段
- **時段全部用台灣時間設定**,系統自動換算 UTC cron 顯示(解決 21:00/05:00 時區矛盾);可新增/刪除時段(預設 2 個:🌙22:00 前一晚、🌅05:00 出發前)
- **發送內容可勾選**:風速 / 氣溫 / 今明場次摘要 / 浪高(浪高暫無資料源,顯示提示)
- **路徑明確標示** `/api/cron/daily-weather-report`;⑤ 自動列出各時段 cron + curl 指令
- 「天氣回報」與「明日訂單預報」兩張卡視覺分開,不再混淆
- 修正明日訂單預報文案:台灣 21:00 = Cronicle UTC `0 13 * * *`(原本誤寫 `0 21 * * *`)

### 後端
- `daily-weather-report` lib 依 `weatherReportContent` 開關決定訊息帶哪些欄位
- SiteConfig 新增 `weather_report_slots`、`weather_report_content`(已加入 `migrate-safety.js`)
- `docs/CRON_SETUP.md` 補上 daily-weather-report / daily-briefing 段落 + 時區說明

## 20260607_388 — 2026-06-07 (會員優惠 ABCD：註冊禮金 / 生日 / VIP 折扣 / 生日鎖定)

### A. 系統設定可調欄位
- **系統設定 → 金額**：新增「註冊禮金金額」「註冊禮金有效天數」
- **系統設定 → VIP**：新增「VIP 滿級回饋（每 N 潛回饋 M 元）」；每個 VIP 等級可設「裝備租借折扣 %」
- SiteConfig 新增欄位：`signup_reward_amount`、`signup_reward_expiry_days`、`vip_overflow_dives`、`vip_overflow_credit`（均已加入 `migrate-safety.js`）；裝備折扣 % 存於 `vip_tiers` JSON 的 `gearDiscountPct`

### B. 發放邏輯
- **註冊禮金**：改為「Email 驗證通過後才發」（`src/lib/signup-reward.ts` + verify-email route），去重靠 `CreditTx.reason=signup_reward`
- **一次性補發**：新增 `/api/admin/backfill-signup-reward`（GET 試算 / POST 執行）+ 系統設定按鈕，補發給「已驗證但未領過」的現有會員
- **生日禮金**：cron 改為「每月 1 日發當月生日者」（month-match + `birthday_credit_year` 確保一年一次）；註冊當月生日者於 Email 驗證時即時補發
- **VIP 滿級回饋**：到場累計潛數時，VIP 滿級後每超過 N 潛回饋 M 元（`attendance` route，里程碑去重）

### C. 結帳裝備折扣
- 日潛下單時，裝備租借依會員 VIP 等級自動折扣（只折裝備、不折潛水費）；server 端 `bookings/daily` 權威計算，LIFF 下單頁即時顯示折後價與折扣標示
- `/api/me` 回傳 `gearDiscountPct` 供前端顯示

### D. 生日鎖定
- 客戶填一次生日後不可自行修改（`/api/me` PATCH 擋變更 + LIFF profile 欄位鎖定）；僅 admin/boss 可於後台修改

### 排程
- `docs/CRON_SETUP.md`：新增 `/api/cron/birthday-credits` 區段，cron 由每日改為 **每月 1 號** `0 0 1 * *`

## 20260528_95 — 2026-05-28 (場次載入修復 + migrate-safety 補全)

### Bug Fix
- **場次載入失敗**：`GET /api/admin/trips` 因 `diving_trips` 缺少 `meeting_point`、`weather_note`、`cancel_reason` 欄位（`prisma db push` 靜默失敗時未補），導致 Prisma 查詢拋錯
- **migrate-safety.js** 新增所有可能缺少的欄位 patch：
  - `diving_trips.meeting_point TEXT`
  - `diving_trips.weather_note TEXT`
  - `diving_trips.cancel_reason "CancelReason"` (含 enum type 自動建立)
  - `site_config.gear_rental_prices JSONB`
  - `site_config.default_trip_pricing JSONB`
  - `site_config.default_coach_fee INTEGER`
  - `site_config.weather_wind_threshold INTEGER`
  - `site_config.birthday_credit_amount INTEGER`
  - `site_config.vip_upgrade_credits JSONB`
- **POST /api/admin/trips** schema 新增：`pricing.otherFee`、`pricing.otherFeeNote`、`status` 欄位（原本被 Zod strip 掉）
- **PATCH /api/admin/trips/[id]** schema 同步加入 `pricing.otherFee`、`pricing.otherFeeNote`

### 變更管理密碼
- `ADMIN_WEB_SECRET` 環境變數：在 Zeabur → 專案 → 服務 → Variables 更新，重新部署生效

---

## 20260528_94 — 2026-05-28 (白牌化重構 + 新客戶初始設定文件)

### 架構
全面移除程式碼中的硬碼品牌字串，改由環境變數控制，讓同一套程式碼可直接部署給不同廠商：

| 新增環境變數 | 說明 |
|---|---|
| `NEXT_PUBLIC_LINE_OA_ID` | LINE OA 帳號 ID（@xxxxxx），顯示於首頁 |
| `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` | 加好友連結，首頁按鈕 |
| `NEXT_PUBLIC_APP_TAGLINE` | 首頁標語（原硬碼「安全．專業．陪你看見海」）|
| `APP_DEFAULT_REGION` | 通知訊息 fallback 地區名（原硬碼「東北角」）|

### 修改的檔案（10 個）
- `AdminShell.tsx`：側欄品牌名稱 → `NEXT_PUBLIC_APP_NAME`
- `admin/layout.tsx`：頁面 title → `NEXT_PUBLIC_APP_NAME`
- `admin/login/page.tsx`：登入頁標題 → `NEXT_PUBLIC_APP_NAME`
- `app/layout.tsx`：根 metadata title → `NEXT_PUBLIC_APP_NAME`
- `app/page.tsx`：首頁全部硬碼字串（APP 名稱、LINE ID、LIFF URL、標語）→ env vars；LINE 好友按鈕 + OA ID 顯示改為 conditional
- `api/webhook/route.ts`：歡迎訊息 alt text + fallback URL → env vars
- `api/bookings/daily/route.ts`：黑名單錯誤訊息 → `NEXT_PUBLIC_APP_NAME`
- `api/cron/reminders/route.ts`：地區名 fallback → `APP_DEFAULT_REGION`
- `api/cron/weather-check/route.ts`：地區名 fallback（x2）→ `APP_DEFAULT_REGION`
- `.env.example`：補充 4 個新環境變數說明

### 新增文件
- `new-customer-initial-setting.md`：新客戶架設完整指南（繁中），含環境變數說明表、部署步驟、初始管理員設定、LINE 後台設定、確認清單

## 20260528_93 — 2026-05-28 (日潛場次 dialog 修正：API 載入 / 費用 / 教練)

### 修正
- **資料載入**：`Promise.all` → `Promise.allSettled`，trips API 失敗時仍能獨立載入潛點/教練/設定
- **教練選單**：改回全寬單欄，選定後在下方顯示教練資訊一行（避免下拉選單與右側說明框衝突）
- **費用設定**：移除「基本費」；「氣瓶費（每瓶）」+ 「其他費用金額 + 說明」改為同一行
- **夜潛費**：僅在夜潛場次時顯示，位置移到費用行下方
- **場次編號**：新增對話框標題顯示 `建立後自動產生 D{YYYYMMDD}-XX 編號`；編輯時顯示現有 code

## 20260528_92 — 2026-05-28 (後台設定：清空資料危險操作區)

### 新功能
- `/admin/settings` 新增「⚠️ 危險操作」區塊
- 「清空所有訂單 / 日潛場次 / 潛水團」按鈕：點擊後彈窗要求輸入「確認刪除」，確認後呼叫 API 刪除
- 會員資料不受影響
- 刪除後顯示各類型刪除筆數
- `POST /api/admin/reset-data`：需 admin/boss 角色 + `{ confirm: "DELETE ALL DATA" }` body
- 操作記錄到 audit log（data.reset）

## 20260528_91 — 2026-05-28 (會員管理 + 日潛場次 UI 調整)

### 會員管理 (users)
- "LINE ID" 欄位移除，與 Email 合併為同一欄：Email（上）+ LINE ID（下，灰字）
- 欄位名稱：「消費王子潛水次數」→「潛水次數」（表頭、編輯框、潛水紀錄彈窗標題）
- colSpan: 13 → 12

### 日潛場次 (trips)
- 潛點載入：區分「載入中」/ 「無潛點資料（請先至潛點管理新增）」/ 實際清單
- 費用名稱：「加支費（每瓶）」→「氣瓶費（每瓶）」
- 基本費預設值：1200 → 0
- 教練選單改為左右分欄：左側選教練下拉、右側顯示選定教練的證照 / 專長 / 費用 / 備註
- 集合地點：改為堆疊排版，placeholder 改為 Google Map URL 說明
- 備註 → 日潛水備註

## 20260528_90 — 2026-05-28 (DB 欄位安全補丁 — 修復 LIFF 401 / users.code 缺欄)

### 緊急修復
- **根本原因**：`prisma db push` 在生產容器啟動時靜默失敗（`|| echo WARNING`），導致 `users.code` 等欄位從未被加入資料庫，而 Prisma Client 卻預期這些欄位存在 → 所有 `prisma.user.*` 查詢拋出 `column does not exist` → LIFF 401 / 資料看似消失
- **資料安全**：**資料完全未遺失**，DB 中所有 users / bookings / trips / tours 記錄均完好
- 新增 `scripts/migrate-safety.js`：使用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`（冪等）直接補上關鍵欄位，不依賴 `prisma db push` 是否成功
- `docker-entrypoint.sh` 更新啟動順序：`migrate-safety` → `db push` → `backfill-codes` → `node server.js`
- 涵蓋欄位：`users.code VARCHAR(12)`、`diving_trips/tour_packages/bookings.code VARCHAR(12)`

## 20260528_89 — 2026-05-28 (全站時區統一 Asia/Taipei GMT+8)

### 修正
- 新增共用工具 `src/lib/utils.ts`：`toTaipeiDateString`、`toTaipeiDateTimeString`、`toTaipeiISODate`、`taipeiToday`、`weekdayTW`，全部明確指定 `timeZone: "Asia/Taipei"`
- `admin/trips`：場次新增對話框預設日期改用 `taipeiToday()`，不再以 UTC `toISOString()` 推算（夜間可能差 1 天）
- `admin/bookings`：訂單建立日顯示改用 `toTaipeiDateString()`；`weekdayTW()` 改用共用版本（加 `+08:00` offset 解析日期字串，避免 UTC 午夜誤判星期）
- `admin/users`：最後活躍、禮金交易日期改用 `toTaipeiDateString()`
- `admin/audit-logs`：`formatDate` 改用 `toTaipeiDateTimeString()`，操作時間顯示正確的台北時間（原為 UTC，差 8 小時）

## 20260528_88 — 2026-05-28 (日潛場次對話框排版修正 + 24 小時制集合時間)

### 修正
- `/admin/trips` 新增／編輯對話框：所有欄位改為標籤在上、輸入框在下的堆疊排版（原為同行 inline）
- 集合時間：從 `<input type="time">` 改為兩個 `<select>`（小時 05–22、分鐘 00/15/30/45），強制 24 小時制顯示，避免 OS 地區設定造成顯示 "上午 08:00"
- 氣瓶數 + 可參加人數：改為 `grid-cols-2` 並排，各自標籤在上
- 費用設定：改為 `space-y-2` 單欄，每項費用各佔一行

## 20260528_85 — 2026-05-28 (補發所有舊資料編號)

### 功能
- `GET /api/admin/backfill-codes`：查詢尚未補發的筆數（各類型分別顯示）
- `POST /api/admin/backfill-codes`：對所有缺少 code 的記錄補發新格式編號，使用各自 `createdAt` 日期
- `/admin/settings` 新增「🔢 補發編號」區塊：查詢 → 預覽缺少筆數 → 一鍵補發 → 顯示結果

### 邏輯
- `code-gen.ts` 新增 `genMemberCodeForDate / genTripCodeForDate / genTourCodeForDate / genBookingCodeForDate`（接受 Date 參數，使用指定日期而非今天）
- 逐筆補發，失敗的記入 errors 欄位，不中斷整批

## 20260528_84 — 2026-05-28 (編號格式統一改為 {P}{YYYYMMDD}-{XX})

### 編號格式
- 新格式：`{Prefix}{YYYYMMDD}-{XX}`，XX 為 base-36 2位大寫英數（0-9 A-Z），共 1296 種/日
- 會員：`M20260528-3A`　日潛：`D20260528-ZZ`　潛水團：`T20260528-01`　訂單：`O20260528-B7`
- 舊格式（`O-XXXXXX` 6位亂數）廢棄，現有紀錄保留舊碼（nullable）

### Schema
- `User` 新增 `code String? @unique @map("code") @db.VarChar(12)` 會員編號
- `DivingTrip / TourPackage / Booking` 的 `code` 欄位 `VarChar(8)` → `VarChar(12)`

### 代碼產生
- `src/lib/code-gen.ts` 全面改寫：新增 `genMemberCode()`；日期用 UTC+8 台灣時間；retry 50 次
- 新用戶首次加入（LINE follow / LIFF auth / dev login / bootstrap）自動產生會員編號

### 前台
- 會員管理表格新增「會員編號」欄位（phosphor 綠色 monospace 字型）

## 20260528_83 — 2026-05-28 (會員管理：禮金紀錄 / 潛水紀錄 / 傳送訊息 popup)

### 功能
- **禮金紀錄 popup**：點選會員的「禮金」欄位 → 展開該會員全部 CreditTx 歷程（類型、金額、餘額、備註）
- **潛水紀錄 popup**：點選「消費王子潛水次數」欄位 → 展開該會員全部訂單（日期/行程、類型、人次、費用、狀態）
- **欄位更名**：「海王子次數」→「消費王子潛水次數」；新增「消費總計」欄位（可排序）
- **傳送訊息 popup**：點選 Email 地址 → 彈窗選擇 LINE / Email / 兩者，填寫內容後發送
- 消費王子潛水次數 dialog 頂端顯示訂單數、總人次、已付款統計

### API
- `GET /api/admin/bookings` 新增 `?userId=xxx` 過濾，供潛水紀錄 popup 使用（最多 500 筆）
- 新增 `POST /api/admin/notify`：向單一會員推送 LINE 推播 或 Email（admin/boss 限定）

## 20260528_82 — 2026-05-28 (訂單三層備註：客戶 / 網站 / 管理)

### Schema
- `Booking` 新增 `siteNotes`（網站備註，客戶可見）
- `Booking` 新增 `adminNotes`（管理備註，僅 admin/boss 可見）
- 原 `notes` 欄位為客戶預約時填寫的備註（唯讀）

### API 權限
- `GET /api/admin/bookings` + `by-trip`：非 admin/boss 不回傳 `adminNotes`
- `PATCH /api/admin/bookings/[id]`：非 admin/boss 無法寫入 `adminNotes`

### 訂單詳情對話框
- 新增「備註」區塊（三格）：
  - **客戶備註**：唯讀，顯示客戶預約時填寫
  - **網站備註**：可編輯，顯示給客戶看（適合填注意事項）
  - **管理備註**：可編輯，紅框標示，僅 admin/boss 可見與編輯

---

## 20260528_81 — 2026-05-28 (唯一編號：訂單 O-、場次 D-、潛水團 T-)

### Schema 新增欄位
- `Booking.code`：`O-XXXXXX`（6位大寫英數，唯一）
- `DivingTrip.code`：`D-XXXXXX`（6位大寫英數，唯一）
- `TourPackage.code`：`T-XXXXXX`（6位大寫英數，唯一）
- 欄位為 nullable（舊有資料不受影響）；新建立的紀錄自動產生唯一編號

### API 更新
- `POST /api/admin/trips`、`/api/admin/tours`、`/api/bookings/daily`、`/api/bookings/tour` 建立時自動呼叫 `code-gen.ts` 產生唯一碼
- `GET /api/admin/bookings/by-trip` 成員列表加入 `code` 欄位

### 後台 UI
- 日潛場次列表：新增「編號」欄（D-XXXXXX，磷光綠字體）
- 潛水團列表：新增「編號」欄（T-XXXXXX）
- 訂單管理（依場次）展開成員：新增「訂單編號」欄（O-XXXXXX）
- 訂單管理（全部訂單）：新增「訂單編號」欄
- 訂單詳情對話框：右上角顯示訂單編號

---

## 20260528_80 — 2026-05-28 (新增/編輯場次對話框 UI 重整)

### 新增/編輯日潛水場次對話框
- 標題改為「新增日潛水場次」/「編輯日潛水場次」，圖示移到最前
- 移除水下推進器 checkbox 及推進器費欄位
- 場次狀態移到頂部（日期下方），label 左 + pills 右 inline 排列
- 教練改為下拉選單（inline label + select）
- 氣瓶數、可參加人數改為 inline label-input 排列
- 「容量」→「可參加人數」（0=無上限）
- 所有費用輸入改為文字模式（無 +/- 微調箭頭）

---

## 20260528_79 — 2026-05-28 (日潛場次：日/夜識別色 + 地點格式)

### 日潛場次列表
- 時段欄位前加 ☀️ 太陽（日潛）或 🌙 月亮（夜潛）圖示
- 夜潛列整行改為藍色系底色（深於日潛），視覺一目了然
- 地點格式：「鶯歌石 ×2」→「鶯歌石 / 2支」

---

## 20260528_78 — 2026-05-28 (訂單管理：依場次展開成員可點擊編輯)

### 訂單管理 → 依場次
- 展開後的參加成員列表改為藍色系底色（與上層場次列明顯區隔）
- 成員 header 加深色藍系背景，加入「訂單狀態」欄位
- 每筆成員訂單可點擊，跳出「訂單詳情 / 編輯」視窗
- 視窗內可編輯人數、金額、付款方式、付款狀態、訂單狀態，並可退款

---

## 20260527_77 — 2026-05-27 (全後台改淺色系 + 新增場次對話框升級)

### 後台全頁改淺色系（7 個頁面）
- 教練管理、潛點管理、VIP 設定、群發通知、報表、系統設定、操作紀錄
- 移除所有深海色背景常數（`cardStyle`/`subStyle`/`inputCls` 等）
- 表格：`overflow-hidden rounded-xl border`，thead `var(--muted)`，tbody 白/灰交替
- Dialog 保留深色主題

### 新增/編輯場次對話框
- 日期預設今天
- 「出發時間」→「集合時間」；集合時間 ≥ 16:00 自動設為夜潛，標題顯示 🌙/☀️
- 移除手動夜潛 checkbox，改為時間自動判斷
- 潛點改為單選（點選同一顆取消）
- 費用欄位：夜潛費只在夜潛時顯示，推進器費只在勾選推進器時顯示
- 新增「其他費用」欄位（金額 + 說明備註）
- 預估收費計算加入其他費用

---

## 20260527_76 — 2026-05-27 (訂單/場次/潛水團 UI 大改)

### 訂單管理
- 依場次：新增「即將/已過期/全部」篩選，改為表格顯示（日期+星期幾同列）
- 全部訂單：每筆 booking 單行顯示（客戶名+電話同列、場次+星期同列）
- 全部訂單：新增場次 dropdown 篩選

### 日潛場次
- 地點欄位後顯示氣瓶數（×N）
- 「容量/已報名」→「已報名/可接受」，順序對調
- 「基本費用」→「預估收費」，顯示 已報名人數 × (基本+加支+夜潛+推進器) 合計
- 編輯對話框新增狀態選擇（開放/取消/結束）

### 潛水團
- 改為淺色系表格風格（與日潛場次一致）
- 「容額/已訂」→「已報名/可接受」，順序對調

---

## 20260527_75 — 2026-05-27 (品牌名稱更新)

- 後台側欄、首頁 header：「海王子」→「海王子潛水團」

---

## 20260527_74 — 2026-05-27 (修復 TypeScript 建構錯誤 + 換品牌 Logo)

### 🔧 修復 TypeScript 建構錯誤（v66-v73 全部 build fail 原因）

| 檔案 | 錯誤 | 修法 |
|---|---|---|
| `liff/my/page.tsx` | `EditBookingDialog` 引用 parent scope `gearOptions` | 改為 prop 傳入 |
| `lib/audit.ts` | `metadata: Record<string, unknown>` 與 Prisma JSON 型別不符 | 明確 cast `as Prisma.InputJsonValue` |
| `admin/coaches/page.tsx` | `.catch(() => ({}))` 型別推導過窄 | cast `as { defaultCoachFee?: number }` |
| `admin/trips/page.tsx` | 同上 | cast `as { defaultTripPricing?: Partial<Pricing> }` |

### 🖼 品牌 Logo 更換

- `public/logo.png` — 新增潛水員插畫圖片
- `Logo.tsx` — 改用 `next/image` 顯示 `/logo.png`（圓形裁切）
- `AdminShell.tsx` — 側欄左上角從 🤿 emoji 改為品牌 logo 圖片

---

## 20260527_73 — 2026-05-27 (後台側欄顯示登入帳號資訊)

- 登入成功後將使用者資訊（姓名、角色）存入 `localStorage`
- `AdminShell` 側欄 Logo 下方新增登入用戶資訊卡（頭像縮寫、真實姓名/顯示名、角色）
- 登入後跳轉改為 `/admin`（Dashboard），不再跳 `/admin/bookings`
- `admin-web-auth.ts` 新增 `AdminWebUser` interface + `getAdminUser()` / `setAdminUser()` + `useAdminAuth` 回傳 `adminUser`

---

## 20260527_72 — 2026-05-27 (版本號移到側欄左上角 Logo 旁)

- 版本號從底部移至左上角「管理後台」文字右側（更顯眼）

---

## 20260527_71 — 2026-05-27 (後台側欄顯示版本號)

- `AdminShell` 側欄底部新增版本號顯示（登出按鈕上方，低調灰色 monospace 字型）
- 登入後台後每個頁面側欄都能看到目前部署版本

---

## 20260527_70 — 2026-05-27 (操作紀錄系統 — 全後台行為追蹤)

### ✨ 新功能：操作紀錄（Audit Log）

所有後台操作皆會記錄，包括：

| 類別 | 記錄項目 |
|---|---|
| 登入 | 後台登入、密碼設定/重設 |
| 訂單 | 修改、取消、刪除、退費 |
| 禮金 | 發放、扣除 |
| 場次 | 建立、修改、取消、刪除 |
| 潛水團 | 建立、修改、刪除 |
| 會員 | 修改、刪除 |
| 教練 | 新增、修改、刪除 |
| 潛點 | 新增、修改、刪除 |
| 設定 | 系統設定修改、VIP 設定修改/還原 |
| 群發 | 發送群發通知 |

**新增**
- `model AuditLog` — DB 資料表（additive，安全）
- `src/lib/audit.ts` — `logAudit()` fire-and-forget 工具函式
- `GET /api/admin/audit-logs` — 分頁查詢 + 支援 action/actorId 過濾
- `/admin/audit-logs` — 操作紀錄頁面，支援分類篩選、點擊展開 metadata、分頁

---

## 20260527_69 — 2026-05-27 (動態化 hardcode 金額 — 裝備費率/場次定價/天氣門檻)

### ✨ 新功能

**LIFF 前台裝備租借費率動態化**
- `liff/dive/trip/[tripId]/page.tsx` — 預約場次時的裝備租借選項，從 `/api/site-config` 讀取最新費率（有設定才覆蓋，未設定 fallback 到預設值）
- `liff/my/page.tsx` — 修改預約 / 查看我的預約頁同步動態費率

**網頁後台場次預設定價動態化**
- `admin/trips/page.tsx` — 新增場次時，`baseTrip / extraTank / nightDive / scooterRental` 的預設值從 SiteConfig `defaultTripPricing` 讀取（在 `/admin/settings` 可設定）

**天氣取消風速門檻動態化**
- `api/cron/weather-check/route.ts` — 優先讀取 SiteConfig `weatherWindThreshold`，其次讀 `WEATHER_WIND_THRESHOLD` env var，最後 fallback 10 m/s

---

## 20260527_68 — 2026-05-27 (網頁後台 — VIP設定 + 群發通知 + 報表頁)

### ✨ 新頁面

- **`/admin/vip-tiers`** — VIP 設定：可調整各等級門檻（次數/消費）、名稱、Emoji、福利清單，儲存後自動重算全員等級
- **`/admin/broadcast`** — 群發通知：選對象（全部/客戶/教練/管理員）+ 管道（LINE/Email/兩者）+ 模板，送前有警告提示
- **`/admin/reports`** — 報表：統計卡片（收入/會員/場次/訂單）+ 一鍵匯出全訂單 CSV

---

## 20260527_67 — 2026-05-27 (網頁後台 — Dashboard + 潛水團 + 教練 + 潛點管理頁)

### ✨ 新頁面

- **`/admin`** — 總覽 Dashboard：統計卡片（收入/會員/場次/訂單）+ 待審核提醒 + 10 個功能快速入口
- **`/admin/tours`** — 潛水團管理：新增/編輯/取消/刪除，含出發日、定價、訂金、容額設定
- **`/admin/coaches`** — 教練管理：新增/編輯/啟停用/刪除，feePerDive 預設值從 SiteConfig 讀取
- **`/admin/sites`** — 潛點管理：新增/編輯/刪除，含區域、難度、特色、YouTube 連結

---

## 20260527_66 — 2026-05-27 (網頁後台 — Schema 擴充 + 系統設定頁 + 側欄全功能)

### ✨ 新功能

**SiteConfig 新增 4 個可配置欄位**
- `gearRentalPrices` — 裝備租借 7 項費率（BCD/調節器/防寒衣/蛙鞋/面鏡/電腦錶/整套）
- `defaultTripPricing` — 場次預設定價（潛水費/額外瓶/夜潛/水上摩托車）
- `defaultCoachFee` — 新增教練時的預設費用/潛
- `weatherWindThreshold` — 天氣自動取消的風速門檻（m/s）

**後台側欄補齊 11 個項目**（原本只有 3 個）
- 新增：總覽、潛水團、教練管理、潛點管理、VIP設定、群發通知、報表、系統設定

**新頁面：`/admin/settings` — 系統設定**
- A 區：首頁文字設定（Hero / Footer / Splash / 天氣自動取消）
- B 區：金額設定（裝備租借費率 / 場次預設定價 / 教練費 / 生日禮金 / VIP 升等獎金 / 風速門檻）
- C 區：系統工具（版本號 / Email 測試 / 健康檢查連結）

**公開 API 也回傳** `gearRentalPrices` + `defaultTripPricing`（供 LIFF 前台讀取）

---

## 20260527_65 — 2026-05-27 (登入頁顯示版本號)

- 網頁管理後台登入頁「管理後台」旁顯示目前版本（`v20260527_65`）

---

## 20260527_64 — 2026-05-27 (網頁後台個人密碼)

### ✨ 網頁管理後台 — 個人密碼機制

每位 admin/boss 各自設定自己的個人密碼，三步驟登入：

**登入流程**
1. 輸入共用管理密碼（`ADMIN_WEB_SECRET`，確認是正確的系統）
2. 選擇自己的帳號（admin 或 boss）
3. 輸入個人密碼（首次登入 → 設定新密碼；後續 → 直接輸入）

**忘記密碼**
在步驟 3 點「忘記密碼？」→ 用 `ADMIN_WEB_SECRET` 重設（不需要舊密碼）

**技術細節**
- `prisma/schema.prisma` — `User` 新增 `webPasswordHash String?`（additive，自動 migrate）
- `src/lib/admin-web-crypto.ts` — Node.js 內建 `crypto.scrypt` 雜湊（salt:hash hex 格式）
- `GET /api/admin-web/auth` — 回傳每個 user 是否已設密碼（`hasPassword: bool`）
- `POST /api/admin-web/auth` — 新增驗個人密碼；未設密碼回 `NO_PASSWORD` code
- `POST /api/admin-web/set-password` — 首次設定或忘記密碼重設（需 `ADMIN_WEB_SECRET`）

---

## 20260527_63 — 2026-05-27 (boss 角色全限 superuser)

### 🔐 權限修正

**boss 現在與 admin 同等級 — 全後台無限制存取**

- `requireRole()` 新增 boss superuser 旁路：`effectiveRoles.includes("boss")` 同樣直接通過，不再受 `allowed` 清單限制
- 一次修正 30+ 個 `/api/admin/*` endpoint，boss 不需要逐一被加入 allowed 陣列
- 受影響端點：trips CRUD / tours CRUD / users CRUD / bookings / site-config / vip-tiers / broadcast / csv / coaches / sites 等全部 admin 路由

**角色職責完整說明（修正後）**

| 角色 | 定位 | 特殊旁路 |
|---|---|---|
| admin | 系統管理員 | ✅ superuser（所有路由） |
| boss | 老闆/老闆娘 | ✅ superuser（所有路由）← 新增 |
| coach | 教練 | 只能訪問 coach 相關 + 讀取場次/訂單 |
| customer | 一般客戶 | 只能訪問自己的資料 |

---

## 20260527_62 — 2026-05-27 (網頁管理後台 /admin)

### ✨ 新功能：獨立網頁管理後台

不需要 LINE app，直接在電腦/平板瀏覽器開啟 `/admin` 即可管理系統。

**登入方式**
- 開啟 `https://haiwangzi.xyz/admin`（自動跳 `/admin/login`）
- 輸入 `ADMIN_WEB_SECRET`（Zeabur env var 需新增）
- 選擇身分（系統自動列出所有 admin/boss 帳號）
- JWT（7天有效）存 localStorage，自動帶入 Bearer token

**頁面（左側欄導覽）**
- `/admin/bookings` — 訂單管理（依場次分組展開 + 全部訂單表格、退款操作）
- `/admin/users` — 會員管理（寬表格、點標頭排序、搜尋、編輯 dialog）
- `/admin/trips` — 場次管理（開團/編輯/刪除）

**技術實作**
- `src/lib/auth.ts` — `authFromRequest` 新增 HS256 JWT 驗證路徑（issuer: "haiwangzi-admin-web"），優先於 LINE JWKS，不影響現有 LIFF 登入
- `src/app/api/admin-web/auth/route.ts` — GET（列出 admin/boss 帳號）+ POST（發放 JWT）
- `src/lib/admin-web-auth.ts` — 前端 helper: `adminFetch`, `useAdminAuth`, token 存取
- `src/components/admin-web/AdminShell.tsx` — 左側欄 shell（桌面固定 + 手機 hamburger）

**Zeabur 需新增 env**
- `ADMIN_WEB_SECRET` — 任意長字串，作為管理後台的共用登入密碼（建議 16 字以上）

---

## 20260527_61 — 2026-05-27 (修正老闆角色無法儲存)

### 🐛 Bug Fix

**老闆角色 (boss) 儲存失敗 — 兩處 priority array 遺漏 "boss"**

- **`/api/admin/users` POST**：`priority = ["admin", "coach", "customer"]` 缺少 `"boss"`，導致 `roles=["boss"]` 時 primary `role` 欄位被寫成 `"customer"`，Admin 改完存檔後顯示角色仍是 customer
- **`/liff/admin/users/page.tsx`**：role toggle click handler 同一個陣列，`editing.role` 計算也有相同錯誤
- 兩處皆改為 `["admin", "boss", "coach", "customer"]`（優先順序：admin > boss > coach > customer）

---

## 20260517_60 — 2026-05-17 (預約折抵禮金 + 退費轉禮金)

### 🎯 兩個用例都接上了

**用例 A：預約時用禮金折抵（客戶端）**
- `/liff/dive/trip/[id]` 和 `/liff/tour/[id]` — 表單下方多了「🎁 使用禮金折抵」卡（餘額 > 0 才顯示）
- 客戶可輸入金額或按「全部用」一鍵填滿
- 後端在 booking POST 時：
  - 驗證 `creditUsed ≤ user.creditBalance` 且 `≤ totalAmount`
  - 寫入 `Booking.creditUsed` + `paidAmount = creditUsed`
  - 呼叫 `grantCredit(-creditUsed, reason="used", refId=bookingId)` 扣餘額 + 寫 CreditTx
  - 折抵後若 ≥ totalAmount → paymentStatus=fully_paid；≥ depositAmount → deposit_paid + status=confirmed

**用例 B：退費可轉禮金（boss/admin 端）**
- `/liff/admin/bookings` 編輯 dialog → 訂單若有 `paidAmount>0` 且未退款 → 新增「💸 退款處理」摺疊區塊
- 兩個按鈕：「🎁 轉禮金」（立即入帳）、「💵 退現金」（線下匯款）
- 後端 `POST /api/admin/bookings/[id]/refund`：
  - 設 `paymentStatus=refunded`, `refundAmount`, `refundedAt`, `refundMethod`
  - method=credit → 呼叫 `grantCredit(+amount, reason="refund")` 入禮金
  - method=cash → 只標記，老闆/admin 須線下退款
  - 退款上限：已付金額

### Schema 變更（純 additive）
- `Booking.creditUsed Int @default(0)` — 預約時用了多少禮金
- `Booking.refundMethod String?` — cash / credit
- Zeabur 重啟自動 `prisma db push`

### 權限
- 預約折抵：任何登入 user
- 退款處理：boss + admin

## 20260516_59 — 2026-05-16 (Demo 環境支援)

### 三模式架構

| 環境 | URL | DB | banner |
|---|---|---|---|
| Local Dev | localhost:3000 | docker pg | 黃色「💻 LOCAL」 |
| Demo | haiwangzi-demo.zeabur.app | demo pg | 紫色「🎬 DEMO」 |
| Production | haiwangzi.xyz | prod pg | 無 |

### 新增

- **`prisma/seed-demo.ts`** — Demo 環境完整 seed
  - 6 個 dev personas（生日、證照、角色完整）
  - 6 個潛點 + 2 個教練（綁定 coach_1 / coach_2 user）
  - 未來 21 天潛水場次 + 2 個潛水團
  - customer_2 歷史訂單（completed / confirmed / tour deposit_paid 各一）
  - customer_2 預存 NT$ 300 禮金（升等 + 生日歷史）
  - admin 預存 NT$ 5000 禮金
  - customer_1 生日設為今天（demo 生日禮金可立刻看到效果）
  - 跑法：`npm run db:seed:demo`

- **`/api/cron/reset-demo`** — Demo 每日 reset cron
  - 清掉：bookings / payment proofs / credit txs / reminder logs / trip photos / [demo] trips & tours
  - 重設：dev personas 的 logCount / vipLevel / creditBalance / companions
  - 重灌：sites / coaches / trips / 1 tour / customer_2 + admin 預設禮金
  - 保留：SiteConfig + MessageTemplate
  - 安全閘：`RESET_DEMO_DAILY=1` 才執行；認證 `Bearer $CRON_SECRET`

- **`NEXT_PUBLIC_APP_LABEL`** banner — Header 環境徽章
  - LOCAL（黃 💻）/ DEMO（紫 🎬）/ STAGING（橘 🚧）/ DEV（黃 🧪 預設）
  - prod 不設 → 無 banner

### Zeabur 設定（user 要做）

新增 service `haiwangzi-demo`：
- repo: 同 `neowu621/haiwangzi-bot` master
- 新增獨立 Postgres add-on
- env 設：
  ```
  NEXT_PUBLIC_DEV_MODE=1
  DEV_MODE_ENABLED=1
  NEXT_PUBLIC_APP_LABEL=DEMO
  RESET_DEMO_DAILY=1
  CRON_SECRET=<生一個獨立的>
  JWT_SECRET=<生一個獨立的>
  LINE_LIFF_ID=<同 prod>
  LINE_CHANNEL_ACCESS_TOKEN=<同 prod 或空白>
  LINE_CHANNEL_SECRET=<同 prod 或空白>
  R2_* + SMTP_* + GMAIL_USER + GMAIL_APP_PASSWORD（可選，要寄信/上傳才需要）
  ```

第一次部署後 SSH 進去跑：
```
npm run db:seed:demo
```

Cronicle 加新 job：
- `GET https://haiwangzi-demo.zeabur.app/api/cron/reset-demo`
- Header `Authorization: Bearer $DEMO_CRON_SECRET`
- 每日台灣 4:00 AM

## 20260516_58 — 2026-05-16 (Dev 身分切換 + 補償金/禮金系統)

### 🎭 Dev 模式（6 虛擬身分）

**新檔案**
- `src/lib/dev-personas.ts` — 6 個身分定義（小明、小華、阿凱教練、阿志教練、老闆娘、admin）
- `src/app/dev-login/page.tsx` — 切換身分頁
- `src/app/api/dev/login/route.ts` — GET 列表 / POST 建/更新 user

**啟用方式**
1. 本地：`NEXT_PUBLIC_LIFF_MOCK=1` 或 `NEXT_PUBLIC_DEV_MODE=1`（任一）
2. Zeabur prod 預覽：加 env `NEXT_PUBLIC_DEV_MODE=1` + `DEV_MODE_ENABLED=1`
3. 開站第一次進 `/liff/welcome` → 自動跳 `/dev-login` 讓你選身分
4. 上方黃色 banner 顯示目前身分，點「切換身分」隨時換

**6 個身分**
| ID | 名稱 | 角色 | 證照 |
|---|---|---|---|
| 🐠 U_dev_customer_1 | 小明 | customer | OW |
| 🐢 U_dev_customer_2 | 小華 | customer | AOW |
| 🤿 U_dev_coach_1 | 阿凱教練 | coach | Instructor |
| 🦈 U_dev_coach_2 | 阿志教練 | coach | DM |
| 👩‍💼 U_dev_boss | 老闆娘 | boss | — |
| 🛠️ U_dev_admin | 系統管理員 | admin | — |

**安全**：`/api/dev/login` 與 `?lineUserId=` query 只在 `NODE_ENV!=production` **或** `DEV_MODE_ENABLED=1` 時開啟，prod 預設關閉。

---

### 🎁 補償金 / 禮金 系統

**新 Schema**
- `User.birthday DateTime?` — 生日（年月日）
- `User.creditBalance Int @default(0)` — 禮金餘額（denormalized）
- `User.birthdayCreditYear Int?` — 已領年份（防重發）
- 新 model `CreditTx`：每筆變動的 audit trail（`amount`/`reason`/`balanceAfter`/`refType`/`refId`/`note`）
- `SiteConfig.birthdayCreditAmount Int @default(100)` — 生日禮金金額
- `SiteConfig.vipUpgradeCredits Json @default("{}")` — VIP 升等獎金 map `{"2":200, "3":500, ...}`

**新檔案**
- `src/lib/credit.ts` — `grantCredit()` helper（transaction 保證 audit + balance 一致）
- `src/app/api/me/credits/route.ts` — 查自己禮金紀錄
- `src/app/api/admin/credits/route.ts` — admin 查/調整任何 user 的禮金
- `src/app/api/cron/birthday-credits/route.ts` — 每日跑，台灣時區當天生日的人自動發放

**自動發放規則**（預設值，admin 可改）
- 生日當天：NT$ 100（每年一次，靠 `birthdayCreditYear` 防重）
- 升 LV2：NT$ 200
- 升 LV3：NT$ 500
- 升 LV4：NT$ 1000
- 升 LV5：NT$ 2000
- 跨等級升等（例：LV1→LV3）會逐階發放

**Hook 點**
- `/api/coach/payment-proofs` 核可款項 → `promoteVipIfNeeded` 偵測升等發禮金
- `/api/coach/bookings/[id]/attendance` 到場勾選 → 偵測升等發禮金

**UI**
- `/liff/profile`：
  - 新增「生日」欄位（個人資料 collapsible 內，自動儲存）
  - 新增「🎁 我的補償金 / 禮金」卡，點開看 Dialog（餘額 + 交易明細，含原因 emoji）
- `/liff/admin/users` 編輯 dialog：
  - 新增「生日」欄位
  - 新增「🎁 補償金 / 禮金 餘額」區塊，可直接「+ 發放」/「− 扣回」（原因可選填），呼叫 `/api/admin/credits`

**Cronicle 排程要加**
- `GET https://haiwangzi.xyz/api/cron/birthday-credits`
- Header: `Authorization: Bearer $HAIWANGZI_CRON_SECRET`
- 頻率：每日台灣時間早上 8:00 一次

---

### Migration 注意
Zeabur container 啟動會自動跑 `prisma db push` 同步 schema。
新欄位都有 default 值或 nullable，現有資料不會掉。

## 20260516_57 — 2026-05-16 (拆兩個潛水次數欄位)

### 背景
原本只有一個 `logCount`（使用者自填）—— 但這個數字在 VIP 升等用，使用者可以「自填 999」灌水。
所以拆成兩個欄位，VIP 等級只看可驗證的那個。

### Schema
- User 新增 `haiwangziLogCount Int @default(0)` — 在本系統 booking 完成（教練勾到場）才會 +1
- 既有 `logCount` 保留 —— 改成「使用者自填的總經驗（含其他單位累積）」

### 影響範圍
- **Attendance**（`/api/coach/bookings/[id]/attendance`）
  - 「到場」改成 `haiwangziLogCount += addLogs`，不再動 `logCount`
  - VIP 重算用 `haiwangziLogCount`
- **VIP 自動升等**（`/api/coach/payment-proofs` 的 `promoteVipIfNeeded`）
  - 收款累積消費更新時，VIP 計算也改用 `haiwangziLogCount`
- **Admin user 編輯**（`/api/admin/users`、`/liff/admin/users`）
  - PatchSchema 接受 `haiwangziLogCount`
  - 編輯 dialog 顯示兩個輸入框（左：自填總經驗 / 右：海王子累積，計等級用）
  - 列表行顯示「海王子 N 支 (自填 M)」
  - 自動重算 VIP 改看 `haiwangziLogCount`（不再看 `logCount`）
- **個人頁**（`/liff/profile`、`/api/me`）
  - `/api/me` 回傳 `haiwangziLogCount`
  - 首屏「潛水次數」改成「海王子累積」+ 副標「含他處 N 支」
  - VipTierCard 改用 `haiwangziLogCount` 計進度

### 為什麼
讓 VIP 等級只能透過「在海王子實際下水」來升等，避免自填灌水導致龍蝦變鯨鯊。

## 20260515_56 — 2026-05-15 (Phase B 教練端：到場勾選 + 學員潛伴資訊)

### `/liff/coach/today` 大改
- 每張訂單卡顯示**潛伴清單**（從 `participantDetails` 抓）：姓名 / 證照 / 關係 / 電話
- 多人預約有 `Users` icon + 人數 badge
- 新增「**✓ 到場 / ✗ 缺席**」兩個按鈕：
  - 到場 → booking status = completed + user.logCount += tankCount + **自動重算 vipLevel**
  - 缺席 → booking status = no_show + user.noShowCount += 1
- 卡片顏色依狀態：completed 螢光綠、no_show 紅+半透明
- 移除「→ 付款核對」入口（教練不碰款項，由老闆做）
- 加說明「收款核對由老闆 / admin 處理」

### 新 API
- `POST /api/coach/bookings/[id]/attendance` body `{action: "completed" | "no_show"}`
  - 權限：coach / boss / admin
  - 自動 increment logCount + 重算 vipLevel（用 DB 自訂等級設定）

### Permission
- `/api/coach/today` 開放給 boss + admin（不只 coach）— 老闆也想看當日狀況

## 20260515_55 — 2026-05-15 (會員等級可由 admin 自訂)

### 新增 admin 設定頁
- `/liff/admin/vip-tiers` — 完整管理頁
  - 每個等級可改：level / key / 中文名 / 英文名 / emoji / 主題色 / 門檻 / 福利清單
  - 等級數量 1-10 可增可刪
  - Emoji 預設 20 種快選；色彩預設 6 種快選 + color picker
  - 「儲存」會自動**重算所有會員等級**，回報變動人數

### Schema
- `SiteConfig.vipTiers Json @default("[]")` 儲存自訂等級
- 空陣列 → fallback 到內建 5 種預設

### 新 API
- `GET /api/vip-tiers` 公開：client 拿目前等級設定
- `GET /api/admin/vip-tiers` admin/boss 可看
- `POST /api/admin/vip-tiers` admin only：整批更新 + 重算
- `DELETE /api/admin/vip-tiers` admin only：還原預設

### 核心 helper 更新
- `computeVipLevel(logs, spend, tiers?)` 加 tiers 參數
- `getVipTier(level, tiers?)` 同上
- `getNextTierProgress(logs, spend, tiers?)` 同上
- `normalizeVipTiers(raw)` 解析 DB Json

### 整合
- 老闆核可款項時：讀 DB 設定算等級
- admin 編輯會員 logCount/totalSpend：依 DB 設定 auto-promote
- profile 會員卡：fetch `/api/vip-tiers` 動態取設定

### Dashboard 入口
- admin 主控台多「**會員等級設定**」入口（Award icon）

## 20260515_54 — 2026-05-15 (老闆角色 + 海王子潛水 5 等級會員)

### 新角色：boss 老闆
- `UserRole` enum 新增 `boss`
- 權限矩陣：
  - **admin**：所有功能（系統管理者）
  - **boss**：開團 / 訂單 / 會員 / **收款核對**（不含系統設定）
  - **coach**：帶團 / 看當日場次學員資訊（**不碰款項**）
  - **customer**：預約 / 上傳付款截圖 / 看自己訂單

### 5 等級會員系統
| LV | 名稱 | Emoji | 條件 (OR) |
|---|---|---|---|
| 1 | 小蝦 Shrimp | 🦐 | <20 潛 或 <10,000 |
| 2 | 龍蝦 Lobster | 🦞 | 21-50 潛 或 10k-30k |
| 3 | 海龜 Sea Turtle | 🐢 | 51-100 潛 或 30k-80k |
| 4 | 鬼蝠魟 Manta Ray | 🪼 | 101-200 潛 或 80k-150k |
| 5 | 鯨鯊 Whale Shark | 🦈 | >200 潛 或 >150k |

升級條件「OR」：兩個條件**任一達標**就升等。

### Schema 變更
- `User.vipLevel Int @default(1)` 範圍改為 1-5（之前 0-2）
- `User.totalSpend Int @default(0)` 新欄位：累計消費

### 自動升等引擎 (`src/lib/vip-tier.ts`)
- `computeVipLevel(logs, spend)` — 依 OR 條件回 1-5
- `getNextTierProgress()` — 距離下一級還差多少（給進度條）
- 觸發點：**款項核可時**自動 `totalSpend += amount` + 重算 vipLevel

### Permission 改動
- `POST/GET /api/coach/payment-proofs`：從 `coach+admin` 改為 **`boss+admin`**（教練不該碰款項）
- `requireRole()`：admin 永遠通過 (superuser)
- `POST /api/admin/users`：role 與 vipLevel 接受 boss 與 1-5

### UI
- **`/liff/profile`** 新「會員等級卡」：
  - 大 emoji + LV 標籤
  - 顯示目前潛水次數 + 累計消費
  - 升等進度條（還差 N 支或 NT$ XX）
  - 福利清單
- **`/liff/admin/users`** 編輯 Dialog：
  - VIP 等級改為 5 個彩色 chip（含 emoji + LV）
  - 新增「累計消費 (NT$)」欄位
  - 自動重算：只改 logCount/totalSpend 不指定 vipLevel 時 → 系統 auto compute
- **Profile 後台入口**：admin 看「Admin 主控台」、boss 看「老闆主控台」

### Phase A 進度
- **潛水團複製按鈕**（📋）：日期 +1 個月、title 加 (複製)、id 清空
- 潛水團「📸 當日照片」入口（與日潛同 component，可再加入）

### `docs/CRON_SETUP.md`
- 完整列出 4 個 cron endpoint + 排程建議：
  - `/api/cron/reminders` — D-1 + 尾款 (每 30 分鐘)
  - `/api/cron/weather-check` — 海況 (每天 06:00)
  - `/api/cron/expire-trip-photos` — 過期照片清理 (每天 02:00)
  - `/api/cron/admin-weekly` — 週報 (週一 09:00)

## 20260515_53 — 2026-05-15 (admin 開團 編輯日期 + 顯示優化)

### Bug fix #1：編輯場次日期欄位空白
- 根因：API 回的是 ISO `2026-05-16T00:00:00.000Z`，`<input type="date">` 認不得，顯示空白
- 修：點編輯時把 `t.date.slice(0, 10)` 切成 `YYYY-MM-DD` 再塞給 dialog

### Bug fix #2：儲存當住
- 根因：日期空白送 server → `new Date("")` 變 Invalid Date → Prisma throw → 前端永遠等不到 200
- 修：
  - saveTrip 前端 validation：日期/時間沒填擋下來不送
  - payload 強制 `date.slice(0, 10)` 保證乾淨

### 顯示優化
- **「base NT$ 0」改為「每支 NT$ 600」**（更清楚 + baseTrip > 0 才顯示 + 基本費 N$）
- 場次卡 + 潛水團卡 日期顯示切掉 ISO 後綴：
  - `2026-05-16T00:00:00.000Z 08:00` → `2026-05-16 08:00`
- 潛水團編輯點開時把 4 個日期欄位都切乾淨：dateStart / dateEnd / depositDeadline / finalDeadline

## 20260515_52 — 2026-05-15 (修 profile 預約紀錄 crash + 錯誤回報)

### Bug fix
- `/liff/profile` 點「預約紀錄 ▸」會把 LIFF 整個頁面 crash
- 根因：`BookingHistoryList` 假設 `b.ref` 永遠存在，但如果某筆 booking 對應的 trip/tour 被刪了 (孤兒訂單)，`b.ref` 為 null → `b.ref.date` throw TypeError → 整個 React tree 炸掉 → LIFF in-app browser 顯示「This page couldn't load」

### 修
- `BookingHistoryItem.ref` 型別改為 `| null`
- `BookingHistoryList` 用 `ref ?? {}` 預設值防呆
- `openBookingDialog` 加 catch handler 顯示錯誤訊息（不再讓 throw 冒到 React boundary）
- Dialog 加 `bookingError` 狀態 + 紅框錯誤顯示

## 20260514_51 — 2026-05-14 (修改訂單：標題明確 + 多人潛伴編輯)

### `/liff/my` 修改訂單 Dialog
- **標題改為**「修改預約日潛訂單」（日潛）/「修改預約潛水團」（潛水團）
- **人數 > 1 時自動展示「潛伴資料」section**（介於潛水內容/裝備中間）
  - 自動 resize：人數變動時 slot 數量自動跟著加減
  - 每個 slot 可手動填或從常用潛伴下拉一鍵帶入
  - 含姓名 / 電話 / 證照等級 chips / 關係
  - 手機輸入用 formatPhoneTW 自動格式化
- 摘要列：「全部填齊 → 顯示名字列表」/「還未填齊 → 紅字提示」

### `/api/bookings/[id]` PATCH
- schema 新增 `participantDetails: Array<{...}>`
- 更新時把本人 (isSelf=true) + 新潛伴 slot 一起存

### `/api/bookings/my` GET
- 回傳新增 `participantDetails` 給 client

## 20260514_50 — 2026-05-14 (潛伴 #N 摘要列 quick-pick 下拉)

### `/liff/dive/trip/[tripId]` 多人預約潛伴 slot
- 摘要列（收合狀態）右側新增「**— 選潛伴 —**」下拉選單
- 顯示使用者個人資料的常用潛伴清單（含姓名 + 證照）
- 選一個自動帶入該 slot 的 name / phone / cert / certNumber / logCount / relationship
- 不需要先點開 slot 就能快速選

### Before / After
**Before**: 點開 slot → 看到大型 chip → 點 chip 選潛伴
**After**:  收合狀態旁邊就有下拉 → 直接選 → 摘要列即時更新

## 20260514_49 — 2026-05-14 (手機輸入自動 0912-345678 格式)

### 新 helper
- `src/lib/phone.ts`：
  - `formatPhoneTW(input)`：strip 非數字 → 限 10 碼 → 4 碼後自動插 `-`
    - "0912345678" → "0912-345678"
    - 使用者打字過程中即時格式化
  - `unformatPhone(formatted)`：反向
  - `isValidPhoneTW(input)`：驗 09XX-XXXXXX 格式

### 套用範圍（全部 phone input）
- `/liff/profile` 個人手機 + 緊急聯絡電話 + 潛伴電話
- `/liff/dive/trip/[tripId]` 預約手機 + 緊急聯絡電話 + 多人預約 phone
- `/liff/tour/[packageId]` 預約手機 + 緊急聯絡電話
- `/liff/admin/users` admin 編輯會員電話

### 屬性統一
全部 phone input 加：
- `type="tel"` (iOS 數字鍵盤)
- `inputMode="numeric"` (Android 純數字鍵盤)
- `maxLength={11}` (10 碼 + 1 個 `-`)
- 統一 placeholder：`0912-345678`

讀 DB 既有資料時也會 reformat（如果原本存的是 09xx-xxx-xxx 或 09xxxxxxxx 都會轉成 0912-345678）

## 20260514_48 — 2026-05-14 (計價公式重定 + 訂單編輯 UI 重設計)

### 計價公式 v48（最終版）
```
總額 = baseTrip (整單一次性平收)
     + extraTank × 支數 × 人數    ← 隨人數、支數放大
     + nightDive (若夜潛)
     + scooterRental (若水推)
     + 裝備 (各裝備 price × qty)
```

跟 v47 的差別：**baseTrip 不再 × 人數**，是整單共享的基本費（船費分攤、教練包船費等）。
night/scooter 也改為整單平收（更直觀）。

### 範例
baseTrip=500、extraTank=600、tanks=2、people=2、gear=300
- 總額 = 500 + 600×2×2 + 300 = **3,200**

### 更新範圍
- `POST /api/bookings/daily`
- `PATCH /api/bookings/[id]`
- `/liff/dive/trip/[tripId]` client 預覽
- `/liff/dive/date/[date]` 列表預估
- `/liff/my` 修改訂單 Dialog

### `/liff/my` 修改預約 Dialog 重設計
- **兩個折疊區塊**（預設都收起）：
  1. **潛水內容**：點開可改「潛水支數 + 人數」，旁邊即時顯示小計
  2. **租賃裝備**：點開可改每樣裝備數量
- 每個區塊 header 顯示 summary：`2 支 × 2 人 · NT$ 2400`
- Dialog 底部固定**總結費用框**（深藍邊框）：
  - 基本費（若 > 0）
  - 潛水 600 × 2 支 × 2 人 = 2400
  - 夜潛/水推（若有）
  - 裝備（若有）
  - **總計**：紅色大字

### Server 也更新 PATCH 計算
之前 `baseAmount × newParticipants` 會把 baseTrip 也乘人數，現在正確了。

## 20260514_47 — 2026-05-14 (日潛計價 client/server 一致化)

### Bug fix
v42 改了 server 計價公式但 client 還是舊的，導致顯示金額跟實收不符：
- 舊公式 (client 顯示)：`baseTrip + (tanks-1) × extraTank` → 2 支顯示 500
- 新公式 (server 收費)：`extraTank × tanks + baseTrip` → 2 支實收 1000

### 全面更新
- `src/app/liff/dive/trip/[tripId]/page.tsx` 計價公式跟 server 對齊
- `src/app/liff/dive/date/[date]/page.tsx` 列表頁預估價格修正
- `src/app/api/bookings/[id]/route.ts` PATCH 重算 totalAmount 也用新公式
- 場次卡顯示文字：「第二潛起每支 +500」→「每支 NT$500（含空氣瓶）」
- 費用明細顯示「潛水 500 × 2 支 × 1 人」清楚算式

### Seed defaults
- `baseTrip: 1500 → 0`（基本費預設不收，全靠每支潛水費）
- `extraTank: 500 → 600`（業界常見每支 600）
- Admin 開團時依需求調整

## 20260514_46 — 2026-05-14 (圖片放大 + 場次當日照片 + 轉帳截圖回顯)

### 1️⃣ 客戶可看自己上傳的轉帳截圖
- `/api/bookings/my` 為每張 `paymentProof` 加 presigned GET URL (10 分鐘 TTL)
- `/liff/my` 每張預約卡下方多「我上傳的轉帳截圖」區塊
- 縮圖點下去 → Lightbox 全螢幕放大 + 下載按鈕
- 已核可截圖右下角綠色勾標示

### 2️⃣ 全站 Lightbox 圖片放大
- 新 `src/components/ui/lightbox.tsx`
- 點背景或 ESC 關閉
- 可下載原圖（含 Cloudflare R2 圖片）
- 顯示 caption（金額、type、過期天數等）

### 3️⃣ 日潛當日照片功能
- 新 schema `TripPhoto` (id, tripId, r2Key, expiresAt = uploadedAt+7天, downloadCount)
- 新 API:
  - `POST /api/coach/trip-photos` coach/admin 上傳 (帶 tripId + r2Key)
  - `DELETE /api/coach/trip-photos/[id]` 刪除（同步刪 R2 物件）
  - `GET /api/trips/[id]/photos` 列照片
    - 權限：該場次的 booking 持有人，或 coach/admin
    - 只回未過期的
- 新 component `TripPhotoGallery` (上傳/刪除/縮圖 + Lightbox)
- Admin 端：`/liff/admin/trips` 每張場次卡多 📸 Camera 按鈕 → 展開照片管理
- 客戶端：`/liff/my` 日潛結束後（completed 或日期過了）多「📸 今日潛水照片」區塊

### 4️⃣ 自動過期清理
- 新 cron `/api/cron/expire-trip-photos`
  - Auth: Bearer CRON_SECRET
  - 每天跑：找 `expiresAt < now` 的 photo → 刪 R2 物件 + DB row
  - 建議在 Cronicle 設每天 02:00 觸發

### Schema 變更（Zeabur db push 自動同步）
- 新 model `TripPhoto`

## 20260514_45 — 2026-05-14 (天氣取消改為手動確認模式)

### 新功能
- `SiteConfig.weatherAutoCancel: Boolean @default(false)` 全新開關
- **預設關閉**（安全模式）：
  - cron/weather-check 偵測風速超標時，**只推 LINE 文字警告**給場次教練 + 全部 admin
  - 不動 DB、不通知客戶
  - 教練/admin 收到警告後，自行決定是否手動到 `/liff/admin/trips` 取消
- **開啟時**（舊行為）：
  - cron 自動把所有 open 場次設為 cancelled
  - 自動推 Flex + Email 給所有客戶（雙通道）

### 為什麼預設關
cron 凌晨 06:00 抓的風速跟實際出航時段（08:00 / 13:00 / 17:00）可能差很多，
全自動取消有誤殺風險。預設關掉，讓教練看當下海況再決定。

### Admin UI
- `/liff/admin/site-config` 加「🌬 天氣自動取消」card
- Toggle 旁有完整解釋兩種模式差異

### `/api/admin/site-config` API
- GET 回傳新增 `weatherAutoCancel`
- POST 接受 `weatherAutoCancel: boolean`

## 20260514_44 — 2026-05-14 (test-r2 cron endpoint for autonomous R2 verify)

### 新增
- `POST /api/cron/test-r2` 全自動驗證 R2 配置
- 流程：上傳 1x1 PNG 到 public + private 兩 bucket → fetch 驗證 → 清理
- 回傳每一步 ok/error，無法到達哪一步立刻明確
- 可看 R2_PUBLIC_URL / bucket 名稱等 env state（不洩漏 secret）

## 20260514_43 — 2026-05-14 (test-email cron endpoint for autonomous email verify)

### 新增
- `POST /api/cron/test-email` 專用測試端點
- CRON_SECRET 認證 + body `{to}` 指定收件人
- 用於 deploy 後驗證 Gmail SMTP 設定，無需 LIFF auth
- 不會誤發給其他人，只寄 body.to 一封

## 20260514_42 — 2026-05-14 (大幅功能 + 計價邏輯重構)

### Bug fix
- `PATCH /api/admin/trips/[id]` weatherNote 接受 null（修「儲存失敗 HTTP 400 weatherNote expected string received null」）

### 計價邏輯重構（#7, #8）
**之前**：`baseAmount = baseTrip + (tanks-1) × extraTank`，總額 = baseAmount × 人數
**現在**：`baseAmount = extraTank × tanks + baseTrip`，總額 = baseAmount × 人數 + 裝備
- `pricing.extraTank` 語意改為「每一次潛水（含空氣瓶）單價」
- 例：500/支、2 支、2 人 → 2000

### 開團 form 改進
- **#6 時間選單化**：時 (00-23) × 分 (00/15/30/45) 兩個 select
- **#5 複製場次**：每張開團卡多「📋 複製」按鈕，自動帶入隔天日期
- **#4 集合地點 Maps 助手**：旁邊有按鈕直接開 Google Maps；卡片內若是 URL 自動變連結

### 付款方式（#10）
- Schema 加 `PaymentMethod` enum + `Booking.paymentMethod`
- 客戶日潛預約頁加付款方式選單（💵 現場 / 🏦 轉帳 / 💚 LINE Pay）
- 客戶潛水團預約頁支援同 API
- Admin 訂單編輯 Dialog 可改 paymentMethod

### 訂單管理「按場次」總覽（#11）
- 新 API `GET /api/admin/bookings/by-trip`
- 每個 trip/tour 顯示：訂單數、總人數、總潛水支數（人數×支數）、已付/總額
- 可展開看單筆訂單明細
- 預設打開「按場次」tab（從統計卡進來仍是「進行中」）

### Schema 變更（Zeabur db push 自動同步）
- 新 enum `PaymentMethod (cash/bank/linepay/other)`
- `Booking.paymentMethod` 預設 `cash`

## 20260514_41 — 2026-05-14 (calendar useEffect dep null safety)

### Bug fix
- `src/app/liff/calendar/page.tsx:111` useEffect 依賴陣列改用雙層 optional chain
- 之前：`range?.from.getTime()` — 若 `range` 存在但 `from` 為 undefined 會 throw
- 之後：`range?.from?.getTime()` — 全程 safe

## 20260514_40 — 2026-05-14 (Critical 安全修補：price tampering)

### Critical
- `POST /api/bookings/daily` rentalGear price 現在強制 `min(0).max(50000)`
  - **之前**：client 可送 `price: -9999` → totalAmount 變負數 → 客戶等於拿信用額度
  - **現在**：Zod schema 擋住負數，超過 5 萬也擋
- totalAmount 二次保護：若計算結果 < 0 直接 400 reject

### 為什麼能造成負數
之前 schema 只 `z.number().int()` 沒 min，客戶端任意數字都通過驗證。
這是 Zod 預設行為 — number 接受負值。修法：明確 `.min(0)`。

### Note: tour route 已經安全
`POST /api/bookings/tour` addons 是從 DB 查 server-side 價格，不取信於 client。

## 20260514_39 — 2026-05-14 (深度 audit 第二批 fix)

### 修
- `PATCH /api/me` Zod safeParse + try/catch
- `POST /api/bookings/[id]/payment-proofs`:
  - safeParse + try/catch
  - **金額上限驗證**：上傳金額不能超過應付餘額（+100 NT$ 容差）
  - 避免客戶端送假金額干擾教練核對

### 已知保留問題 (Out-of-scope，留待下次審查)
- `POST /api/bookings/daily` rentalGear price 由 client 控制
  - 風險：可能被竄改為 0 或負數
  - 緩解：教練核對轉帳金額時會抓到不對
  - 修法：要建立 server 端 gear 價目表，較大改動
- `POST /api/bookings/daily` capacity check 不是 atomic
  - 風險：同時多人預約可能超賣
  - 緩解：目前已有 `overCapacity` 標記提醒教練
  - 修法：要用 SELECT FOR UPDATE 或 DB-level constraint

## 20260514_38 — 2026-05-14 (Bug hunt：error handling 全面強化)

### Background
過夜自主 audit 找到 10 個 production safety 問題，本版修 1 critical + 5 high。

### Critical fix
- `src/app/api/webhook/route.ts` `handleFollow()` 的 `prisma.user.upsert()`
  - 之前無 try/catch → DB 失敗整個 webhook 5xx，LINE 不會 retry
  - 現在 catch + log + 繼續送歡迎訊息

### High priority fixes (write endpoints 加 try/catch + 詳細 error 回傳)
- `PATCH /api/admin/trips/[id]` — Zod safeParse + try/catch
- `DELETE /api/admin/trips/[id]` — 軟取消 + 硬刪除兩段都包 try/catch
- `PATCH /api/admin/coaches/[id]` — Zod safeParse + try/catch
- `PATCH /api/admin/sites/[id]` — Zod safeParse + try/catch
- `POST /api/admin/tours` — Zod safeParse + try/catch
- `PATCH /api/admin/tours/[id]` — Zod safeParse + try/catch

### 影響
之前所有上面這些 endpoint 失敗 → 前端只看到 `HTTP 500:` 完全沒上下文。
現在會回 `{error, detail, hint}` JSON，前端 alert 顯示真正原因（例：column does not exist / unique violation / FK constraint）

### Medium (留待 v39+)
- cron/weather-check + cron/reminders 內的 for-loop 應該批次 update 而非個別
- 影響低（cron 每 30 分鐘一次，每次處理量小），不急

## 20260514_37 — 2026-05-14 (新增場次 form 改 select + 訂單編輯 + coach 訂單權限)

### 新增/編輯場次 form
- **潛水支數**：input → select（選單 1 / 2 / 3 / 4，default 2）
- **參加人數上限**：input → select（0-20，default 0 = 無上限）
- **加潛/支** label 改為 **「每一次潛水（含空氣瓶）」** default 500
- **基本價** default 0（不再預設 1500）

### 訂單管理：新增編輯 Dialog
- 每張訂單卡多「✏️ 編輯」按鈕
- Dialog 可改：參加人數、總金額、已付金額、付款狀態、訂單狀態
- 新 API：`PATCH /api/admin/bookings/[id]`
  - admin + coach 都可呼叫（教練可在現場改 paidAmount / status）
  - Zod 驗證 + Prisma error 完整回報

### 教練權限調整
- `DELETE /api/admin/bookings/[id]` 軟取消開放給 **coach**
- `?permanent=true` 硬刪除仍只限 admin

## 20260514_36 — 2026-05-14 (刪除會員 / 刪除訂單 / 批次取消)

### 新 API
- `DELETE /api/admin/users/[lineUserId]`
  - 預設：有訂單 → 409，可附 `?force=true` 強制刪
  - 禁止刪除自己
  - cascade: paymentProof + reminderLog + booking + user
- `DELETE /api/admin/bookings/[id]`
  - 預設：軟取消（status=cancelled_by_user）
  - `?permanent=true`：硬刪 booking + proofs + logs
- `POST /api/admin/bookings/cancel-all` body `{confirm:"CANCEL-ALL-BOOKINGS"}`
  - 一鍵把所有 pending/confirmed 訂單改為 cancelled_by_user

### `POST /api/admin/trips` 改強 error
- Zod 失敗回 400 + issues 列表
- Prisma 失敗回 500 + detail + hint
- 之前直接 throw → 看到 generic "HTTP 500" 完全不知道哪裡錯

### UI
- `/liff/admin/users` 每張卡多「🗑 刪除會員」按鈕
  - 雙重確認（confirm + prompt "DELETE"）
  - 有訂單時跳第二次對話框問是否強制刪
- `/liff/admin/bookings`：
  - 每張卡多「取消」+「⚠ 永久刪除」按鈕
  - 標題右側多「全部取消 (N)」紅色按鈕（雙重確認 "CANCEL-ALL"）

### 仍待處理：R2 圖片上傳 503
需在 Zeabur 補 env：
```
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```
（admin 已自設 R2_ACCOUNT_ID / R2_ENDPOINT / R2_PUBLIC_BUCKET / R2_PRIVATE_BUCKET，
但缺 access key + secret，所以 r2Configured()=false）

## 20260514_35 — 2026-05-14 (修 v34 Zeabur build 失敗)

### Bug fix
- v32 引入 `useSearchParams()` 但 Next.js 16 預渲染 client component 要包 Suspense
- 否則 `npm run build` 在 prerender `/liff/admin/bookings` + `/liff/admin/trips` 階段失敗
- 修：兩頁都改為 `Page → <Suspense><Content/></Suspense>` 結構

## 20260514_34 — 2026-05-14 (多重身分 User.roles[])

### 核心需求
一個 user 可以同時是 customer + coach + admin。
例：店長本身是 admin 也是教練；常客升等成 VIP 教練。

### Schema
- `User.roles UserRole[] @default([])` 新欄位 — primary 多重角色
- `User.role` 保留為 legacy 兼容欄位（admin > coach > customer 優先）
- 空陣列自動 fallback 為 `[role]`，舊資料無痛遷移

### `lib/auth.ts`
- 新 helper `getUserRoles(user)`：roles 空就 fallback 為 `[role]`
- `requireRole()` 改為「user 的角色清單 ∩ allowed 非空就過」
- 所有現有 API 不用改 — 自動支援多重身分

### API
- `GET /api/admin/users` 回傳每筆 `effectiveRoles: Role[]`
- `POST /api/admin/users` 接受 `roles: Role[]`（推薦）或 `role`（legacy）
  - 帶 `roles` 時自動同步 `role` 為優先順序的第一個
  - 至少要選一個角色，空陣列回 400
- `GET /api/me` 回傳 `roles: Role[]`（fallback `[role]`）

### UI
- `/liff/admin/users` 編輯對話框「角色」改為 **複選 chips**
  - 至少要保留一個（按鈕不會讓最後一個被取消）
  - 卡片每個角色都顯示一個 badge
  - 篩選 tabs 改用 `effectiveRoles.includes()`
- `/liff/profile` 個人資料卡：所有非-customer 角色都顯示 badge
- `/liff/profile` 後台入口：admin / coach **兩個都看得到**（如果都有的話）

## 20260514_33 — 2026-05-14 (潛點強制刪除 cascade)

### `DELETE /api/admin/sites/[id]?force=true`
- 預設仍會擋（被 trip/tour 引用時回 409）
- 加 `?force=true`：在 transaction 內
  1. 把該 site id 從引用的 trip/tour 的 `diveSiteIds` 陣列拉掉
  2. 再刪除 site
- 409 回應加 `canForce: true` + 引用數量

### UI
- `/liff/admin/sites` 點刪除遇到 409 時
- 跳出第二次確認：「強制刪除會自動從 N 個場次 + M 個潛水團拉掉此潛點」
- 確認後自動帶 `?force=true` 重試

## 20260514_32 — 2026-05-14 (主控台統計卡可點 + 數字改 operational 語意)

### `/api/admin/stats` 改寫
- `trips.bookable` — open + 未來日期（可預約場次）
- `tours.bookable` — open + 未來出發日（可預約團）
- `bookings.active` — status in (pending/confirmed) + 對應 event 未過

### 主控台 Mini 卡
- 4 張卡全部變成 Link，標題右邊有 `▸` 提示
- **會員** → `/liff/admin/users`
- **日潛場次** → `/liff/admin/trips?tab=trips&filter=active`
  - 主數字改為 bookable，副標顯示「總 N」
- **潛水團** → `/liff/admin/trips?tab=tours&filter=active`
- **總訂單** → `/liff/admin/bookings?filter=active`
  - 主數字改為「未執行」訂單數

### URL param 支援
- `/liff/admin/trips` 讀 `?tab=` (trips/tours) + `?filter=` (active/cancelled/all)
- `/liff/admin/bookings` 讀 `?filter=active` → 預設 tab=進行中

### 為什麼這樣改
之前主數字是「歷史累計」（含 cancelled / completed / 過去場次），admin 想知道
「現在可以預約的場次幾個？還沒執行的訂單幾筆？」是看不出來的。
現在 operational 數字一目了然，點進去也直接導到對應 filter。

## 20260514_31 — 2026-05-14 (修 /liff/profile 載入卡住問題)

### Bug fix
- `/liff/profile` 之前 `/api/me` 失敗會靜默吞錯，永遠卡在「載入中...」
- 現在會顯示真正的錯誤訊息 + 「重試」「重新登入 LINE」按鈕
- 偵測到 401 / idToken 過期 → 自動觸發 `liff.login()` 重新走 OAuth flow

### 觸發原因
LIFF idToken 有 1 小時 TTL，過期後 `/api/me` 回 401。
原本 `.catch(() => {})` 完全沒顯示，user 只看到「載入中...」會覺得網站壞了。

## 20260514_30 — 2026-05-14 (Email 通道完整整合)

### 新模板 (6 個)
- `depositReminderEmail` — 訂金繳費提醒（7 天內）
- `finalReminderEmail` — 尾款繳費提醒（D-N）
- `tripGuideEmail` — D-2 / D-1 行前通知 + 裝備清單
- `weatherCancelEmail` — 海況取消通知 + 後續處理選項
- `paymentReceivedEmail` — 收款確認（deposit / final / full）
- `broadcastEmail` — admin 自由格式廣播

### Cron 雙通道
- `/api/cron/reminders` D-1 / 尾款提醒：**LINE + Email 各自獨立 dedup**
  - 客戶 `notifyByLine = false` 跳過 LINE，`notifyByEmail = false` 或無 email 跳過 Email
  - 兩通道各自記 `ReminderLog`（channel="line" / channel="email"）
- `/api/cron/weather-check` 海況取消：同時推 LINE Flex + Email

### 觸發點
- `POST /api/bookings/daily` 預約成功 → 客戶收 `bookingConfirmEmail`
  - fire-and-forget，email 失敗不影響預約建立
- `POST /api/coach/payment-proofs` (approve) → 客戶收 `paymentReceivedEmail`
  - 自動判斷 deposit / final / full 三種情境

### Broadcast 加入 channel 選擇
- `/liff/admin/broadcast` 新增「通道」card：LINE / Email / 兩者
- 選 email/both 時顯示 Email 主旨 + 內文輸入框
- 後端 `/api/admin/broadcast` 接受 `channel` + `emailSubject` + `emailBody`
- 結果顯示「LINE N 人 · Email M 人」

### 用戶尊重
- 所有通道都檢查 user.notifyByLine / notifyByEmail
- 客戶可在 `/liff/profile` 自己關掉任一通道

## 20260514_29 — 2026-05-14 (Email 通道：Gmail SMTP core)

### 新依賴
- `nodemailer@8` + `@types/nodemailer`

### lib/email/
- `send.ts` — Gmail SMTP wrapper
  - 沒設 env 自動 no-op（不 throw，回 `{ ok:false, skipped:true }`）
  - 收件人沒 email 直接 skip（容錯 cron 場景）
  - 支援 App Password 兩種格式：`abcd efgh ijkl mnop` 或 `abcdefghijklmnop`
- `templates.ts` — 純函式回傳 `{ subject, text, html }`
  - 目前 2 個：`testEmail` / `bookingConfirmEmail`
  - 統一 shell：品牌色 header + 灰底卡片，inline-style 對應大部分 email client

### Schema
- `User.notifyByLine Boolean @default(true)`
- `User.notifyByEmail Boolean @default(true)`

### API
- `POST /api/admin/email/test` — 寄測試信
  - body 可選 `{to}`，預設寄 admin 自己 email
  - 沒設 env 回 503 + hint
- `/api/me` GET/PATCH 支援 `notifyByLine` / `notifyByEmail`

### UI
- `/liff/profile` 新增「**通知偏好**」卡：LINE / Email toggle
  - Email toggle 在沒填 email 時 disabled + 紅標提示
- `/liff/admin/settings` 新增「**Email 通道測試**」區塊
  - 可指定收件人或留空寄給自己
  - 顯示結果（成功/略過/失敗 reasons）

### .env.example
- 新增 `GMAIL_USER` / `GMAIL_APP_PASSWORD` 區塊 + 申請步驟說明
- 提醒：Gmail 個人額度 500 封/天，量大要換 SendGrid/Resend/SES

### Deploy 設定
admin 需在 Zeabur dashboard 加環境變數：
```
GMAIL_USER=neowu62@gmail.com
GMAIL_APP_PASSWORD=（自己的 App Password，16 字）
```

### 下一版預定
- 6 個 email 模板（deposit-reminder / final-reminder / trip-guide / weather-cancel / payment-received / admin-broadcast）
- cron/reminders 雙通道（LINE + Email）
- /liff/admin/broadcast 加 channel select

## 20260514_28 — 2026-05-14 (User.email + 首次登入提示)

### Schema 變更
- `User.email String?` (max 254 字 = RFC5321 上限)

### API
- `GET /api/me` 回傳 `email`
- `PATCH /api/me` 接受 `email`，Zod 用 `.email()` 驗證格式
- `POST /api/admin/users` admin 也可代填 email

### 客戶端 `/liff/profile`
- 個人資料卡加 **Email 欄位**（必填，跟姓名/手機/證照同層）
- 格式不對紅框 + 提示
- summary 加入 email 顯示
- email 未填時顯示「🔔 首次登入請填 email」

### Welcome 首次登入提示
- 登入後若 `email == null` → Hero 區下方出現金色提示框
- 點一下直接跳 `/liff/profile`

### Admin 會員管理
- 編輯 Dialog 加 Email 欄位
- 列表卡片顯示 email
- 搜尋框比對 email

### 用途
Email 比 SMS 便宜（SMS 約 NT$1/封；email 幾乎免費）：
- 預約確認信
- 行前通知（出發前 D-2）
- 訂金/尾款收據
- 統一發票（將來）

## 20260514_27 — 2026-05-14 (會員管理：完整編輯)

### `/liff/admin/users` 大改
- 新增「編輯」按鈕 + Dialog，admin 可以改：
  - 真實姓名 / 電話
  - 角色 (customer/coach/admin)
  - 證照等級 (OW/AOW/Rescue/DM/Instructor/無)
  - 證照號碼
  - 潛水紀錄數 (logCount)
  - VIP 等級 (— / VIP / Gold)
  - Admin 備註（只有 admin 看得到）
  - 黑名單 + 加黑原因
- LINE userId / displayName 不能改（系統識別用，唯讀顯示）
- 列表加 **搜尋框**（姓名/電話/證號/userId 模糊比對）
- 列表加 **篩選 tabs**：全部 / 客戶 / 教練 / Admin / VIP / 黑名單
- 卡片顯示更完整：角色 / 證照 / VIP / 黑名單 badge、訂單統計、Admin 備註

### API
- `POST /api/admin/users` schema 擴充支援所有可編輯欄位
- 空字串 → null 處理（避免 DB 存空字串）

## 20260514_26 — 2026-05-14 (場次/團 上傳照片 + 集合地點)

### 新元件
- `src/components/admin/ImageUploader.tsx` — 共用上傳元件
  - 直接 PUT R2 (presign + 8MB / 張上限 / max 8 張)
  - 顯示縮圖 grid + 移除按鈕
  - 支援 prefix: `sites` / `trips` / `tours` / `media`

### 日潛場次表單
- 新欄位：**集合地點說明** (textarea)
  - 例：「海王子潛店 / 龍洞 4 號港停車場 / 潮境公園售票口 07:30 集合」
- 新欄位：**場次照片**（最多 8 張）
- 卡片列表顯示 📍 集合地點 + 縮圖 row（顯示前 4 張）

### 潛水團表單
- 新欄位：**團照片**（schema 一直有 images，這次補上 UI）
- 卡片列表顯示縮圖 row

### Schema 變更
- `DivingTrip.meetingPoint String?`
- `DivingTrip.images String[] @default([])`
- `TourPackage.finalReminderDays @default(30)` (從 3)
- `TourPackage.guideReminderDays @default(2)` (從 1)

### R2 prefix 新增
- `trips/` 日潛場次照（public bucket）
- `tours/` 潛水團照（public bucket）

## 20260514_25 — 2026-05-14 (清除全部開團資料 + 旅行團 → 潛水團)

### 文字統一改名
- 全站 **「旅行團」→「潛水團」**（22 個 code 檔案、Flex 模板、UI、API 訊息）
- 保留歷史 CHANGELOG / docs 原文不動

### 新功能：一鍵清除所有開團資料
- 在 `/liff/admin/trips` 「全部」tab 下方加 **危險區塊**
- 雙重確認（confirm + prompt 輸入 `WIPE-ALL`）
- 新 API：`POST /api/admin/trips/wipe-all`
  - body: `{ confirm: "WIPE-ALL-TRIPS-AND-TOURS" }`
  - 在 transaction 內依序刪：PaymentProof → ReminderLog → Booking → DivingTrip → TourPackage
  - **不會動**：DiveSite / Coach / User / SiteConfig / TripMedia / MessageTemplate
- 回傳實際刪除數量

## 20260514_24 — 2026-05-14 (旅行團表單橫向化 + 提醒新規則)

### 「新增 / 編輯旅行團」對話框
- 改為 **label 在左、欄位在右** 橫向佈局（左欄固定 7rem）
- Label 改名：
  - 「總價」→「**團費**」
  - 「容量 (0 = 無上限)」→「**預計團員人數**」
- 自動推播提醒重新規劃預設值：
  - **訂金 D-7**：確認訂單後 7 天內付款保留名額
  - **尾款 D-30**：出發前 30 天繳清（原本 D-3 太晚）
  - **行前 D-2**：出發前 2 天再次通知（原本 D-1）
- 每項提醒旁加文字說明，讓 admin 知道為什麼是這天數

### Schema 預設值
- `TourPackage.finalReminderDays` 預設 3 → **30**
- `TourPackage.guideReminderDays` 預設 1 → **2**
- 既有 tour row 不會自動 migrate，admin 要手動改

## 20260514_23 — 2026-05-14 (新增場次表單簡化)

### 「新增 / 編輯場次」對話框
- 移除「夜潛」「水推」兩個 checkbox
- 改由時間自動判斷：`startTime >= 16:00` → `isNightDive = true`
- 對話框內顯示提示：「⏰ 16:00 之後自動標記為夜潛」+ 即時顯示目前是否為夜潛
- Label 文字：
  - 「潛次上限」→「**潛水支數**」
  - 「容量 (0 = 無上限)」→「**參加人數上限** (0 = 無上限)」

## 20260514_22 — 2026-05-14 (潛點管理 + 教練 per-dive 費用 + 場次備註)

### 新 admin 頁面
- `/liff/admin/sites` — **潛點管理**（新增/編輯/刪除）
  - 欄位：id、名稱、區域、難度、最大深度、介紹、特色、注意事項、YouTube
  - 安全：若被 trip/tour 引用會擋住刪除
- `/liff/admin/coaches` — **教練管理**（新增/編輯/停用/永久刪除）
  - **核心改動**：教練「沒有基本費用」概念，改為「每一支潛水的費用 (NT$/dive)」
  - 停用 = soft delete (active=false 可復原)
  - 永久刪除 = 雙重確認 + 有 trip ref 會擋

### 開團頁 (`/liff/admin/trips`)
- 「新增場次」對話框加 **備註說明** textarea
  - 範例：本團安排潮境公園生態解說、自備防寒衣建議 5mm…
  - 場次卡片會顯示 📝 備註
- 教練選單旁顯示 `($1500)` 每支潛水費用
- 即時試算 **預估教練成本** = Σ feePerDive × tankCount

### Schema 變更（db push 自動 sync）
- `Coach.feePerDive Int @default(0)` — 每支潛水費用
- `Coach.note String?` — 教練備註
- `DivingTrip.notes String?` — 場次備註說明

### 新 API
- `POST /api/admin/sites` `PATCH/DELETE /api/admin/sites/[id]`
- `POST /api/admin/coaches` `PATCH/DELETE /api/admin/coaches/[id]`
- `/api/admin/sites GET` 改為 admin 拿完整資料（含 description/cautions），coach 只拿基本欄位

### 既存教練資料
deploy 後既有教練 `feePerDive=0`，需要去 `/liff/admin/coaches` 一一補上。

## 20260513_21 — 2026-05-13 (開團管理：篩選 + 還原 + 永久刪除 + 修 admin 401 race)

### 「開團管理」UI 大改
- 頂部加 **篩選 tabs**：啟用中 / 已取消 / 全部
- 預設只看「啟用中」，已取消的不會干擾日常使用
- 已取消場次 / 旅行團現在多 2 個動作按鈕：
  - 🔄 **還原**：status cancelled → open（單擊還原）
  - ⚠ **永久刪除**：雙重確認（先 confirm，再 prompt 輸入 `DELETE` 字串）
- 「已取消」tab 上方一鍵「**還原全部**」（修復誤取消的場次很方便）

### 新 API
- `POST /api/admin/trips/bulk-restore`  body `{tripIds:[...]}` 批次還原
- `DELETE /api/admin/trips/[id]?permanent=true`  硬刪除（有 booking ref 會擋）
- `DELETE /api/admin/tours/[id]?permanent=true`  硬刪除

### 修「admin 401 race」
- 之前：頁面 useEffect 比 LIFF init 早跑，第一次 API call 沒帶 idToken → 401
- 現在：`fetchWithAuth` 在沒 idToken 時 poll LIFF SDK 最多 3 秒等 init 完
- 直接 poll SDK 而不是 React state，避免閉包 stale 問題

## 20260513_20 — 2026-05-13 (Welcome 橫向 layout + 修 midnight 文字色)

### 修 LiffShell header 文字看不清楚
`.midnight` CSS class 之前只改 --foreground 變數，但沒套 `color: var(--foreground)`，
所以子元素還是繼承 body 的暗色 (light mode foreground)。加上 `color: var(--foreground)`
強制讓 .midnight 內所有文字用 light 色 (#e6f0ff)。

### Welcome Hero 橫向化（縮 Y 軸）
- Logo（Trident）改放在「東北角海王子」**左邊**
- 字體調小 (text-2xl → text-lg)、subtitle 從 [10px] → [9px]
- 整體 Y 軸減半，手機一屏看到更多卡

### 6 卡橫向化（縮 Y 軸）
- icon 從上方改到**左側**
- 標籤 / EN / desc 改在 icon **右側** 直排
- 每卡 padding 從 p-4 → p-3
- 整體高度減少 ~40%，手機一屏可看到 6 卡

## 20260513_19 — 2026-05-13 (修 LIFF deep-link 404)

### 修復根本原因
LINE LIFF endpoint URL 設成 `https://haiwangzi.xyz/liff/welcome`，
當客戶打開 `liff.line.me/<ID>/calendar` 等深層連結時，LINE 會把 path
附加到 endpoint，URL 變成 `/liff/welcome/calendar` → 404。

### 修法
`next.config.ts` 加 redirect rule：
```
/liff/welcome/:path+  →  /liff/:path+
```

讓 LINE 附加 path 後 server-side 自動 redirect 到正確位置：
- `/liff/welcome/calendar` → `/liff/calendar`
- `/liff/welcome/tour` → `/liff/tour`
- `/liff/welcome/media` → `/liff/media`
- `/liff/welcome/my` → `/liff/my`
- `/liff/welcome/profile` → `/liff/profile`

### 建議的永久解法（可選）
將 LINE Console LIFF App Endpoint URL 改成：
```
https://haiwangzi.xyz/liff/welcome → https://haiwangzi.xyz/liff
```
（需另加 /liff redirect 到 /liff/welcome），這樣 path append 邏輯就直接對。
目前用 redirect rule 已能解決，不急著改。

## 20260513_18 — 2026-05-13 (Splash 暫停用，回到穩定狀態)

### Splash rollback
- LiffShell 內 `<SplashOverlay />` 暫時 comment 掉
- `/liff/go` 改回簡單 redirect (移除 splash 動畫)
- 元件檔保留，等後續修好 hydration race 再重啟

原因：客戶反映多個 LIFF 頁面打開沒畫面，懷疑是 splash overlay 卡住。
先取消 splash 確保所有頁面正常運作。

### Admin 首頁設定保留（v17 內容）
- `/liff/admin/site-config` 仍可用
- 6 卡入口 / Hero / 海況 / Footer / Slogan 全部可改
- Splash 設定欄位保留（雖然 LiffShell 暫時不渲染，未來修好再吃這設定）

## 20260513_17 — 2026-05-13 (Admin 首頁設定 + Splash 1 小時冷卻 + 外連 Splash 路由)

### 新增 Admin 首頁設定 `/liff/admin/site-config`
Admin 可在後台改：
- **Hero**：主標題（中）、副標（英）、問候語
- **6 卡入口**：每張卡可改 label / 英文標 / 說明 / URL / icon / 主色 / 啟用開關 / 順序 / 內外連
- **海況卡**：啟用、標題、資訊行、按鈕文字/連結
- **頁尾 slogan**：中文、英文
- **Splash**：啟用、秒數、冷卻

新增卡片 + 拖動排序 + 一鍵還原預設 全支援。

### Schema
- 新表 `SiteConfig`（singleton id=default，所有設定一列）

### API
- `GET /api/site-config` 公開（給 Welcome / SplashOverlay 讀）
- `GET/POST/DELETE /api/admin/site-config` admin 用

### Splash 行為改變
- **由「session 一次」→「每小時一次」**（localStorage 記時戳）
- 秒數 + 冷卻時間可在後台調整
- SplashOverlay 元件抓 `/api/site-config` 套用最新文字

### 外連 Splash 路由
- 新 `/liff/go?to=URL` 顯示 splash 3 秒後跳目標
- Welcome FB 卡自動走 `/liff/go` 包裝（外連也有 splash）

### Welcome 頁完全動態
- 所有文字 / 卡片 / 海況 / footer 改讀 SiteConfig
- 沒設定時 fallback 寫死預設

### Admin Dashboard
- 加「首頁設定」入口

## 20260513_16 — 2026-05-13 (Deep link 3 秒品牌 Splash)

### Splash Overlay
- 第一次直接打開深層 LIFF link（calendar/tour/media/my/profile）時，先顯示 3 秒品牌 splash
- Splash 內容：三叉戟 logo + 「東 北 角 海 王 子」+ NEIL OCEAN PRINCE + Loading 進度條
- 同 session 後續導航不再重複顯示（sessionStorage 標記）
- welcome 頁本身不顯示（它就是 splash 風格）

### 程式
- 新元件 `src/components/shell/SplashOverlay.tsx`
- LiffShell 內建 splash overlay

## 20260513_15 — 2026-05-13 (Welcome 改深海風格 — 對齊設計圖)

### Welcome 頁完全重做為「深海主題」
- 全頁 midnight bg (`#0F1B2D`)
- Hero 區改成「三叉戟 logo + 東 北 角 海 王 子 + NEIL OCEAN PRINCE」字寬
- 海底光斑裝飾（radial gradient blur）
- 6 卡每張獨立漸層（深海藍 → 強調色淡邊）+ 圓形 icon + 中/英雙語 + 描述 + 箭頭
- 海況卡保留但融入暗色
- 底部 slogan「探索海洋 · 安全潛水 · 專業教學」+ EN

### 新增 SVG
- `<Trident>` 三叉戟元件（src/components/brand/Logo.tsx）

### Shell
- LiffShell `midnight` 模式應用到整頁（header 也變深色）

## 20260513_14 — 2026-05-13 (最新動態 + Welcome 6 卡)

### 最新動態 (DIVE MEDIA) 功能
為節省流量設計成「連結牆」：教練先把照片/影片發到 FB/IG/YouTube，
再到 LIFF 後台貼連結 + 上傳一張小縮圖 + 一句說明，
客戶在 `/liff/media` 看到 feed → 點縮圖外開到原平台看完整內容。

新檔案：
- Prisma: `TripMedia` model + `MediaPlatform` enum (fb/ig/yt/tiktok/other)
- `/api/media` 公開 GET (feed, cursor 分頁)
- `/api/coach/media` GET/POST (上傳)
- `/api/coach/media/[id]` DELETE
- `/liff/media` 客戶端 feed 頁
- `/liff/coach/media` 教練上傳 + 自己管理頁
- R2 presign 加 `media` prefix (public bucket)
- 平台自動偵測：貼 FB/IG/YT URL 會自動選對 platform

### Welcome 改 6 卡（依您提供的設計圖）
從 4 卡（日潛/旅遊/我的/個人）→ 6 卡：
- 日潛水 (FUN DIVE) · 今日出航
- 潛水團 (DIVE TRIP) · 國內外行程
- **最新動態 (DIVE MEDIA) · 影像日誌** (新)
- 我的預約 (BOOKING) · 課程紀錄
- **FB 社群 (COMMUNITY) · Facebook 粉絲頁** (外連 https://www.facebook.com/wang.cheng.ru.350053)
- 個人中心 (MY PROFILE) · 潛水紀錄

每卡加 English label (FUN DIVE / DIVE TRIP / ...) 視覺呼應您的設計

### Admin Dashboard
加「動態管理」連結到 `/liff/coach/media`

## 20260513_13 — 2026-05-13 (修潛伴儲存 500 bug + 改名 朋友/同伴 → 潛伴)

### 修 HTTP 500 bug
- 「新增潛伴」後立刻點 OW/AOW 按鈕（還沒填名字）→ debounce 觸發 PATCH /api/me → 後端 Zod 拒絕空 name → 500
- 修法：`persistCompanions` 只把 `name.trim().length >= 1` 的潛伴送 API
- 空名字的潛伴留在 local state（form 還在），等使用者填名字才存 DB

### 統一用詞「潛伴」
- 朋友 #N → 潛伴 #N
- 同伴 / 朋友 → 潛伴
- 常用同伴 → 常用潛伴
- 新增同伴 → 新增潛伴

## 20260513_12 — 2026-05-13 (Profile 加 Admin 入口 + 朋友 header 整排可收合)

### 個人頁加 Admin/教練 後台入口
- `role=admin` → 看到「Admin 主控台」卡片 → 連 `/liff/admin/dashboard`
- `role=coach` → 看到「教練後台」卡片 → 連 `/liff/coach/today`
- 一般客戶看不到（不會被誤導）

### 朋友 #N 整排 header 可點收合
- 之前只有 X 按鈕能收，現在整個「朋友 #1 李大華・AOW」標題列都能點
- 加 ChevronUp 視覺指示
- 刪除按鈕仍獨立可點，不會誤觸

### LiffProvider 支援 NEXT_PUBLIC_MOCK_USER_ID
- 本地 dev 連 production DB 時，可用此 env 以指定 lineUserId 登入
- 預設仍為 U_mock_dev_user_0001 (向後相容)

## 20260513_11 — 2026-05-13 (訊息模板 admin 可編輯)

### `/liff/admin/templates` 新頁面
- 列出 10 個 Flex 模板（預約確認/D-1提醒/訂金通知/訂金確認/尾款提醒/行前手冊/天氣取消/週報/超賣警示/歡迎）
- 每個模板可改：標題、副標、說明文字、按鈕文字、通知列文字
- 「試送到我自己」按鈕 → 推到當前 admin 的 LINE 即時看效果
- 「還原預設」一鍵移除覆寫
- 動態資料（客戶名/日期/金額）仍由系統填，admin 只改文字描述

### 新 DB 表
- `MessageTemplate (key + title + subtitle + bodyText + buttonLabel + altText + updatedBy)`

### 程式架構
- `buildFlexByKey()` 同步（不讀 DB），舊呼叫位點保持效能
- `buildFlexByKeyAsync()` 新非同步版（讀 DB override 套用）
- 10 個 factory 改成接受 `override?: TemplateOverride` 參數
- `_common.ts` 加 `ovr(override, field, defaultValue)` helper
- `index.ts` 加 `FLEX_EDITABLE_FIELDS` 定義每個模板哪些欄位可改

### Admin Dashboard
- 加「訊息模板」入口

## 20260513_10 — 2026-05-13 (改用 CWA 即時測站 + 風速判斷)

### 天氣自動取消用對的資料源
- 之前用的 F-A0085-002 是「冷傷害指數」不是海象，所以抓不到浪高
- 改用 **O-A0001-001 即時測站觀測**，抓 466940 基隆 + 467080 宜蘭兩站風速
- 用 **WindSpeed** 取代浪高判斷 (CWA 即時資料沒提供 wave height)
- 閾值改為 **WEATHER_WIND_THRESHOLD** (預設 10 m/s ≈ Beaufort 5「強風」)
- 新增 `WEATHER_STATIONS` env (預設 `466940,467080`)
- 取多站最大值判斷，覆蓋面更廣
- 測試模式：`?force_wind=15` 強制觸發、`?dry_run=1` 模擬不真的取消

### 為何不用浪高？
- CWA 開放資料的浪高需要的 endpoint F-A0017-001 / F-B0058-001 等都 `Resource not found`
- 即時觀測站只有風速、風向、陣風
- 風速 10 m/s 約等於 Beaufort 5「強風」、浪高約 1.5-2m，跟原本浪高 1.5m 閾值差不多

## 20260513_09 — 2026-05-13 (修 cron null 防呆)

- 既有 tour rows 升級後 `*ReminderDays` 為 null，補 `?? 3` 防呆預設
- 使用者編輯該團時可在 `/liff/admin/trips` 設定實際天數

## 20260513_08 — 2026-05-13 (大整修：開團 CRUD + 超賣 + 天氣 + LTV + 週報)

### A. 開團設定 (Admin trips CRUD)
- 新頁 `/liff/admin/trips` 兩個 tab：日潛場次 / 旅行團
- 新增 / 編輯 / 取消 場次（可選潛點、教練、計價、容量）
- 新增 / 編輯 / 停用 旅行團（總價、訂金、截止日、提醒天數）
- 6 個新 admin API：`/api/admin/{trips,tours}` 與 `/[id]`、`/api/admin/{sites,coaches}`
- Dashboard 新增「開團管理」入口

### A. 超賣邏輯
- `DivingTrip.capacity` 改為可選（null = 無上限）
- `Booking.overCapacity Boolean` 新欄位
- `/api/bookings/daily` 不再硬擋超賣，照樣接單 + 推 Flex 給教練處理
- 新 Flex `overcap_alert` (推教練)
- 教練端 today 顯示超賣 badge

### A. 旅行團提醒天數可設定
- `TourPackage` 新增 `depositReminderDays` `finalReminderDays` `guideReminderDays`
- Cron `/api/cron/reminders` 改讀每團的設定動態計算 D-N

### B. Bug fixes
- B1: `/api/trips` booked 排除 cancelled / weather / no_show 三種狀態
- B2: `/api/admin/bookings` 回傳 ref（trip 日期+時間/旅行團名）；前端顯示 trip date+time，不再用時區轉換把 08:00 顯示成 02:00
- B3: LiffShell title `truncate whitespace-nowrap` 不再折行
- B4: payment-proofs API 對 private bucket 回 `publicUrl: null`

### C. Welcome Flex
- 第一次加好友 → 推 Flex 卡片（不再是純文字訊息）
- 新 Flex template `welcome`

### D1. 天氣自動取消
- 新 cron `/api/cron/weather-check`
- 抓中央氣象局浪高（需要 `CWA_API_KEY` env）
- 浪高 > `WEATHER_WAVE_THRESHOLD` (預設 1.5m) 自動把當日 open 場次標為 cancelled_by_weather
- 自動推 Flex `weather_cancel` 給所有已預約客戶

### D3. LTV / 黑名單
- User schema 新增 `noShowCount`、`blacklisted`、`blacklistReason`、`vipLevel`
- `/api/admin/users` 回傳每位客戶的 LTV stats (總預約 / 完成 / 取消 / no-show / revenue / potential)
- `POST /api/admin/users` 可改 role / blacklist / vipLevel
- 預約時擋黑名單 → 回 403

### D6. Admin 週報
- 新 cron `/api/cron/admin-weekly`
- 每週一 09:00 (Asia/Taipei) → Cronicle 觸發
- 計算上週新預約 / 完成 / 取消 / 收入 / 最熱門潛點
- 推 Flex `admin_weekly` 給所有 role=admin 的 User

### E4. 錯誤監控
- 新 `src/lib/error-report.ts`
- 後端 reportError(err, ctx) 寫 console + 推 LINE 給 admin（環境變數 `ADMIN_LINE_USER_IDS`）
- 留位給 Sentry / Better Stack 接口

### Cronicle 新增的 Job
- `weather-check`: `0 22 * * *` (台北 06:00) POST `/api/cron/weather-check`
- `admin-weekly`: `0 1 * * 1` (台北每週一 09:00) POST `/api/cron/admin-weekly`

## 20260513_07 — 2026-05-13 (修同伴刪除 race condition)

### 修「點刪除同伴沒反應」bug
- `removeCompanion` 改用 React functional update 拿最新陣列
- `persistCompanions` 一開始就 cancel pending debounce timer，避免覆寫
- 樂觀更新：UI 先響應，PATCH 失敗才回滾並 alert + reload
- `updateCompanion` 也改用 functional update，避免閉包陳舊 (stale closure)

### 根本原因
舊版的 debounce 寫入計時器，如果在使用者按刪除前 600ms 內有打字，
刪除按下後 timer 還在排隊，刪除完之後 timer 觸發又把舊資料 PATCH 回去。

## 20260513_06 — 2026-05-13 (Profile 統計卡可點 + 改名)

### Profile 統計卡互動化
- 「累計 Log」→「潛水次數」（更白話）
- 「預約紀錄」可點 → 跳出 Dialog 顯示完整預約清單（按時間/狀態排）
- 「已完成」可點 → 跳出 Dialog 只顯示 status=completed 的紀錄
- Dialog 內每筆 booking：圖示（⚓ 日潛 / 📅 旅行團）、場次/旅行團名、日期時間、人數、狀態 badge、金額
- 點選列表項目跳到 `/liff/my?just=<bookingId>` 看詳情
- 0 次的數字不可點（disabled）

## 20260513_05 — 2026-05-13 (Wordmark 改名 + idToken 自動刷新 + 同伴選單突顯)

### Wordmark / Header
- 「海王子」→「東北角海王子潛水」（全名）
- 「DIVING TEAM」→ 改顯示 `v<APP_VERSION>` 動態版本
- LiffShell 不再額外顯示版本（避免重複）

### LIFF idToken 修正
- 修「確認預約 HTTP 401 missing idToken」bug
- `fetchWithAuth` 每次都呼叫 `liff.getIDToken()` 抓最新 token
- 沒有 idToken → 自動 `liff.login()` 重新導向授權
- 解決使用者填很久表單後 idToken 過期送出失敗的情境

### 同伴選單突顯
- 預約表單同伴 #N 展開時，最上方顯示「從常用同伴選」的大型 chip group
- 點 chip 一鍵帶入該同伴資料
- 另有「+ 手動輸入」chip 回到空表單

## 20260513_04 — 2026-05-13 (個人資料頁折疊 + Header 版本顯示 + 對比修正)

### 個人資料頁全面折疊
- `/liff/profile` 改用同一個 `<CollapsibleCard>`
- 個人資料、緊急聯絡人、常用同伴三大區塊都可獨立折疊
- 自動展開：載入後若必填缺，自動展開該區
- 自動儲存：欄位變動 600ms debounce 後自動 PATCH `/api/me`（不再有「儲存」按鈕）
- 同伴卡片用 inline editor，每位都有完整欄位（姓名/手機/證照/編號/支數/關係）
- 折疊摘要 → 完成顯示 ✓「姓名・證照・電話・關係」、未填顯示紅色「尚未填寫」

### Header 顯示版本
- LiffShell header 左側 Logo 旁邊加上 `v20260513_04` 小字
- 移除右下角 footer 版本（避免重複）

### 對比 / 可讀性修正
- `/liff/dive/date/[date]` 移除整頁 midnight 主題（之前若任一場次是夜潛就會整頁變深）
- 夜潛卡片自身保留深色主題（差異化展示），其他白色卡片回復清晰對比

### 共用元件
- 抽出 `src/components/ui/collapsible-card.tsx` 給 booking 頁、profile 頁共用

## 20260513_03 — 2026-05-13 (預約 UX 重構 + Landing Page)

### 預約表單可折疊重構
- 「個人資料」拆出獨立 collapsible Card
- 「緊急聯絡人」拆出獨立 collapsible Card（先前在同一張卡內）
- 同伴 #N 每位都是 collapsible 卡
- 折疊摘要：完成顯示「✓ 姓名・手機・證照・累計支數」、未填顯示「必填」紅色提示
- 自動展開邏輯：載入 `/api/me` 後若必填欄位缺，自動展開該段；填齊自動收回
- 新增 `<CollapsibleCard>` 共用元件

### 根網址 Landing Page
- `/` 不再直接 redirect 到 `/liff/welcome`
- 改顯示行銷風格 landing：深海背景 + 品牌色漸層標題
- 主 CTA 按鈕「開啟 LINE 預約」連向 `https://liff.line.me/<LIFF_ID>`
- 處理「使用者在桌面瀏覽器分享連結點進來」的情境

## 20260512_02 — 2026-05-12 (Cron Bearer auth + Cronicle 整合)

### Cron / 排程
- `/api/cron/reminders` 認證改為 `Authorization: Bearer <CRON_SECRET>` header（舊 `?token=` 樣式移除）
- 新增 `?pollWindowMinutes=30` 參數（回應 body 也帶上，方便對齊 cron 頻率紀錄）
- 支援 POST（Cronicle 標準呼叫）與 GET（瀏覽器手動測試）
- 回應 body 新增 `errors[]` 與 `tookMs`，方便排錯
- 環境變數 `CRON_TOKEN` → `CRON_SECRET`（值不變，請手動到 Zeabur env 改名）
- 新增 `docs/CRON_SETUP.md`：完整 Cronicle 設定 SOP（對齊其他專案如 its-17-time）
- 排程改由共用 Cronicle (https://neowu-cron-hub.zeabur.app) 觸發，未來所有專案 cron 統一在此處管理

## 20260512_01 — 2026-05-12 (UX iteration + 同伴系統 + GitHub/Zeabur 部署版本)

### UX 大整修（依使用者回饋）
- **行事曆三檢視 → 精簡為兩檢視**：本週 / 近 3 週 / 整月 → 近 2 週 (預設) / 本月
- **行事曆預覽卡**加上「`X 潛`」灰色 badge、「`水推`」金色 badge；日期欄補上週幾（週一/週二...）
- **Header 全站重排**：海王子 Logo 固定左上（點按回首頁）、頁面標題 + 返回鈕 + 動作 slot 移到右側
- **返回鈕** 改用 `router.back()` 永遠回實際進入的上一頁（修掉硬寫 backHref 跳錯頁的 bug）
- **預約頁緊湊化**：trip info 卡改成跟行事曆預覽卡一致排版；個人資料 Y 軸從 7 列壓到 4 列（姓名+手機同排、證照下拉+累計潛水支數同排、緊急聯絡人三欄並排）
- **證照等級** pill 群 → 原生 `<select>` 下拉（手機跳系統 picker，UX 更精準）

### 新功能：同伴系統
- Prisma schema 新增 `User.companions Json`、`Booking.participantDetails Json`
- `/api/me` 接 companions 讀寫
- `/api/bookings/daily` 接 `participantDetails`，並自動把新同伴 merge 到 user.companions（去重）
- **預約表單**：載入時自動 pre-fill 本人資料；人數 > 1 時動態展開 N-1 個「同伴 #N」slot
- **同伴 slot**：右上有下拉選單可從常用同伴一鍵帶入；也可手動輸入
- **Profile 頁** 加「常用同伴」CRUD（新增 / 編輯 / 刪除，全部即時 PATCH）

### 新功能：裝備數量
- `rentalGear` schema 加 `qty` 欄位
- 計價邏輯變更：原本 `(base + gear) × people` → 新版 `base × people + Σ(gear.price × gear.qty)`
- 預約頁裝備 Dialog 改成每件 `−[qty]+` stepper（2 人共用 1 件 BCD 可正確計價）
- 預約 chips 顯示 `BCD ×2 +400`
- EditBookingDialog 同步支援

### 新功能：訂單編輯 / 取消
- `PATCH /api/bookings/[id]` — 修改 participants / tankCount / rentalGear / notes（含容量重檢 + 總額重算）
- `DELETE /api/bookings/[id]` — 自取消（轉成 cancelled_by_user）
- 「我的預約」每筆訂單加「修改」按鈕 → EditDialog 含人數 stepper + 裝備 + 備註 + 取消預約（兩段確認）

### 新功能：日潛付款確認
- 「我的預約」日潛訂單也顯示 gold「付款確認」按鈕（原本只有旅行團）
- 付款頁偵測 `type === "daily"` 隱藏訂金/尾款 tabs（日潛只有一筆全款）
- 提示框說明「現場現金」vs「事前匯款」兩種付款方式

### 開發體驗
- **Mock 模式 401 bug 修復**：LiffProvider 在 mock 模式不送 Bearer header（假 token 過不了 LINE JWKS）
- **R2 重構為雙 bucket**：`payments/avatars` → private、`sites/richmenu` → public，配合使用者提供的 R2 設定
- 新增 `/api/uploads/preview` 供教練看 private bucket 內的轉帳截圖

## 20260511_00 — 2026-05-11 (Initial bootstrap + 本機 e2e 驗證)

### e2e 驗證（25 項全綠，文件詳見 STATUS.md）
- 客戶日潛 / 旅行團預約 / Profile 讀寫
- 付款證明上傳 → 教練核可 → DB 自動更新 paymentStatus + status
- Admin stats / users / CSV / broadcast (Flex multicast)
- Webhook HMAC 驗章（bad sig → 401，valid sig → 200，follow event upsert user）
- Capacity check / role guard / cron token gating

### Minor fixes during testing
- `/api/bookings/my` 回傳補上 `participants` 欄位
- Webhook 歡迎訊息更新（移除過時的 "Phase 2 才會做完整 Rich Menu" 文案）
- 將 `r2.ts` 改為雙 bucket 模型（public / private），對應 user 提供的設定
- 新增 `/api/uploads/preview` 給教練看 private bucket 的轉帳截圖

### 已知 pending（等使用者提供）
- R2 access keys + bucket CORS
- 銀行匯款資訊 (BANK_*)

### Initial scope

從零打底完整 LIFF 訂閱 App，整合前一版 (20260507_LINE-haiwangzi) 的後端（Prisma schema + 18 條 API）並重寫前端。

### Added (初始建置)
- Next.js 16.2.3 + Tailwind v4 + shadcn/ui（New York / neutral，覆寫品牌 token）
- Brand: Logo / Wordmark / 色票（Deep Ocean #0A2342、Phosphor #00D9CB、Coral #FF7B5A、Gold #FFB800、Midnight #0F1B2D）
- 7 個客戶端頁面（welcome / calendar / dive/date / dive/trip / tour / tour/[id] / my / profile / payment）
- 3 個教練端頁面（coach/today / coach/payment / coach/schedule）
- 6 個 Admin 頁面（dashboard / users / bookings / broadcast / reports / settings）
- `useLiff()` hook + LiffProvider 含桌面 mock mode（`NEXT_PUBLIC_LIFF_MOCK=1`）
- 取消政策三層簽署（閱讀 → 同意 → 電子簽名）
- 旅行團訂金/尾款進度條（4 階段：預約 → 訂金 → 尾款 → 出發）
- 教練端「滑動確認 / 對話框預覽」收款核對流程
- R2 直傳：`POST /api/uploads/presign` 回 presigned PUT URL，client 直接 PUT binary 到 R2
- 付款上傳 page 有 R2 fallback → base64（無 R2 設定時走 dev fallback）
- `POST /api/admin/broadcast` Flex multicast + dry-run 預覽模式
- 8 個 Flex Message factory（`src/lib/flex/`）
- `POST /api/admin/richmenu/sync?role=...` 上傳 Rich Menu 到 LINE
- `scripts/build-richmenu.ts` 用 `@napi-rs/canvas` 產 2500×1686 PNG（三角色版本）
- `GET /api/cron/reminders?token=...` D-1 + D-3 + 出發前提醒（避免重複發 via `reminder_logs`）
- `/api/admin/bookings/csv` CSV 匯出（UTF-8 BOM 防 Excel 亂碼）
- `GET /api/me` + `PATCH /api/me`（profile 編輯）
- Webhook 路徑修正成新前端的 `/liff/calendar` `/liff/tour` `/liff/my` `/liff/admin`

### Infra
- `Dockerfile`（multi-stage, node:22-alpine, standalone）
- `.dockerignore`（排除 ux-design / postgres-data / node_modules / .env）
- `zeabur.json`
- `next.config.ts` 設 `output: "standalone"`，images.remotePatterns 加入 R2 與 LINE CDN
- `docker-compose.yml`（Postgres 16-alpine）

### Notes
- 教練滑動收款的 OCR 比對先做 UI（手動輸入後 5 碼）；真 OCR engine 不在本期範圍
- 線上金流不在本期範圍（設計上即為當日現場收 / 銀行匯款 + 截圖驗證）
- 多語系（i18n）不在本期範圍 — 全站固定繁體中文
