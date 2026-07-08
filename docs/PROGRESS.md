# 開發進度日誌（PROGRESS）

> 給「下次接手的人 / AI」看的。最新在最上面。每則記：完成什麼、改了哪些重要檔案、做了哪些決策、卡在哪、下次先看什麼。
> 版本規則 `YYYYMMDD_NN`（`src/lib/version.ts`，每次 push 必 bump）。部署 = push 到 `master` → Zeabur 自動部署 → 驗 `curl https://haiwangzi.xyz/api/healthz`。

---

## 2026-07-03 — 通知按鈕連結對齊各自語意（深連結）+ 對照文件（v795–796）

老闆審核發現多個模板「按鈕文字說要去某頁、實際只開 LIFF 首頁/welcome」。逐一改成對應深連結（連結來源是各 call site 的 `params.liffUrl`/`params.url`，非 flex 預設）：

- **v795**：訊息模板「按鈕連結」編輯欄改為**顯示系統預設網址**（原本留空）。
- **v796 連結對齊**（改 call site params）：
  - VIP升等 → `/profile`；首單獎勵「查看抵用金」→ `/profile`（抵用金明細在個人中心）
  - 生日禮金/抵用金到期「立即使用」→ `/booking`
  - 訂單取消「查看我的預約」→ `/my`
  - 付款駁回「重新上傳」→ `/payment/{訂單ID}`（**精準深連結**，帶 `proof.bookingId`）
  - 天氣取消「聯繫教練改期」→ 小編 LINE OA（`line.me/R/ti/p/%40894bpmew`）；weather-cancel route + weather-check cron 兩處
  - 退款申請 → `/refund/{id}`（原本就已精準，無需改）
  - 動檔：attendance route、birthday-credits cron + backfill、credit-expiry cron、first-order-reward.ts、bookings/[id] route、payment-proofs reject route、weather-cancel route、weather-check cron
  - `templates/route.ts` `DEFAULT_BTN_URL` 顯示預設對齊實際連結。
- **文件**：新增 `docs/notification-button-links.md`（所有模板 按鈕文字×連結×落點頁 對照表 + 維護說明）。
- build 通過(exit 0)。動態連結(付款/退款/預約/訂金/尾款/D-1)由發送當下帶 ID；後台編輯欄若填死網址會失去帶 ID 深連結（文件已註明）。

## 2026-07-03 — 按鈕連結可編輯推廣到所有訊息模板（v794）

承 v792（只到場確認可編輯按鈕連結）→ 老闆要**所有**模板都能編輯按鈕文字＋連結。集中式做法（不逐檔改 20 個模板）：

- **UI**：`/api/admin/templates` GET 對每個「有 buttonLabel」的模板，自動在其後注入「按鈕連結（留空＝系統預設）」欄位（已內建 buttonUrl 的到場確認維持自己的預設）。前端 render/save 皆通用。
- **LINE flex**：`flex/index.ts` 加 `applyButtonUrlOverride()`——遞迴找 flex 內第一顆 uri 按鈕、換成 `override.buttonUrl`（留空不動）。在 `buildFlexByKeyAsync` / `buildFlexWithOverride` 兩個讀 override 的建構點套用 → 所有模板通用。
- **Email**：`composeEmail` 改 `buttonUrl = msgField(buttonUrl) || EMAIL_BUTTON_URL`（填了用它、留空維持小編 LINE）。
- **站內**：`notify-template` linkUrl 改 `opts.linkUrl ?? 後台 buttonUrl ?? (到場確認→評論預設 / 其餘→resolveLinkUrl)`。
- 語意：**留空＝各模板原本的系統預設連結；填了＝三管道(LINE/Email/站內)都用這個連結**。`button_url` 欄 v792 已建。
- build 通過(exit 0)。

## 2026-07-03 — 訊息模板版面/按鈕連結可編輯 + 手機 LINE 直通後台（v791–793）

- **v791**：修 Email 版「五星評價」按鈕連錯（原所有 Email 按鈕統一導小編 LINE）→ 到場確認例外連 Google 評論。
- **v792**（老闆兩點）：① 訊息模板左欄「依流程選擇」300px→**400px**，與右欄「發送預覽」同寬。② **按鈕連結後台可編輯**：`MessageTemplate.button_url`(schema+migrate-safety `ADD COLUMN IF NOT EXISTS button_url`)；到場確認 editableFields 在「按鈕文字」下加「按鈕連結」欄(預設 Google 評論)；LINE flex(`ovr buttonUrl`)/Email(`msgField buttonUrl`)/站內(`tpl.buttonUrl`) 三管道皆讀此欄；templates GET/POST 收發。改連結免改程式。
- **v793 手機 LINE 直通後台**：老闆反映 LIFF 個人中心「後台管理」連到 `/admin/m` 需再輸帳密。新增橋接 `POST /api/admin-web/liff-session`：驗 LINE idToken + 後台角色白名單(同密碼登入那道門)→ 換發 admin-web JWT。`/liff/profile` 的「後台管理」改為按鈕：`fetchWithAuth` 取 token → `setAdminToken/setAdminUser`(localStorage) → 導向 `/admin/m`(同源，token 續存即登入)。**boss/it/admin 免帳密直接進手機簡易後台**；教練仍走 `/liff/coach/today`。
- build 皆通過(exit 0)。**⚠️ LIFF 需真機在 LINE 內驗證**。

## 2026-07-03 — Email 寄不出去排查 + 到場確認「海王子評論」可點連結（v784–785）

- **v784 Email 診斷**：老闆反映「Email 寄不出去」。查證近期無寄信碼變更（最後一次 v615），寄信走 Gmail SMTP（`src/lib/email/send.ts`，`GMAIL_USER`+`GMAIL_APP_PASSWORD`）→ 疑似**金鑰輪換(v773–775)後 Zeabur `GMAIL_APP_PASSWORD` 未同步/被撤銷**。加 `verifyEmailTransport()` + `/api/healthz?email=1`（實際對 Gmail SMTP `verify()`、不寄信、不外洩金鑰），可遠端區分「env 沒設」vs「密碼錯」。**修法在 Zeabur 端**（老闆自行：Google 應用程式密碼重建 → 更新 Zeabur 變數 → 重啟）。診斷端點另有既有 `/api/dev/test-email`（Bearer CRON_SECRET）。
- **v785 到場確認評論連結**：老闆要 URL 變可點的「海王子評論」而非裸網址。純文字管道(站內/email body)無法藏 href，故改用各管道連結機制：LINE flex 好評按鈕標籤→「⭐ 海王子評論」；站內通知 `linkUrl`(attendance_confirmed)→評論網址(點卡片即開)；內文移除長網址改乾淨 CTA。`message-content.ts`/`notify-template.ts`/`flex/attendance-confirmed.ts`。
- build 皆通過(exit 0)。

## 2026-07-03 — 付款方式按鈕加大 + 停用匯款自動取消(留提醒) + 已付老闆提示（v783）

老闆三點：

1. **付款方式按鈕加大**（手機好點）：`/pay/[id]` 與 `/liff/payment/[bookingId]` 的 銀行轉帳／LINE Pay／其他 三顆改成大圖示(3xl~4xl)+粗體標籤+高 padding(py-5~6)+active 縮放回饋。
2. **停用「匯款未繳自動取消」**：`src/app/api/cron/payment-reminders/route.ts` 加旗標 `AUTO_CANCEL_UNPAID_ENABLED=false`，逾期不再改 `cancelled_unpaid`；**D+2 / D+7 提醒照發**。D+7 文案移除「將自動取消」威脅字樣。要恢復把旗標改 true 即可。
3. **提醒「已付給老闆請點其他」**：付款頁(兩處)加黃色提示卡；D+2/D+7 提醒訊息加「💡 已直接付款給老闆？請改選『其他』並註明，不必再匯款」。
- 註：老闆端「提醒」目前靠 老闆結帳「待匯款」清單(v776) + 每日訂單信，非逐筆推播（避免洗版）；若要逐筆推老闆可再加。
- `npm run build` 通過（exit 0）。

