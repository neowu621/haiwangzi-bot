# 訊息模板 — 按鈕文字 × 連結對照表

> v796（2026-07-03）整理。每個客戶/內部通知模板的「按鈕文字」與「點擊連結」對應。
> LIFF Base = `https://liff.line.me/2010219428-E5frY7tm`（在 LINE 內以 LIFF 開啟）。
> 小編 LINE OA = `https://line.me/R/ti/p/%40894bpmew`。
> 連結來源：各發送 call site 傳入的 `params.liffUrl`/`params.url`；後台「按鈕連結」欄填了就三管道(LINE/Email/站內)一律覆寫。

## 客戶通知

| 模板 | 按鈕文字（預設） | 連結 | 落點頁 | 備註 |
|---|---|---|---|---|
| 歡迎加入 welcome | 開啟預約 App | `{Base}` | LIFF 首頁 | 另有「認識我們·官方網站」次要鈕 |
| 預約確認 booking_confirm | 查看我的預約 | `params.url`（該筆訂單）| 我的預約 | 動態帶訂單 |
| 訂金通知 deposit_notice | 上傳轉帳截圖 | `params.url`（付款頁）| 付款頁 | 動態帶訂單 |
| 訂金已確認 deposit_confirm | （無按鈕）| — | — | 純資訊 |
| 尾款提醒 final_reminder | 上傳轉帳截圖 | `params.url`（付款頁）| 付款頁 | 動態帶訂單 |
| 行前手冊 trip_guide | （無按鈕）| — | — | 純資訊 |
| D-1 行前提醒 d1_reminder | 查看詳情 | `params.url`（場次）| 場次/我的預約 | 動態 |
| 到場確認 attendance_confirmed | 給予我們 ⭐⭐⭐⭐⭐ 評價 | Google 評論 | Google 地圖評論 | 後台「按鈕連結」可改 |
| 付款駁回 payment_reject | 重新上傳截圖 | `{Base}/payment/{訂單ID}` | 該訂單付款頁 | **v796 精準深連結** |
| 退款申請（待客戶確認）refund_request | 查看詳情並確認 | `{Base}/refund/{退款ID}` | 退款詳情頁 | 原本就精準 |
| VIP 升等 vip_upgrade | 查看我的會員 | `{Base}/profile` | 個人中心 | **v796** |
| 首單獎勵 first_order_reward_grant | 查看我的抵用金 | `{Base}/profile` | 個人中心（抵用金明細）| **v796** |
| 生日禮金 birthday_credit | 立即使用禮金 | `{Base}/booking` | 潛水預約 | **v796** |
| 抵用金到期 credit_expiry | 立即預約使用 | `{Base}/booking` | 潛水預約 | **v796** |
| 訂單取消 booking_cancel | 查看我的預約 | `{Base}/my` | 我的預約 | **v796** |
| 天氣取消 weather_cancel | 聯繫教練改期 | 小編 LINE OA | 與小編 LINE 對話 | **v796** |
| 退款完成 refund_complete | （無按鈕）| — | — | 純資訊 |

## 內部通知（老闆/教練）

| 模板 | 按鈕文字 | 連結 | 落點頁 |
|---|---|---|---|
| 老闆訂金待確認 deposit_pending | 前往核對 | `https://haiwangzi.xyz/admin/bookings?status=awaiting_verify` | 後台核對 |
| 超賣警示 overcap_alert | 處理此預約 | `https://haiwangzi.xyz/liff/coach/today` | 教練今日 |
| Admin 週報 admin_weekly | （無按鈕）| — | — |

## 維護說明

- **改連結免改程式**：後台 訊息模板 → 每個有按鈕的模板，「按鈕文字」下有「按鈕連結」欄，填了就 LINE/Email/站內三管道通用（留預設＝上表連結）。
- **動態連結**（付款駁回/退款申請/預約確認/訂金/尾款/D-1）：連結由發送當下帶入訂單/退款 ID，後台編輯欄顯示的是代表頁（`/my` 等）；若在後台填死一個網址，會**失去帶 ID 的深連結**、變成固定頁，請斟酌。
- 連結實作位置：各 `notifyCustomer({...})` call site 的 `params.liffUrl`/`params.url`；顯示預設在 `src/app/api/admin/templates/route.ts` 的 `DEFAULT_BTN_URL`。