## 2026-07-03 — 到場確認加五星好評邀請 + 一鍵補推 + 場次備註欄合併（v782）

老闆三件事：

1. **場次表單合併欄位**：移除「日潛水備註(內部)」(`notes`)，只留「📣 活動提醒事項」(`activityNote`，客戶可見)，placeholder/說明補上「天氣/裝備/注意事項」。以後一個欄位、不再有內部/客戶兩套造成混淆。動 `src/app/admin/trips/page.tsx`。
2. **到場確認訊息(attendance_confirmed)加料 + 活潑化**：`src/lib/flex/attendance-confirmed.ts` body 改「🎉 謝謝你和東北海王子潛水一起下水！」+ 五星好評邀請 + 歡迎回饋；footer 加主按鈕「⭐ 給我們五星好評」(Google Maps 連結 `https://maps.app.goo.gl/L58ukZuJroo5vbjv5`，可由 `params.reviewUrl` 覆寫)，原「查看紀錄」降為次要 link。text/email 版同步(`message-content.ts`)。
3. **一鍵補推**（之前有客戶沒收到）：
   - 新欄位 `Booking.reviewSentAt`（schema + `migrate-safety.js` `ADD COLUMN IF NOT EXISTS review_sent_at`）。到場點名發送 attendance_confirmed 時蓋章。
   - 新 API `/api/admin/backfill-attendance-review`（限老闆）：GET 回近 N 天(預設45) `status=completed && review_sent_at IS NULL` 筆數；POST 補發 attendance_confirmed 並蓋章(防重複，單批上限 200)。
   - 訊息模板頁「到場確認」面板加按鈕「🔔 一鍵補推近 45 天漏發的」→ 先問數量再送。
- `npm run db:generate` + `npm run build` 通過（exit 0，新路由已註冊）。
- **⚠️ 部署注意**：`review_sent_at` 欄由 migrate-safety 於部署時建（app 服務前），安全；attendance 蓋章有 `.catch()` 不擋點名。LINE 實際推播需真機看。

## 2026-07-03 — 潛水員踢水 loading 動畫（上傳/讀取「處理中」回饋）（v781）

老闆反映：手機上傳付款證明時，因每人網速不同，看不出是否正在上傳。做一個**純 CSS 潛水員踢水動畫**當「處理中」回饋，並盤點上傳/大量讀取的頁面一起導入。

- **元件** `src/components/ui/DiverLoader.tsx`：inline SVG 潛水員（氣瓶/面鏡/蛙鞋）+ 交替踢水 + 上升氣泡，keyframes 放 `globals.css`（`.hwz-diver-*`，全域一次不重複注入）。純 CSS 無外部資源（~1KB，合手機鐵則）；支援 `prefers-reduced-motion`。props：`label`/`subLabel`/`size`/`overlay`（全螢幕半透明遮罩擋重複送出）。
- **導入（上傳類，overlay 遮罩）**：付款證明上傳 `/pay/[id]`、`/liff/payment/[bookingId]`；預約送出（含簽名上傳）`/liff/dive/trip/[tripId]`、`/liff/tour/[packageId]`。
- **導入（大量讀取，一次全換）**：共用 `LiffLoading` 的 `bubbles` 變體（首頁/內容載入用）**升級為潛水員** → 所有用 `variant="bubbles"` 的頁面（潛旅/場次詳情/社群/付款頁初載）自動換上，免逐頁改。`skeleton`（列表骨架）與 `ring`（短操作）維持不變。
- `npm run build` 通過（exit 0）。
- 待辦（同模式可續接）：m2 下單送出、教練照片上傳、後台大型列表初載。

## 2026-07-03 — 手機 LIFF 老闆結帳待收款 + 訂單管理結清也同步狀態（v779）

承 v778：老闆要「一筆訂單兩個狀態（`status` 到場軸 ↔ `paymentStatus` 收款軸）要同步」，並要手機版老闆結帳。

- **狀態同步定義**：兩軸刻意獨立（可先到場後收款、或先收款後到場），「同步」不是永遠相等，而是**任何操作按鈕都必須同時推進兩軸到有效終態，不能只動一軸留下孤兒**。終態＝`completed+fully_paid`／`no_show+*`／`cancelled+*`。
- **補最後一個「半同步」按鈕**：訂單管理 v752「一鍵現場收現結清」原本只收款不標到場 → 加上「活動日 ≤ 今天且未到場 → 一併 attendance completed」（[bookings/page.tsx](src/app/admin/bookings/page.tsx) `settleCashOwed`）。至此所有現場收現入口（老闆結帳 v778 / 手機點名 v755 / 教練LIFF v777 / 訂單管理 v779）都是 settle+attend 原子動作。
- **手機 LIFF 老闆結帳待收款**（老闆專用、LINE 登入免帳密）：
  - 新 API `GET /api/admin/settle-pending`（requireRole admin）→ 回 status∈{pending,completed} 且應付>0 的單，附活動日/場次。
  - 新頁 `/liff/coach/settle`：三桶（現場付款·逾期 / 已到場·未付清 / 待匯款）+ 一鍵「現場收現・結清」（payment-entry cash + 活動已到日則 attendance）。教練今日頁 `/liff/coach/today` 加老闆專用入口卡。
  - 不限今天（桌機老闆結帳的手機版）；`/liff/coach/today` 仍只處理今日場次點名。
- `npm run build` 通過（exit 0，新路由 `/api/admin/settle-pending`、`/liff/coach/settle` 已註冊）。
- **⚠️ LIFF 待真機驗證**：只能在 LINE App 內跑；伺服器權限不變（settle-pending 限老闆、payment-entry 限老闆）。
- 殘留邊界（非本次衝突、已知）：`confirmed+fully_paid+活動已過但沒點名` = 潛數未計的「忘記點名」單，不在收款待辦；未來可加「逾期未點名」提醒。

## 2026-07-03 — 老闆結帳「現場收現・結清」改原子動作：付款狀態↔訂單狀態同步（v778）

老闆截圖回報：「現場付款/逾期待結案」與「已到場・未付清」**兩個狀態沒有同步**。根因：桌機老闆結帳頁那兩區的「現場收現/結清」按鈕**只是連到訂單管理的 `<Link>`，不是動作**。就算在訂單管理收了現金（payment-entry），`status` 也不會前進（payment-entry 不碰 status）→ 收了錢卻停在 `pending`，付款狀態與訂單狀態各走各的。手機/教練端反而正確（先收現再標到場一起做）。

- **修正**：`src/app/admin/tonight/page.tsx` 新增 `settleOnsite(b)` 原子動作，取代原本的 `<Link>`：
  1. 有欠款 → `POST payment-entry {kind:cash}`（paidAmount=total、paymentStatus=fully_paid、paymentMethod=cash）。
  2. 活動日 ≤ 今天且尚未到場 → `POST attendance {completed}`（status=completed、累積潛數、重算 VIP）。
  3. reload。兩件做完該筆即離開所有待辦區，不再「收了錢停在 pending」。
- 「待匯款」區維持連到訂單管理催繳（那是等客戶匯款、非現場動作）。
- `npm run build` 通過（exit 0）。
- 註：訂單管理頁 v753「一鍵現場收現結清」目前仍只收款不標到場（同源問題）；本版先修老闆結帳頁（老闆點截圖處）。若要全站一致，下輪把該按鈕也併入 settle+attend。

## 2026-07-07 — 新增對外「會員優惠」頁 /rewards（v819）

老闆要一份對外優惠說明頁（原本全站沒有，資料只散在後台+登入後會員中心）。先做成 Artifact 預覽、老闆逐項修改（刪掉所有裝備租借折扣/電子報/生日折扣/高氧升級/健檢/VIP客服/海外保證名額等；LV5 升等禮金 3000→2500、滿級每50潛 1000→1500；註冊改「且 Email 認證」），確認後接進官網。

- 新頁 `src/app/rewards/page.tsx`：**全域純靜態行銷內容→直接寫常數、零 DB**（分層鐵則第1層）。手機優先：VIP 卡在手機改「徽章置頂→福利分隔清單」、抵用金單欄、區塊堆疊、內文放大。CSS 全部 scope 在 `.rwd` 下（`<style dangerouslySetInnerHTML>`）避免撞全站樣式；light-only（配合全站）。
- 內容：VIP 五潛級(升等禮金 50→2500)、6 種抵用金、課程加贈、限時優惠、使用規則、加 LINE CTA。
- 入口：桌機首頁頁尾 `DesktopHome.tsx` + 手機首頁頁尾 `MobileHome.tsx` 連結區各加「會員優惠」。
- 驗證：dev server 預覽（port autoPort）確認 `/rewards` 200、scoped CSS 生效、手機 375px 無溢出、VIP 卡 block 佈局、資料正確。build 通過(exit 0)。
- ⚠️ 此頁是**靜態行銷文案**，與後台實際數值(vip-tier.ts LV5=3000/overflow=1000)**不會連動**；若老闆要，另需把後台 upgradeCredit LV5 改 2500、overflow 改 1500 對齊。LIFF FAQ 的 LV2 潛次(11)與實際(21)不一致也待修。

## 2026-07-07 — AI 小幫手 Markdown 渲染（連結可點/粗體/項目）（v818）

老闆：小幫手回覆把 `[場次表](url)` 當純文字顯示、無法點，連結應整合成可點元素。查因：assistant route（v769）**刻意叫 LLM 用 Markdown 連結**附場次表等，但 ChatWidget 用 `whiteSpace:pre-wrap` 純文字渲染 → `**粗體**`、`*` 項目、`[文字](網址)` 全變 raw 文字。

- **ChatWidget（`src/components/assistant/ChatWidget.tsx`）修正**：
  - `extractRichLinks(raw)`：抽出 Markdown 連結 + 殘留裸網址 → 可點膠囊(`m.links`)，站內絕對網址轉相對(app 內開)，line.me 保留新分頁；抽走後清掉只剩表情/符號的空行。
  - `RichText`：輕量渲染 `**粗體**` + `*`/`-`/`・` 項目符號 + 換行（連結已抽走）。
  - `send()` 用 extractRichLinks 存乾淨內文 + links；AI 訊息(非打字中)改用 `<RichText>`；`TypeText` 打字階段先去 `**`。
  - node 實測截圖原句：`[場次表](https://haiwangzi.xyz/schedule)`→膠囊 `場次表`→`/schedule`，孤兒 `📋` 行自動移除，粗體/項目保留。
- 全面確認：選單 answer 無 markdown（用結構化 links）；fetchLive content 無裸 URL；只有 LLM 自由回覆有此問題，已一併解決。
- build 通過(exit 0)。

## 2026-07-07 — 船潛費用「顯示估價」全站對齊（v813）

老闆：桌機船潛費用與手機不一樣（萬安艦船潛桌機顯示每人 14,400，實際應 ~4,800）。

- **根因**：船潛 `extraTank` 是「每人整包價」(固定潛次)，岸潛才是「每支×支數」。**伺服器端計算(api/bookings/daily:242)與下單頁本就正確判了 `isBoat`——所以實際沒收錯錢**，錯的全是「前端顯示估價」漏判 isBoat，把套裝價又乘了潛數(4800×3=14400)。編輯訂單存檔送的是參數(participants/tankCount)非金額、由伺服器重算，故也沒存錯。
- **全站盤點並修正 6 處顯示 + 1 後台**（統一 `isBoat ? extraTank : extraTank × tankCount`）：
  1. 桌機卡片估價 `pclogin/PcLoginApp.tsx:728`（用戶看到的那個）
  2. 手機日潛列表估價 `liff/dive/date/[date]:68`（+型別補 isBoat）
  3-6. 手機「我的訂單」`liff/my`：潛水內容摘要、每支潛水小計、編輯明細、編輯總計（tripPricing 補 isBoat，來源 `/api/trips/[id]` 用 `...trip` 已含）
  7. 後台預估收費 fallback `admin/trips:214`（僅無實際 revenue 時用，低影響）
- 資料源都已回 isBoat（`/api/trips` list 與 `/api/trips/[id]` 皆 `...trip`/明列），不必改 API。
- build 通過(exit 0)。LIFF/pclogin 需真 LINE 登入，無法用 dev server 預覽；伺服器計算未動、金額正確性不受影響。

## 2026-07-07 — 桌機 LINE 登入真正修好：callback 路徑對齊（v812）

老闆授權我用 computer use + Zeabur/LINE Console 直接處理。實地查出**真正 root cause**（跟先前推測的 channel 失效無關）：

- **Zeabur 早已正確**：`LINE_LOGIN_CHANNEL_ID=2010219428`（活的 channel）、secret `0cfe…`、LIFF 同 channel。之前看到的 2010369635 是舊狀態，已有人改過。
- **真正的錯**：LINE Console channel 2010219428 白名單登記的 Callback URL 是 `https://haiwangzi.xyz/api/auth/**callback/line**`，但程式送的是 `/api/auth/**line/callback**`（兩段順序顛倒）→ LINE 一路回 `Invalid redirect_uri` → 健檢失敗 → 導 /login-help。
- curl 實測確認：redirect=`/api/auth/callback/line` → LINE **接受**；`/api/auth/line/callback` → Invalid。
- **修法（純程式，因 LINE console 頁面 renderer 一直凍結、UI 自動化不穩）**：callback 邏輯抽出 `src/lib/line-login-callback.ts`；**兩個 route 都指向它**——`/api/auth/callback/line`（新，主）＋ `/api/auth/line/callback`（舊，相容）；`callbackUrl()` 預設改送 `/api/auth/callback/line`（對齊 LINE 白名單）。**日後 LINE console 若改回另一路徑也不會壞**（雙路徑都收）。
- build 通過(exit 0)，兩 route 都註冊。
- **✅ 已驗證（2026-07-07）**：v812 上線後 curl 確認登入導向真正 LINE 授權頁（client_id=2010219428、redirect_uri=/api/auth/callback/line 被 LINE 接受）；瀏覽器讀 LINE Console 比對 Channel secret=`0cfe63466a76c82910b25d5eb9b595fc` 與 Zeabur 一致；**用戶實測桌機 LINE 登入成功**。桌機登入問題完結。
- 教訓：debug LINE 登入先查「LINE Console callback 白名單」vs「程式 callbackUrl() 送的值」是否逐字一致——本次就是 `/api/auth/callback/line` vs `/api/auth/line/callback` 順序顛倒。callbackUrl() 現在雙路徑相容，不易再犯。
- 工具限制：claude-in-chrome 走到 LINE OAuth 頁後整個 session 會被鎖（"This site is blocked"），無法自動化完成 OAuth 同意；Zeabur/LINE Console 一般頁面則可操作。

## 2026-07-07 — LINE 環境變數前綴分組（MSGAPI/LOGIN/LIFF）+ 相容層（v811）

老闆要求：LINE 變數命名不清楚（`LINE_CHANNEL_SECRET` 看不出是 Messaging API，易與 `LINE_LOGIN_CHANNEL_SECRET`、`LINE_LIFF_CHANNEL_ID` 搞混），要加前綴。

- **新增 `src/instrumentation.ts`**（Next 16.2 stable register hook，開機跑一次）：LINE 變數「改名相容層」——把新名 `LINE_MSGAPI_*` 在開機時補到舊名 `LINE_CHANNEL_*`（新名優先、舊名相容、兩者都設舊名不覆蓋）。單一 Node 容器（Zeabur）register 於主程序啟動跑一次，全域生效。只在 `NEXT_RUNTIME=nodejs` 執行。
- **重新定義（前綴分組）**：
  - `LINE_MSGAPI_CHANNEL_ACCESS_TOKEN` / `LINE_MSGAPI_CHANNEL_SECRET`（新，Messaging API 推播/webhook）← 取代命名不清的 `LINE_CHANNEL_*`（仍相容）。
  - `LINE_LOGIN_*`（登入）、`LINE_LIFF_*`/`NEXT_PUBLIC_LIFF_*`（LIFF）本就有前綴，不動。
- `line.ts` 的 token/secret 讀取改「新名 ?? 舊名」雙讀 + 錯誤訊息標新名；其餘 25 處直讀舊名處由 instrumentation 補齊涵蓋（零改動）。
- `.env.example` 重寫 LINE 區塊為 MSGAPI/LIFF/LOGIN 三段，標明「三種不同 channel、secret 不可互貼」。
- build 通過(exit 0)。**Zeabur 遷移**：可只設新名並刪舊名，或維持舊名——皆可運作。
- ⚠️ 桌機 LINE 登入 root cause（channel 2010369635 失效）仍待老闆改 Zeabur `LINE_LOGIN_CHANNEL_ID=2010219428`+secret，與本次改名無關。

## 2026-07-07 — 高氧（Nitrox）一律採用 + 萊萊/石城改 650（v809–810）

- **v809**：老闆再更正 萊萊鶯歌石與石城 750→**650**（各潛點 600 不變）。
- **v810 高氧**：老闆說「我們一律採用高氧」→ 全站「含空氣」文案改「含高氧」+ 加亮點：
  - `/pricing`：說明句+表頭 含空氣→含高氧；加綠字「💨 本店氣瓶一律採用高氧（Nitrox），下水更輕鬆、水下停留更長」。
  - 日潛預約頁 `/liff/dive/trip`：潛次說明「（含空氣瓶）」→「（含高氧氣瓶）」。
  - AI 知識庫 `assistant-kb.ts` + 選單 `assistant-menu.ts` 的 Fun Dive：補「一律高氧」+ 實際單價（各潛點 600 / 萊萊石城 650 / 一天 3 支），客戶問 AI 也會講。
- build 通過(exit 0)。**價目真相來源**：`/pricing` 與 AI KB 都是 hardcode（行銷靜態，零 DB）；改價要動程式重部署（之後若要後台可改再接）。

## 2026-07-06 — 日潛價目更正（v808）

老闆回報 `/pricing` 頁日潛 Fun Dive 金額錯誤，更正 3 處（全站掃過，錯誤只在此頁 hardcode）：
- 東北角各潛點 650 → **600**
- 「宜蘭 萊萊鶯歌石」→ **「宜蘭 萊萊鶯歌石與石城」**（同 750，石城併入此列）
- 文案「一天通常 2 支氣瓶」→ **「3 支」**
- 順帶：後台新增場次「氣瓶費/瓶」預設 `extraTank` 650 → 600（`admin/trips` BLANK_PRICING_DEFAULT），避免手建場次填錯；已存在的場次不受影響（各自存 DB）。
- **未動且確認無誤**：AI 知識庫/選單的 Fun Dive 只寫「依氣瓶支數計費，確切價格加 LINE」無錯誤數字；ChatWidget 價目即時讀 `/api/site-config`（老闆 DB 實際值）；其他 `萊萊鶯歌石` 是潛點名/SEO（真實地名，不動）。
- build 通過(exit 0)。⚠️ 後台 settings 的 `defaultTripPricing` fallback（baseTrip 1200/extraTank 500）是載入前的暫時預設，實際以老闆 DB 設定為準，未動。

## 2026-07-06 — 抵用金整合進底部付款總結（v806–807）

- **v806（緊急熱修 v805）**：/login-help 轉址原用 `url.origin`——容器內是內部 service host:8080，客戶點登入會連到不存在位址。改用 `NEXT_PUBLIC_BASE_URL`。教訓：**容器內 redirect 一律用對外 base，不可用 req origin**。
- **v807 抵用金整合**（老闆核准預覽後實作）：日潛 `/liff/dive/trip` + 潛旅 `/liff/tour` 兩頁一致——
  - 移除中段獨立抵用金卡片與其「應付 NT$」行（日潛卡改題「付款與優惠」，保留付款說明+優惠代碼）。
  - 底部付款總結＝唯一金額區：明細 → 🎁 抵用金行（無餘額=一行淡字「目前無可折抵・禮金入帳後下次可折」；有餘額=輸入框+「全額折抵/清除」切換鈕）→ 「應付總額」大字（=扣抵後）→ 確認預約。
  - 潛旅頁底部原顯示未扣抵的「總金額」→ 改為扣抵後「應付總額」（訂金/已折抵小字保留）。
- build 通過(exit 0)。

## 2026-07-06 — 桌機 LINE 登入壞掉的防護：健檢閘 + 友善引導頁（v805）

背景：金鑰輪換後 LINE Login channel（`2010369635`）失效 → 桌機登入全數被丟到 LINE 原生「400 Invalid client_id」頁（新舊會員都會，老會員因既有 session 沒感覺）。**root cause 要老闆修**：LIFF 母 channel `2010219428` 仍有效（實測回 Invalid redirect_uri＝channel 活著）→ 老闆只需 ①LINE Console 該 channel 加 Callback URL `https://haiwangzi.xyz/api/auth/line/callback` ②Zeabur 改 `LINE_LOGIN_CHANNEL_ID=2010219428` + 對應 SECRET → Redeploy。

**系統面防護（本版，讓客戶永遠看不到 LINE 400）**：
- 盤點：所有桌機 LINE 登入（/pclogin 註冊鈕/直接登入/頁頂登入、/admin/login LINE 鈕）都走單一閘口 `/api/auth/line/login` → 在閘口做行前健檢即全覆蓋。
- `line-login.ts` 新增 `lineLoginHealthy()`：伺服器端試打 LINE authorize（5s timeout），status≥400＝未就緒；結果快取 5 分。LINE 連不上（網路問題）→ 放行不誤擋。
- 登入 route：未設定或健檢失敗 → 302 到新頁 **`/login-help`**（原本未設定時回 JSON 503 也一併改）。
- 新頁 `/login-help`（給會員的建議訊息）：📱 手機 LINE 開會員中心(LIFF)（推薦）／💬 加 LINE @894bpmew 小編協助／🔄 稍後再試（恢復後自動回到正常 LINE 登入）。
- callback 失敗原本就導回 `/pclogin?login_error=`，不動。
- build 通過(exit 0)。⚠️ 老闆修好 channel 前，桌機登入=導 /login-help（體驗劣化但不再嚇人）；修好後健檢自動放行、零改動。

## 2026-07-06 — v803 新攻擊面安全稽核 + 回饋端點加固（v804）

老闆下安全目標（防網路攻擊/防強挖內部機密）。針對 v803 新增面稽核：

- **稽核結果（安全）**：①`checkRateLimit` 預設綁 client IP ✅ ②通訊紀錄頁無 `dangerouslySetInnerHTML`，訪客塞字無法 XSS 後台 ✅ ③assistant-kb 防護欄完好（拒答系統/金鑰/提示詞、絕不洩露系統提示、抗「忽略先前指示」注入，最高優先）✅ ④system prompt 無任何金鑰（OPENROUTER_API_KEY 只當 fetch header）✅ ⑤對話只存客戶端 sessionStorage，伺服器不留對話 ✅ ⑥fetchLive 只打公開快取 API ✅。
- **發現並修補**：`/api/assistant/feedback` 原只有單 IP 10/分 → 分散 IP 可灌爆 MessageLog 洗版通訊紀錄。加固（比照 v772 模式）：+單 IP 30/日、+全站 300/日 in-memory 閘（超量**靜默回 ok 不記錄**，不給攻擊者訊號）。單實例前提同 v772。
- build 通過(exit 0)。

## 2026-07-06 — AI 小幫手全面改版 P0–P2（對標市場做法）（v803）

老闆嫌 AI 小幫手不完善 → 市場對照（Intercom/Crisp/Klook Bee/LINE 生態）後列 P0–P2 建議，老闆拍板全做：

- **P0 版面重排**：選單併入聊天流——快速回覆 chips（膠囊、flex-wrap）直接跟在訊息後，單一捲軸；修掉「訊息區/選單區分離、中間大留白、雙捲軸、選單被切」。
- **P0 手機/全站公開頁**：顯示條件 `/`+`/mobile`+`/schedule`（原只有桌機首頁）；≤640px 面板全螢幕 bottom-sheet（media query `!important` 蓋 inline style）。後台/LIFF/pclogin 不顯示。
- **P0 找真人常駐**：header 綠色「💬 找教練」LINE 鈕。
- **P1 對話保存**：sessionStorage（重新整理/切頁保留、關頁籤消失）+ header 🗑 清除。
- **P1 打字機+思考中**：AI 回覆逐字呈現（`TypeText`，reduced-motion 直接全顯）；等待時「小螃蟹思考中」（重用 DiverLoader）。真 token SSE 串流仍列後續（`/api/assistant` 未動）。
- **P1 場次卡片**：選單查場次改回卡片（日期/週/時間・潛點・岸船/潛數・剩位・「預約›」CTA→/schedule；已滿無 CTA）。
- **P2 主動招呼**：進站 10 秒未開啟 → 浮球旁 teaser 泡泡 + 未讀紅點；點×當日不再出現（localStorage 按日 key）。
- **P2 回饋**：每則 AI 回答（打字完）附 👍👎 → `POST /api/assistant/feedback`（限流 10/分）→ `logMessage` channel=inapp、templateKey=ai_feedback，**通訊紀錄可看**（標題 `[👍/👎] 問題`、answer 放 error 欄）；👎 自動補「找汪汪教練(真人)」訊息。
- 動檔：`ChatWidget.tsx` 全檔重寫、新 `api/assistant/feedback`。選單資料 `assistant-menu.ts` 未動。build 通過(exit 0)。
- **下次先看**：真 SSE 串流；老闆想看回饋統計可再做彙整視圖（現走通訊紀錄篩 ai_feedback）。

## 2026-07-05 — 載入動畫改版：螃蟹 V11 取代潛水員（v802）

老闆再提供新素材包（`ocean_prince_crab_loader_v11_no_white_blobs_package.zip`）指示「應該是換成這一個才對」，並要求確認底色不突兀。

- **底色驗證**：PNG 逐像素檢查四角+頂部 **alpha=0（透明背景）**，且 V11 修正「大螯旁白色區塊」→ 珍珠色/白色/深色底皆不突兀。
- `DiverLoader` 內部改螃蟹 V11：`/assets/reference-crab-clean-full.webp`（289×204，32KB）+ 大螯 tight clip overlay 開合（不含眼睛、base 不挖空）+ 漂浮 + 影子脈動 + 標題動態點點（`.`→`..`→`...`）。**元件名/props 不變** → v801 全站呼叫點自動換裝。
- 標題尾端 `…/...` 自動剝除改用動態點點（避免「載入中…...」疊字）。
- 移除舊潛水員圖 `ocean-prince-premium-diver.webp` 與 `.hwzd2-*` CSS（新 `.hwzc-*`）。
- build 通過(exit 0)。

## 2026-07-05 — 全站資料載入等待畫面統一潛水員 V2（v801）

老闆指示：所有「頁面載入需要時間」的等待畫面全部換成 V2 潛水員圖樣。全站盤點 + 套用：

- **共用元件（一次覆蓋多頁）**：
  - `LiffLoading` 三種變體（bubbles/ring/skeleton）**全部**改渲染 DiverLoader（介面保留）→ 潛旅/場次/社群/媒體/通知/我的訂單/個人中心/付款頁 等 11+ LIFF 頁。
  - `AdminShell` + `MobileAdminShell` 進場「載入中...」→ 潛水員 → **所有後台頁**（桌機+手機）進場載入。
- **逐頁**：`/pay`(訂單載入)、LIFF coach today/settle、messages、refund/[id]、refund-request/new(含 Suspense fallback)、wishes/[id]、`PaymentVerifyView`(核對頁)；手機後台 m/attendance・bookings・dive-wishes・email・tonight・tours・trips・users(詳情)；桌機後台 tonight・bookings・attendance・users・templates(原旋轉圈)。
- 未動：按鈕上的「載入中...」文字（如重新整理按鈕）、彈窗內小型逐筆載入字樣（非整頁等待）。
- 技巧註記：批次改檔時 repo 為 CRLF——多行字串比對需先把 `\n` 轉 `\r\n`（scratchpad apply-diver*.js）。
- build 通過(exit 0)。

## 2026-07-05 — 潛水員 loading 動畫 V2：老闆提供高質感圖 + 腳蹼踢水（v800）

老闆嫌 v781 手繪 SVG 潛水員醜，提供素材包（`ocean_prince_liff_upload_kicking_fins_v2_package.zip`）。整合：

- 圖檔 `public/assets/ocean-prince-premium-diver.webp`（725×600，16KB，合手機鐵則）。
- `DiverLoader` 內部改 V2：真圖 + **腳蹼 clipped-overlay 踢水**（同一張圖 clip-path 切腳蹼區小角度旋轉 3–6 度，本體不變形）+ 漂浮 + 波紋 + 泡泡 + 漸層進度條。**props 介面不變** → 既有呼叫點（/pay、LIFF 付款、預約/報名送出、LiffLoading bubbles）全部自動升級。
- overlay 模式＝深海遮罩 + 白色圓角卡（老闆 V2 設計：品牌字 + 大潛水員 + 標題/副標 + 進度條）；inline 模式＝小潛水員 + 文字。
- CSS 集中 `globals.css`（`.hwzd2-*`，取代 v781 `.hwz-diver-*`）；保留 `prefers-reduced-motion`。
- build 通過(exit 0)。素材原始包與整合說明在老闆下載資料夾/對話紀錄。

## 2026-07-05 — 付款證明上傳/讀取全鏈修復（base64 塞爆 → R2 化 + 懶修復）（v798）

老闆回報三症狀：客戶送出付款證明沒回饋且一直點沒反應（但狀態有變待確認匯款）、訂單詳情看不到憑證圖、老闆核對頁當機。全鏈追查（訂單 O20260705-40，公開連結 /pay 上傳）：

- **根因鏈**：
  1. `/api/pay/[id]` POST 把**整包 base64 存進 DB `paymentProof.imageKey`**（從未上 R2，也沒 thumbBase64）。iPhone 截圖壓縮 fallback 有洞（canvas 全失敗/比較邏輯怪 → 用原圖數 MB）→ 上傳極慢像沒反應。
  2. 單筆核對 API `/api/admin/payment-proofs/[id]` 對 base64 圖 **整包塞進 JSON 回傳** → 數 MB 回應 → 老闆核對頁（PaymentVerifyView，桌機/LIFF 共用）WebView 當機。
  3. **v722 回歸**：清單 API 改只回 `hasImage`，但訂單詳情彈窗（admin/bookings）還在讀舊欄位 `previewUrl/thumb/imageKey` → **v722 起彈窗永遠顯示「無圖片（僅填後5碼）」**，不論有沒有圖。
- **修法**：
  - 新 lib `src/lib/payment-proof-image.ts`：`uploadProofImageToR2()`（dataURL→R2 payments/ 私密，DB 只存 key）+ `repairBase64ProofImage()`（舊 base64 資料**懶修復**：被讀到時搬上 R2 並更新 DB）。
  - `/api/pay/[id]` POST + LIFF `/api/bookings/[id]/payment-proofs` POST：base64 一律先上 R2，R2 失敗才退回存 base64；imageDataUrl 加 9MB 上限(400)。
  - 單筆核對 API：base64 → 懶修復搬 R2 → 回 presigned URL；搬不動時只回小圖(≤500KB)，大圖回 null（寧可補傳不當機）。**老闆點開那筆壞資料的當下即自動修復**。
  - `/api/pay/[id]` GET：舊 base64 只回小圖(≤200KB)，不再整包塞回客戶手機。
  - 訂單詳情彈窗：改 `hasImage` + 「點此載入付款憑證圖」（打單筆 API 取 presigned）→ 修 v722 回歸。
  - `/pay` 客戶端壓縮改「一律採最小 canvas 結果」（不再可能送原圖）+ 送出前 6MB 防呆。
- **下次先看**：DB 內可能還有其他歷史 base64 大圖 proof——都會在被核對時懶修復；若要一次清，可寫 backfill 掃 `imageKey LIKE 'data:%'` 批次搬 R2。
- build 通過(exit 0)。⚠️ 上傳鏈需真機驗證（客戶端壓縮 + LINE WebView）。

## 2026-07-03 — 手機 LINE 登入即可現場收現（老闆免帳密）（v777）

老闆要求「手機用 LINE 登入就能處理現場/即時，不用再輸入帳密」。**關鍵發現：認證早就通了**——`authFromRequest`（[auth.ts:39](src/lib/auth.ts:39)）本來就吃 LINE idToken，`requireRole` 依 DB 角色判斷；所以老闆在 LINE 裡開任何 LIFF 頁，就是以 boss 身分登入（`/liff/coach/today` 教練端本來就這樣跑）。缺的只是：LIFF 今日場次頁**沒給老闆「現場收現結清」按鈕**（連老闆都被叫去「通知老闆記帳」）。

- **修補（對齊已上線的 `/admin/m/attendance` 流程）**：
  - `/api/coach/today` 回傳 `viewerRoles`（[route.ts](src/app/api/coach/today/route.ts)）。
  - `/liff/coach/today`：老闆(boss/admin/it) 標到場時，未付清 → 先 `POST /api/admin/bookings/[id]/payment-entry {kind:cash, amount:剩餘}`（會一併寫 `paymentMethod=cash`，v776）再標到場；教練/助教維持只標到場、提醒老闆（v756）。
  - 安全：`payment-entry` 伺服器端仍限 `["admin"]`；就算前端誤顯示按鈕，教練呼叫也會 403（前端 gating 錯不會開洞）。
- **結果**：老闆手機開 LINE → `/liff/coach` → 今日場次 → 按到場 → 自動現場收現結清，一次同步 paidAmount/paymentStatus/paymentMethod/status。**全程 LINE 登入、免帳密。**
- **⚠️ 待真機驗證**：LIFF 只能在 LINE App 內跑，本機無法端到端測；`npm run build` 已過（exit 0）。此改動是複製已上線的 `/admin/m` 流程 + 伺服器端權限不變，風險低，但**建議老闆用手機在 LINE 實跑一次**確認。
- 仍待（更大範圍）：把整個手機老闆後台（老闆結帳/訂單…）都搬進 LIFF；目前只補了最關鍵的「現場點名＋收現」。

## 2026-07-03 — 老闆結帳：現場付款/逾期單不再進「待匯款催繳」（v776）

老闆回報：一張 6/30（已過期）、客戶選「現場付款」的單，仍出現在「已下單·待匯款」催繳清單。

- **根因（機制漏洞，非資料錯）**：`/admin/tonight` 的「待匯款」清單過濾條件只有 `booking.status === "pending"` 一條（`src/app/admin/tonight/page.tsx`），不看①付款方式 `paymentMethod`（`cash`=現場支付的客戶根本不會匯款）②活動日期是否已過③已付金額。而 `payment-entry`（現場收現）只改 `paidAmount`/`paymentStatus`，**從不動 `booking.status`**（[payment-entry/route.ts:144](src/app/api/admin/bookings/[id]/payment-entry/route.ts:144)）；到場點名才會把 status 轉 `completed`（[attendance/route.ts:69](src/app/api/coach/bookings/[id]/attendance/route.ts:69)）。所以「現場付款 + 沒點名」的 pending 單被那條粗規則硬留在催繳清單。
- **修法（純前端過濾，API 已回 `...b` 全欄，`paymentMethod`/日期都拿得到）**：
  - `pendingAll` 先加 `totalAmount - paidAmount > 0` 條件（已付清但 status 沒同步的不再催）。
  - 拆兩流：`paymentMethod === "cash"` 或 活動日 < 今天（台北時區）→ 移出「待匯款」，改列**新區塊「💵 現場付款 / 逾期待結案」**（提醒老闆去現場收現／點名／取消，勿催匯款）；其餘（未過期·非現場付款·仍欠款）才留在「🧾 已下單·待匯款」。
  - 卡片渲染抽成共用 `renderPendingRow(b, variant)`；現場付款掛 💵、逾期掛 ⏰ 標籤。
- **狀態機補強（同版 v776，第二輪）**：老闆要求「按到場＝現場付款＝一次更新所有狀態」。三個獨立旗標定義：`status`(BookingStatus)、`paymentStatus`(PaymentStatus pending/deposit_paid/fully_paid/refunding/refunded)、`paymentMethod`(cash/bank/linepay/other)。決策後實作：
  1. **現金即標付款方式**：`payment-entry` POST 收到 `kind:"cash"` → 同交易一併寫 `booking.paymentMethod="cash"`（[payment-entry/route.ts:144](src/app/api/admin/bookings/[id]/payment-entry/route.ts:144)）。手機/桌機「到場結清」「一鍵現場收現」都送 cash → 全自動涵蓋。決策：混合付款（訂金轉帳+尾款現金）**一律覆寫成 cash**（逐筆 PaymentEntry 仍留 transfer/cash 兩筆真實軌跡，不丟）。
  2. **「已到場・未付清」進老闆待辦**：決策 = 教練/助教只標到場（維持 v756 不記帳），款進老闆待收。tonight 頁新增第三區塊「✅ 已到場・未付清」= `status==="completed" && 應付>0 && 非退款`。
- **未做（更大範圍）**：手機老闆後台改 LINE 免帳密登入（現 `/admin/m` 走密碼、`/liff/coach` 才 LINE 登入）——決策為**下一輪**專做。
- **驗證**：這台桌機原本沒 Node → 用 winget 裝了 Node 24.18.0（user scope，路徑 `%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_*\node-v24.18.0-win-x64`，**不在預設 PATH**，新 shell 或手動加 PATH 才可用）。`npm run build` **通過**（Compiled successfully、94/94 靜態頁、exit 0）。版本 `20260703_776`，已部署。

## 2026-07-03 — SETUP.md：重灌電腦一次裝好環境的完整清單（docs）

老闆要「換/重灌電腦後能一次把開發環境裝回來」。純文件、無程式變更。

- 新增 `SETUP.md`：工具（Node 24、Git、pnpm/npm）、env 變數清單、DB（Prisma / `db push` / migrate-safety）、認證（GitHub、Zeabur、各家金鑰）、備份 `.claude/` 設定；`README.md` 加連結。
- 補 §「系統／硬體需求」+ §11「雙機（桌機↔筆電）同步實務」——兩台機器如何各自 clone、共用 origin、`.env` 不進版控要各自建、`.claude/` 手動同步。
- **下次先看**：env 清單要與 `.env.example` 對齊（新增變數時兩邊都補）；金鑰實際值走 [[SECRET_ROTATION]] 手冊，不進文件。

## 2026-07-02 — 安全稽核三連發：OWASP 掃描 + 金鑰輪換手冊 + 清外洩金鑰（v773→v775）

線上 = **v20260702_775**。承 v772 防濫用後做一輪完整資安。

### v773 — 全站安全稽核 OWASP Top 10:2025（20 項）
- 4 個平行代理 + `npm audit` 展開 20 項掃描。**結論：核心防護良好**（存取控制／IDOR／後台守門／XSS／CSRF／安全標頭／上傳／SSRF／密碼／供應鏈皆通過）。
- 修補三處縱深防禦：
  1. `src/lib/auth.ts` DEV 冒充閘 `!== production` → **`=== development`**（關掉灰色狀態〔staging/preview〕的身分冒充窗口）。
  2. `migrate-domain` 的 `$executeRawUnsafe` 表名/欄名加白名單 `^[a-z_][a-z0-9_]*$`。
  3. assistant body 上限(413)/壞 JSON(400) 檢查**前移到限流後、DB/金鑰檢查前**（省資源、先擋壞請求）。
- 測試：401/429/413/400/dev 回歸全通過。
- ⚠️ **抓到重點洞**：`.env` 內 LINE/R2/JWT/CRON 金鑰曾於 2026-05-11 外洩，待 rotate → 催生 v774/v775。

### v774 — 金鑰輪換操作手冊 `docs/runbooks/SECRET_ROTATION.md`
- 依 v773 稽核發現的 `.env` 外洩，用**實際變數名**分平台（LINE/Zeabur/R2/JWT/CRON…）列出 rotate 步驟／副作用／驗證／檢查清單。純文件，index 加連結。

### v775 — 清版控內硬編碼外洩金鑰 + 訂單編輯最小權限
- **清金鑰**：安全掃描發現 `ZEABUR_DEPLOY.md`、`docs/CRON_SETUP.md` 內硬編碼**真實** LINE token/secret、`JWT_SECRET`、`CRON_SECRET`（已進版控與 git 歷史）→ 全改佔位符、指向 SECRET_ROTATION 手冊。**⚠️ 舊值仍存在於 git 歷史，必須實際 rotate 才會失效**（改文件只是止血）。確認 R2 金鑰與 `src/` 原始碼無硬編碼密鑰、`.env` 未進版控。
- **最小權限（issue #13）**：`admin/bookings` PATCH 由**黑名單改白名單**——教練只能改現場欄位，金額結構／`adminNotes` 收歸 admin/boss/it。

### 下次先看 / 未結
- **最關鍵**：外洩金鑰**尚未 rotate**（v774/v775 只備好手冊 + 止血文件）。老闆需照 [[SECRET_ROTATION]] 逐平台換發，否則舊金鑰仍有效。
- 版控中還有兩張 AI 客服吉祥物 mockup 未提交：`docs/mockups/ai-bot-desktop-{closed,open}.png`。

## 2026-07-01 — AI 客服防濫用／防燒帳單（v772）

老闆問「如何預防有人非正常方式狂問、亂問、攻擊 AI 或問非潛水內容」。選「中等防護」。分層（in-memory、單實例、重啟歸零）：

- 速率：單 IP 12/分 + **新增單 IP 100/日**；全站斷路器 60/分、1500/日（`globalLlmGate`）→ 超過不打 OpenRouter、引導 LINE（Denial-of-Wallet）。
- 呼叫 AI 前廉價預過濾（省 token）：`precheckAbuse` 高信心注入字樣→罐頭婉拒不打 AI；`isFlood` 同 IP 60 秒內同句第 3 次起擋。
- 瘦身：每則 4000→**800 字**、messages 上限 40 則。
- 留資防灌爆：`inquiryGate`（單 IP 3/10 分、全站 100/日）。
- 動檔：`src/app/api/assistant/route.ts`、`src/lib/rate-limit.ts`（匯出 `getClientIp`）。全站每日上限可用 `ASSISTANT_DAILY_CAP`… 註：目前用 `globalLlmGate` 的 1500/日常數，如需環境變數化再抽。
- 下次先看：若 scale 成多實例，計數要改 Redis/DB；可加「注入嘗試超標通知老闆」。

> 註：v771（`42d63d6`，另一線工作）＝ ChatWidget 導引式選單三層漏斗 + `assistant-menu.ts` + 設計文件，與本版互不衝突（沒動 route.ts）。

## 2026-07-01 — AI 客服修「星期標錯一天」（v770）

v769 上線後自測 7 題：架構成功（模型在讀注入的真實資料、日期對、有附連結、資安題正確拒答），但抓到一個 weekday bug——場次清單星期少一天（7/4 標「五」應「六」）。根因：`runGetDiveSessions` 用 `T00:00:00+08:00`+`getDay()`，伺服器 UTC 下午夜+8 退前一天。改 `weekdayOf(ds)`（中午換算）。同時【即時資料】明天/週末補上星期，避免模型自己猜。自測通過後即此版。

## 2026-07-01 — AI 客服重設架構：確保答案正確 + 多附可點選 URL（v769）

老闆回報「連簡單問題都答錯」。診斷：靠弱模型「自己算日期＋決定呼叫工具」本質不可靠（v768 只是補強，沒治本）。

**治本改法（核心觀念：讓模型「讀」不要「算」）** — `src/app/api/assistant/route.ts`：
- 新增 `buildLiveFactsBlock()`：每次請求先把真實資料算好塞進 system prompt——今天/明天/本週末（已算好週六日確切日期）、近 30 天日潛場次、目前開放潛旅。走版本號快取（命中零 DB，後台場次/潛旅存檔即失效→自動最新）。
- 常見問題（今天/明天/本週末/有沒有團/名額）**不必呼叫工具**就能答對；`get_dive_sessions` 降為「>30 天」備援。
- 加「最高優先規則」區塊：禁止自行推算日期、禁止捏造場次/價格/名額，一律引用【即時資料】或後台價目政策。
- `LINKS_BLOCK`：回答附 Markdown 連結（`/schedule`、`/pclogin`、`/contact`、`/#courses`、`/#spots`、`/#trips`、`/#faq`、LINE）讓客戶點。
- 預設模型 `gemini-2.5-flash-lite` → **`gemini-2.5-flash`**（指令遵循好很多，仍便宜）；temperature 0.2。後台/`OPENROUTER_MODEL` 可覆寫。
- KB（`assistant-kb.ts`）規則同步：場次先看【即時資料】，工具只當 >30 天備援。

下次先看：若還想更省成本，待觀察 flash 穩定後可評估降回 lite（但 facts 已注入，lite 理論上也該答對，可 A/B）。

## 2026-07-01 — AI 客服修「週末場次判斷錯誤」（v768）

問題：被問「本週末有沒有場次」時答錯（明明有場次卻說沒有）。實測抓到 `get_dive_sessions` 被模型帶入過去的日期區間（如 5/15~5/29，今天卻是 7/1）→ 查無資料 → 誤答。根因不是格式，是 **`gemini-2.5-flash-lite` 不知道今天是哪天**而臆測日期。

- `src/app/api/assistant/route.ts`：
  - 抽出共用日期工具 `taipeiToday()` / `taipeiPlus(base,days)` / `weekdayOf(ds)`（`WD` 星期表）。
  - **system prompt 開頭注入現在時間**：「今天是 YYYY-MM-DD（星期X），時區 Asia/Taipei」+ 明令「問日期/場次一律呼叫 `get_dive_sessions`，不要自己推算」。
  - **`runGetDiveSessions` 日期防呆**：`from < today` → 夾成 today；`to < from` → `from`+14；區間 > 60 天 → 砍到 60；回覆開頭再標「今天是 …」。
  - 場次/潛旅輸出改 **Markdown 條列（`- `）**，降低模型看錯機率。
- 下次先看：若仍偶爾誤判，考慮把「本週末」直接在後端算成日期範圍再丟工具，或升級到 `gemini-2.5-flash`（工具呼叫更穩）。

## 2026-07-01 — AI 客服價目/政策即時讀後台（v767）

選 2：讓後台可編輯的價目/政策也即時同步給 AI（免 cron）。

- `src/app/api/assistant/route.ts`：`readSiteCfg()` 讀完整 siteConfig；`buildLivePricingBlock(cfg)` 把 `gearRentalPrices`(裝備租借)、`defaultTripPricing`(日潛基本費/氣瓶/夜潛/推進器)、`cancellationPolicy`、`safetyPolicy` 格式化注入 system prompt（「以此為準」）。POST 改讀完整 cfg（取代只讀 aiBot）。走 siteConfig 版本號快取（寫入 bump `config`）→ 後台存檔即生效。
- `assistant-kb.ts`：加規則「裝備/日潛費用/取消/安全政策以後台即時為準」。
- 涵蓋面：場次(v765)、潛旅(v766)、裝備/日潛價+政策(v767) 皆即時。**課程方案價(體驗 2500/OW/AOW 14500)仍寫死在 assistant-kb（非 siteConfig 欄）**；要即時需另加後台欄位或用「補充知識」覆寫。
- **下次先看**：個人化報價工具；token 串流；課程方案價是否要搬進後台。

---

## 2026-07-01 — AI 客服接「潛旅查詢」工具，潛旅存檔自動同步（v766）

回應「當日潛水與旅行潛水存檔時就更新知識」。

- 新增 `get_dive_tours()`：查 `tourPackage`（status open/full、dateEnd>=今天）+ booking groupBy(type=tour) 算名額，回團名/日期/天數/團費/訂金/名額/新手友善。重用 `cached("assistant:tours","tours",TTL_LISTING,loader)`。
- **自動同步機制**：`src/lib/prisma.ts` $extends 蓋章——`divingTrip` 寫入 bump `trips`、`tourPackage` bump `tours`、`booking` bump 兩者。所以後台「日潛場次/潛水旅行」一存檔，對應域版本 +1，AI 工具下次查即最新（命中快取時零 DB）。= 「存檔就更新知識庫」靠即時工具+版本號快取達成，非重生成靜態文字。
- 當日潛水(v765 get_dive_sessions) + 潛旅(v766 get_dive_tours) 皆即時。
- **下次先看**：個人化報價工具；token 串流；靜態 KB（assistant-kb 課程價）與後台價目對齊。

---

## 2026-07-01 — AI 客服接「即時場次查詢」工具（v765）

修正 v764 上線後回報：AI 答「本週末有沒有場次」是模糊/導 LINE（因只有靜態知識）。

- `src/app/api/assistant/route.ts` 新增工具 `get_dive_sessions(from?, to?)`：查 `divingTrip`（status open/full、日期區間預設今天~+14天）+ booking groupBy 算剩餘名額 + diveSite 名稱，回精簡清單（`YYYY-MM-DD(週) 時間 潛點・岸/船潛・N潛・剩X位`）。**重用 `/api/trips` 的 `cached(key,"trips",TTL_LISTING,loader)`** → 命中零 DB、下單/取消自動失效。
- `assistant-kb.ts`：規則改為「場次/空位務必用 get_dive_sessions 查再答；個人化報價仍不捏造、導 LINE；報名走 LINE」。
- 工具迴圈（OpenAI function-calling）已支援多工具，dispatch 加 get_dive_sessions 分支。
- **下次先看**：個人化報價工具（折扣/客製）；token 串流；知識庫課程價同步。

---

## 2026-07-01 — 後台「系統設定 → 🤖 AI 客服」管理面板（v764）

讓老闆**從後台**管理 AI 客服(免改程式)。

- **存儲**：`SiteConfig` 加 `aiBot Json @default("{}")`（`prisma/schema.prisma`）。**關鍵**：本機 `.env` 是 localhost（無 prod 連線），prod 又有 `prisma db push` drift → 改用 **`scripts/migrate-safety.js`** 加 `ALTER TABLE site_config ADD COLUMN IF NOT EXISTS ai_bot jsonb ...`，部署時(讀 siteConfig 前)以原生 SQL 安全建欄。現有 email_threads/home_videos 等欄都這樣加、運作正常 → 證明 migrate-safety 確實在 Zeabur 部署跑。**順序安全：欄先建、app 才服務**，故可直接部署、不會掛站、不用手動 SQL。
- **後台 UI**：`admin/settings/page.tsx` 新增 `aibot` 分頁(SectionCard)：開關 / 模型 select / 個性 textarea / 招呼語 / 補充知識 → `save("AI 客服", { aiBot })` 經 site-config POST(PatchSchema 加 `aiBot`，限老闆)。
- **API**：`/api/assistant` 讀 `getSiteConfigRow().aiBot`：停用→503；模型 = 後台>env>預設；persona/extraKnowledge 附加到 system prompt。新增 `GET` 回 `{enabled, greeting}`。`ChatWidget` 掛載抓設定(停用隱藏、套自訂招呼語)。
- **設定面板總覽**：個性/招呼語/補充知識 → 後台「🤖 AI 客服」分頁(即時)；硬性規則/知識庫 → `src/lib/assistant-kb.ts`(改程式)；模型 → 後台或 env `OPENROUTER_MODEL`；金鑰 `OPENROUTER_API_KEY` → Zeabur env。
- 仍待：Zeabur 設 `OPENROUTER_API_KEY` 才會真的回答。

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
