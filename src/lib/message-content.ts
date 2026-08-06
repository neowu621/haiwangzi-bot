/**
 * v480：訊息內容「單一來源」(single source of truth)
 *
 * 後台填寫(/admin/templates) / 發送預覽 / 試送到我 / 真實發送(LINE / Email / 站內通知)
 * 全部從這裡取欄位預設值與內容組稿 — 保證「填什麼就發什麼」。
 *
 * ⚠ 這個檔案不可 import prisma / flex（admin 頁 client 端也要 import）。
 */

export type MsgFieldKey =
  | "title"
  | "subtitle"
  | "bodyText"
  | "buttonLabel"
  | "buttonUrl"
  | "button2Label" // v834：第二顆按鈕文字（到場確認的「私訊反映」）
  | "altText"
  | "footerHint";

/** 與 prisma MessageTemplate / flex TemplateOverride 同形（只取文字欄位） */
export interface MsgOverride {
  title?: string | null;
  subtitle?: string | null;
  bodyText?: string | null;
  buttonLabel?: string | null;
  buttonUrl?: string | null; // v792
  button2Label?: string | null; // v834
  altText?: string | null;
  footerHint?: string | null;
}

/**
 * 每個模板可編輯欄位 + 預設值。
 * ⚠ defaultValue 同時是「真實發送的 fallback 字串」— 後台顯示的預設＝實際送出的預設。
 */
export const MSG_EDITABLE_FIELDS: Record<
  string,
  Array<{ key: MsgFieldKey; label: string; defaultValue: string }>
> = {
  // ─────────────────────────────────────────────────────────────
  // v1035：全模板文案重寫。統一原則：
  //   ① 標題＝一眼看懂發生什麼事（不放贅字）
  //   ② 副標／說明＝一句話講「對你的意義」或「要做什麼」，不超過兩行
  //   ③ 按鈕＝動詞開頭、明確動作（不用「查看詳情」這種模糊字）
  //   ④ 通知列＝手機推播只看得到前十幾個字，把最重要的放前面
  //   ⑤ 一律用「你」不用「您」（品牌語氣：親切但專業）
  // ─────────────────────────────────────────────────────────────
  booking_confirm: [
    { key: "title", label: "標題", defaultValue: "✅ 預約成功，位置已保留" },
    { key: "subtitle", label: "副標", defaultValue: "出發前一天會再傳一次行前提醒給你" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看這筆預約" },
    { key: "altText", label: "通知列文字", defaultValue: "預約成功，位置已保留" },
  ],
  d1_reminder: [
    { key: "title", label: "標題", defaultValue: "🔱 明天要下水囉" },
    { key: "subtitle", label: "副標", defaultValue: "帶齊裝備與證照，準時到集合點見 🤿" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看這筆預約" },
    { key: "altText", label: "通知列文字", defaultValue: "明天要下水囉，記得帶裝備證照" },
  ],
  deposit_notice: [
    { key: "title", label: "標題", defaultValue: "💰 請完成訂金匯款" },
    { key: "bodyText", label: "說明文字", defaultValue: "完成匯款並上傳截圖後，名額才算正式保留。逾期未繳可能會釋出給候補的潛伴。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "上傳轉帳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "請完成訂金匯款保留名額" },
  ],
  deposit_pending: [
    { key: "title", label: "標題", defaultValue: "💳 有一筆訂金待你核對" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "前往核對這筆款項" },
    { key: "altText", label: "通知列文字", defaultValue: "有訂金待核對" },
  ],
  deposit_confirm: [
    { key: "title", label: "標題", defaultValue: "✅ 訂金已收到" },
    { key: "subtitle", label: "副標", defaultValue: "名額正式保留，尾款出發前繳清即可 🎉" },
    // v862：補按鈕設定（原本沒有 → 站內無法自訂按鈕文字）。留空＝純告知不放按鈕。
    { key: "buttonLabel", label: "按鈕文字（留空＝不放按鈕）", defaultValue: "" },
    { key: "altText", label: "通知列文字", defaultValue: "訂金已收到，名額保留成功" },
  ],
  final_reminder: [
    { key: "title", label: "標題", defaultValue: "⏰ 出發前請繳清尾款" },
    { key: "bodyText", label: "說明文字", defaultValue: "距離出發剩不到幾天了，完成尾款後就等著下水，不用再擔心手續。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "上傳轉帳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "出發前請繳清尾款" },
  ],
  trip_guide: [
    { key: "title", label: "標題", defaultValue: "📘 出發前必看：行前手冊" },
    { key: "bodyText", label: "注意事項", defaultValue: "證照、防寒衣、防曬與個人藥品請先準備好；有耳壓或身體狀況，請提前告訴教練。" },
    // v862：補按鈕設定（原本沒有）
    { key: "buttonLabel", label: "按鈕文字（留空＝不放按鈕）", defaultValue: "打開行前手冊" },
    { key: "altText", label: "通知列文字", defaultValue: "出發前必看：行前手冊" },
  ],
  weather_cancel: [
    { key: "title", label: "標題", defaultValue: "🌊 因海況取消本場次" },
    { key: "bodyText", label: "說明", defaultValue: "安全永遠優先，這次先不下水。你可以改期，或選擇全額退費／轉抵用金（多 10%）。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "聯繫教練安排改期" },
    { key: "altText", label: "通知列文字", defaultValue: "海況不佳，本場次取消" },
  ],
  admin_weekly: [
    { key: "title", label: "標題", defaultValue: "📊 上週營運摘要" },
    { key: "subtitle", label: "副標", defaultValue: "營收、預約數與待處理事項一次看" },
    { key: "altText", label: "通知列文字", defaultValue: "上週營運摘要出爐" },
  ],
  overcap_alert: [
    { key: "title", label: "標題", defaultValue: "⚠️ 場次超出人數上限" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "前往處理這筆預約" },
    { key: "altText", label: "通知列文字", defaultValue: "有場次超出人數上限" },
  ],
  welcome: [
    { key: "title", label: "歡迎標語", defaultValue: "歡迎潛入" },
    { key: "subtitle", label: "副標", defaultValue: "東北角海王子潛水" },
    { key: "bodyText", label: "說明", defaultValue: "安全．專業．陪你看見海" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "開始預約潛水" },
    { key: "altText", label: "通知列文字", defaultValue: "歡迎加入海王子潛水" },
  ],
  attendance_confirmed: [
    { key: "title", label: "標題", defaultValue: "🐠 今天的潛水已記錄" },
    { key: "bodyText", label: "說明文字", defaultValue: "謝謝你和東北角海王子潛水一起下水，今天玩得開心嗎？" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "給我們 ⭐⭐⭐⭐⭐ 五星評價" },
    { key: "buttonUrl", label: "按鈕連結（點擊前往的網址）", defaultValue: "https://maps.app.goo.gl/L58ukZuJroo5vbjv5" },
    { key: "button2Label", label: "第二顆按鈕文字（不滿意→私訊反映）", defaultValue: "💬 有需要改善的地方，告訴我們" },
    { key: "altText", label: "通知列文字", defaultValue: "今天的潛水已記錄，邀你給個評價" },
  ],
  first_order_reward_grant: [
    { key: "title", label: "標題", defaultValue: "🎁 首單獎勵已入帳" },
    { key: "bodyText", label: "說明文字", defaultValue: "恭喜完成第一次潛水！這份抵用金已經放進你的帳戶，下次預約結帳時可以直接折抵。" },
    { key: "footerHint", label: "底部提示", defaultValue: "記得在期限內使用，別讓它過期 ✨" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的抵用金" },
    { key: "altText", label: "通知列文字", defaultValue: "首單獎勵已入帳，可折抵下次" },
  ],
  refund_request: [
    { key: "title", label: "標題", defaultValue: "💸 退款方式待你確認" },
    { key: "bodyText", label: "說明文字", defaultValue: "我們已為你安排退款，請確認退款方式；若有任何疑問，直接回訊息給我們就好。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "確認退款方式" },
    { key: "altText", label: "通知列文字", defaultValue: "退款方式待你確認" },
  ],
  payment_reject: [
    { key: "title", label: "標題", defaultValue: "🚫 轉帳證明需要重傳" },
    { key: "bodyText", label: "說明文字", defaultValue: "你上傳的轉帳截圖沒有核對成功，請確認金額與帳號後重新上傳。不確定哪裡有問題的話，回訊息我們幫你看。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "重新上傳轉帳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "轉帳證明需要重新上傳" },
  ],
  booking_cancel: [
    { key: "title", label: "標題", defaultValue: "❌ 這筆預約已取消" },
    { key: "bodyText", label: "說明文字", defaultValue: "這筆預約已經取消了。想改約其他場次，隨時回訊息告訴我們，很樂意幫你安排。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "看看其他場次" },
    { key: "altText", label: "通知列文字", defaultValue: "你的預約已取消" },
  ],
  refund_complete: [
    { key: "title", label: "標題", defaultValue: "✅ 退款已完成" },
    { key: "bodyText", label: "說明文字", defaultValue: "退款已經處理完成，感謝你的耐心等候。期待下次再一起下水 🤿" },
    // v862：補按鈕設定。預設留空＝純告知不放按鈕（錢已退，客戶沒有要做什麼）。
    { key: "buttonLabel", label: "按鈕文字（留空＝不放按鈕）", defaultValue: "" },
    { key: "altText", label: "通知列文字", defaultValue: "退款已完成" },
  ],
  vip_upgrade: [
    { key: "title", label: "標題", defaultValue: "🌟 恭喜升等" },
    { key: "bodyText", label: "說明文字", defaultValue: "謝謝你一路跟著海王子潛水，你的會員等級升級了，接下來可以享有更多專屬優惠。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的會員權益" },
    { key: "altText", label: "通知列文字", defaultValue: "恭喜升等，解鎖新權益" },
  ],
  birthday_credit: [
    { key: "title", label: "標題", defaultValue: "🎂 生日快樂！" },
    { key: "bodyText", label: "說明文字", defaultValue: "祝你生日快樂！我們準備了一份生日禮金放進你的帳戶，找一天來海裡慶祝吧 🐠" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "用禮金預約潛水" },
    { key: "altText", label: "通知列文字", defaultValue: "生日快樂！禮金已入帳" },
  ],
  credit_expiry: [
    { key: "title", label: "標題", defaultValue: "⏳ 抵用金快到期了" },
    { key: "bodyText", label: "說明文字", defaultValue: "你帳戶裡的抵用金即將到期，過期就不能用了。挑一個場次，用它折抵下次的潛水吧！" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "立即預約並折抵" },
    { key: "altText", label: "通知列文字", defaultValue: "抵用金快到期，記得使用" },
  ],
};

/** 取欄位預設值（後台顯示的預設＝實際發送 fallback） */
export function msgDefault(key: string, field: MsgFieldKey): string {
  return MSG_EDITABLE_FIELDS[key]?.find((f) => f.key === field)?.defaultValue ?? "";
}

/** 取欄位最終值：override > default */
export function msgField(key: string, field: MsgFieldKey, override?: MsgOverride | null): string {
  const v = override?.[field];
  return v && v.length > 0 ? v : msgDefault(key, field);
}

// ── 模板固定裝飾（LINE flex / Email / 站內 三通道共用，與 flex builder 同步）──
export const HERO_EMOJI: Record<string, string> = {
  welcome: "🌊", booking_confirm: "✅", deposit_notice: "💰", deposit_pending: "💳", deposit_confirm: "✅",
  final_reminder: "⏰", trip_guide: "📘", d1_reminder: "🔱", weather_cancel: "🌊",
  overcap_alert: "⚠️", admin_weekly: "📊", attendance_confirmed: "🐠",
  first_order_reward_grant: "🎁", refund_request: "💸", payment_reject: "🚫",
  booking_cancel: "❌", refund_complete: "✅", vip_upgrade: "🌟",
  birthday_credit: "🎂", credit_expiry: "💳",
};
export const EXTRA_LINES: Record<string, string[]> = {
  welcome: [
    "📅 日潛預約：選日期 → 選場次 → 一鍵搞定",
    "✈️ 旅遊潛水：蘭嶼 / 綠島 / 墾丁 多日團",
    "💳 上傳轉帳截圖，教練即時核對",
    "🔔 行前一天自動提醒，海況即時推播",
  ],
  trip_guide: [
    "🎒 攜帶：證照、防寒衣、防曬",
    "📍 集合地點 / 交通方式：依場次說明",
    "📞 緊急聯絡：教練電話於行前通知",
  ],
  weather_cancel: [
    "🅰️ 退現金 100%",
    "🅱️ 轉抵用金 110%（推薦，多 10% 優惠）",
  ],
};
export const EXTRA_FOOTER: Record<string, string> = {
  welcome: "安全．專業．陪你看見海",
};

// v600b：Email 按鈕一律導小編 LINE 官方帳號 —— LIFF 連結被 SES awstrack 點擊追蹤包成
//   awstrack.me 轉址後 LINE 深層連結打不開;line.me/R/ti/p 通用連結較耐包裝。
//   (只影響 Email；LINE flex 仍用原 LIFF。涵蓋 notifyCustomer + 後台測試送 所有 Email 路徑。)
const EMAIL_BUTTON_URL = "https://line.me/R/ti/p/%40894bpmew";

// ── 試送/預覽用完整樣本參數（正式發送時換成真實資料，欄位名相同）──
const SAMPLE_BASE = "https://haiwangzi.xyz";
export const MSG_SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  booking_confirm: { name: "王小明", date: "2026-06-14", time: "08:30", site: "龍洞灣 體驗潛水", total: 2400, activityNote: "請提早 15 分鐘到場換裝；自備毛巾與泳具", notes: "我會自備電腦錶", url: `${SAMPLE_BASE}/liff/my` },
  d1_reminder: { date: "2026-06-14", time: "08:30", site: "深澳", wave: "0.2 m", water: "28.9°C", waveLight: "🟢", waveText: "適合下水", wetsuit: "3mm 濕式", buoyLabel: "基隆", gather: "深澳漁港停車場 07:50", mapUrl: "https://maps.app.goo.gl/example", videoUrl: "https://youtu.be/example" },
  deposit_notice: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", deposit: 8000, deadline: "2026-09-01", bankName: "玉山銀行（808）", bankAccount: "0163-979-251023", holder: "汪○○", refCode: "HW-2409", url: `${SAMPLE_BASE}/liff/my` },
  deposit_pending: { customerName: "王小明", tourTitle: "蘭嶼四天三夜潛旅（中秋）", amount: 8000, last5: "12345", method: "🏦 轉帳", url: `${SAMPLE_BASE}/admin/bookings?status=awaiting_verify` },
  deposit_confirm: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", paid: 8000, remaining: 9000, finalDeadline: "2026-09-15" },
  final_reminder: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", remaining: 9000, deadline: "2026-09-15", daysLeft: 3, bankAccount: "0163-979-251023", url: `${SAMPLE_BASE}/liff/my` },
  trip_guide: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", gather: "後壁湖碼頭 07:00", transport: "藍鯨號客輪", hotel: "蘭嶼海景民宿", leader: "汪教練", phone: "0988-346-634" },
  weather_cancel: { date: "2026-06-14", time: "08:30", site: "鶯歌石", reason: "今日東北風 6 級、浪高 1.8 m，海況不適合下水", options: "🅰️ 改期 🅱️ 全額退費 / 轉抵用金 +10%", url: `${SAMPLE_BASE}/liff/my` },
  admin_weekly: { weekRange: "2026-06-02 ~ 06-08", revenue: 86400, bookings: 23, newMembers: 6, pending: 3 },
  overcap_alert: { tripDate: "2026-06-14", tripTime: "08:30", site: "鶯歌石", customerName: "王小明", requestedCount: 2, currentBooked: 8, capacity: 8, url: `${SAMPLE_BASE}/liff/coach/today` },
  welcome: { liffUrl: "https://liff.line.me" },
  attendance_confirmed: { bookingTitle: "6/14 龍洞灣 體驗潛水", addLogs: 2, totalLogs: 38, vipLevel: "LV2 小丑魚", liffUrl: "https://liff.line.me", reviewUrl: "https://maps.app.goo.gl/L58ukZuJroo5vbjv5" },
  first_order_reward_grant: { amount: 100, balance: 100, expiresAt: "2027-06-14", bookingTitle: "6/14 龍洞灣 體驗潛水", liffUrl: "https://liff.line.me" },
  refund_request: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2400, method: "credit", creditBonus: 10, reason: "臨時有事無法參加", liffUrl: "https://liff.line.me" },
  payment_reject: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "轉帳金額與應繳不符（少 200 元），請確認後重新上傳", liffUrl: "https://liff.line.me" },
  booking_cancel: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "因人數不足取消，造成不便敬請見諒", liffUrl: "https://liff.line.me" },
  refund_complete: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2640, method: "credit", liffUrl: "https://liff.line.me" },
  // v1026/v1027：升等的 tierName/benefits/upgradeCredit 由「系統設定的 VIP 級距」即時帶入
  //   （vipUpgradeSampleParams），這裡只留非級距欄位；下面數值僅為 fallback。
  vip_upgrade: { tierName: "LV3 海龜", tierEmoji: "", benefits: "", upgradeCredit: 0, liffUrl: "https://liff.line.me" },
  birthday_credit: { amount: 200, expiryDays: 90, liffUrl: "https://liff.line.me" },
  credit_expiry: { amount: 300, expireDate: "2026/06/30", liffUrl: "https://liff.line.me" },
};

// ── 動態資料主體（每模板的「系統自動帶入」區）— 試送與正式發送共用 ──
const s = (v: unknown) => (v == null ? "" : String(v));
const m = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : s(v);
};
const methodZh = (v: unknown) => (v === "credit" ? "轉抵用金" : v === "cash" ? "退現金" : s(v));

/** 模板動態主體：正式發送帶真實 params；試送帶 MSG_SAMPLE_PARAMS（欄位相同） */
export function buildDynamicBody(key: string, p: Record<string, unknown>): string {
  switch (key) {
    // ── 一日潛水（一次付清）/ 預約 ──
    case "booking_confirm": {
      // v732：應付 = 扣抵用金後金額。有折抵用金時顯示「總額 − 折抵 = 應付」，避免顯示原始總額。
      const total = Number(p.total);
      const credit = Number(p.creditUsed) || 0;
      const payable = p.payable != null ? Number(p.payable) : total;
      const amountBlock = credit > 0
        ? `訂單總額：NT$ ${m(total)}\n折抵用金：−NT$ ${m(credit)}\n應付金額：NT$ ${m(payable)}（一次付清）`
        : `應付金額：NT$ ${m(payable)}（一次付清）`;
      return `預約場次：${s(p.site)}\n出發時間：${s(p.date)} ${s(p.time)}\n${amountBlock}`
        + (p.activityNote ? `\n📣 活動提醒：${s(p.activityNote)}` : "")
        + (p.notes ? `\n📝 您的備註：${s(p.notes)}` : "");
    }
    case "d1_reminder": {
      // v1033：分段呈現（場次 / 海況 / 集合 / 連結），段落間空一行，好讀
      const sec: string[][] = [];
      sec.push([`🔱 明日場次：${s(p.date)} ${s(p.time)}`, `📍 潛點：${s(p.site)}`]);

      // v975：即時海況（浮標）。有 wave/water 就組海況行；否則退回舊的天氣欄位（若有）。
      if (p.wave || p.water) {
        const bits = [p.wave && `浪高 ${s(p.wave)}`, p.water && `水溫 ${s(p.water)}`].filter(Boolean).join("・");
        const light = p.waveLight ? `${s(p.waveLight)}${p.waveText ? ` ${s(p.waveText)}` : ""}` : "";
        const sea = [`🌊 即時海況${p.buoyLabel ? `（${s(p.buoyLabel)}浮標）` : ""}：${bits}${light ? `　${light}` : ""}`];
        if (p.wetsuit) sea.push(`👕 防寒衣建議：${s(p.wetsuit)}`);
        sec.push(sea);
      } else if (p.weather) {
        sec.push([`🌊 天氣 ${s(p.weather)}・浪高 ${s(p.wave)}・水溫 ${s(p.water)}・能見度 ${s(p.vis)}`]);
      }

      sec.push([`🕗 集合：${s(p.gather)}`]);

      const links: string[] = [];
      if (p.mapUrl) links.push(`📍 集合地圖：${s(p.mapUrl)}`);
      if (p.videoUrl) links.push(`🎬 潛點介紹影片：${s(p.videoUrl)}`);
      if (links.length) sec.push(links);

      return sec.map((g) => g.join("\n")).join("\n\n"); // 段落間空一行
    }
    case "attendance_confirmed": {
      const lv = s(p.vipLevel);
      // v785：不再把長網址塞進內文；改由各管道的「海王子評論」按鈕/連結點擊
      // v992：不再重複「🎉謝謝你…玩得開心嗎?」——那句已是 bodyText(composeFullBody 會帶)，
      //   這裡只補 stats + 三行導引，與 LINE flex 內容一致(避免站內出現兩次感謝詞)。
      // v1034：分段（本次紀錄 / 評價導引），段落間空一行，好讀
      return [
        [
          `🤿 ${s(p.bookingTitle)}`,
          `本次 +${s(p.addLogs)} 潛・海王子累積 ${s(p.totalLogs)} 潛`,
          `會員等級：${/^\d+$/.test(lv) ? `LV${lv}` : lv}`,
        ].join("\n"),
        [
          `喜歡今天的旅程嗎？給我們一則 Google 五星評價鼓勵一下，`,
          `只要一分鐘就好 🙏`,
          `任何建議或想說的，也超歡迎直接回訊息告訴我們 💙`,
        ].join("\n"),
      ].join("\n\n");
    }
    // ── 旅遊潛水（訂金 + 尾款）──
    case "deposit_notice":
      return `旅遊團：${s(p.tourTitle)}\n應繳訂金：NT$ ${m(p.deposit)}\n繳費截止：${s(p.deadline)}\n匯款：${s(p.bankName)} ${s(p.bankAccount)}（戶名 ${s(p.holder)}）\n備註碼：${s(p.refCode)}`;
    case "deposit_confirm":
      return `旅遊團：${s(p.tourTitle)}\n已收訂金：NT$ ${m(p.paid)}\n尾款餘額：NT$ ${m(p.remaining)}\n尾款截止：${s(p.finalDeadline)}`;
    case "deposit_pending":
      return `客戶：${s(p.customerName)}\n旅遊團：${s(p.tourTitle)}\n上傳訂金：NT$ ${m(p.amount)}${p.last5 ? `\n帳號後5碼：${s(p.last5)}` : ""}${p.method ? `\n付款方式：${s(p.method)}` : ""}`;
    case "final_reminder":
      return `旅遊團：${s(p.tourTitle)}\n應繳尾款：NT$ ${m(p.remaining)}\n繳清截止：${s(p.deadline)}（剩 ${s(p.daysLeft)} 天）\n匯款帳號：${s(p.bankAccount)}`;
    case "trip_guide":
      return `旅遊團：${s(p.tourTitle)}\n集合：${s(p.gather)}\n交通：${s(p.transport)}・住宿：${s(p.hotel)}\n領隊：${s(p.leader)}（${s(p.phone)}）`;
    // ── 異常 / 退款 ──
    case "weather_cancel":
      return `取消場次：${s(p.date)} ${s(p.time)}・${s(p.site)}\n原因：${s(p.reason)}${p.options ? `\n選項：${s(p.options)}` : ""}`;
    case "payment_reject":
      return `訂單：${s(p.bookingTitle)}${p.reason ? `\n駁回原因：${s(p.reason)}` : ""}`;
    case "booking_cancel":
      return `訂單：${s(p.bookingTitle)}${p.reason ? `\n取消原因：${s(p.reason)}` : ""}`;
    case "refund_request":
      return `訂單：${s(p.bookingTitle)}\n退款方式：${methodZh(p.method)}${Number(p.creditBonus) > 0 ? `（加成 +${s(p.creditBonus)}%）` : ""}\n退款金額：NT$ ${m(p.amount)}${p.reason ? `\n原因：${s(p.reason)}` : ""}`;
    case "refund_complete":
      return `訂單：${s(p.bookingTitle)}\n退款方式：${methodZh(p.method)}\n退款金額：NT$ ${m(p.amount)}（已完成）`;
    // ── 會員權益 ──
    case "first_order_reward_grant":
      return `首單訂單：${s(p.bookingTitle)}\n獲得抵用金 NT$ ${m(p.amount)}\n目前餘額：NT$ ${m(p.balance)}\n有效期限：${s(p.expiresAt) || "永久"}`;
    case "vip_upgrade": {
      // v1026：emoji 可能為空 → 不留多餘空格；權益多行時逐行縮排；有升等禮金一併告知
      const em = s(p.tierEmoji).trim();
      const lines = [`新等級：${em ? `${em} ` : ""}${s(p.tierName)}`];
      if (p.benefits) {
        const bs = s(p.benefits).split("\n").map((x) => x.trim()).filter(Boolean);
        lines.push(bs.length > 1 ? `專屬權益：\n${bs.map((b) => `・${b}`).join("\n")}` : `專屬權益：${bs[0]}`);
      }
      if (Number(p.upgradeCredit) > 0) lines.push(`升等禮金：NT$ ${m(p.upgradeCredit)}（已存入帳戶）`);
      return lines.join("\n");
    }
    case "birthday_credit":
      return `生日禮金：NT$ ${m(p.amount)}\n${Number(p.expiryDays) > 0 ? `有效 ${s(p.expiryDays)} 天` : "永久有效"}`;
    case "credit_expiry":
      return `可用抵用金：NT$ ${m(p.amount)}\n到期日：${s(p.expireDate)}`;
    // ── 內部 ──
    case "overcap_alert":
      return `場次：${s(p.tripDate)} ${s(p.tripTime)}・${s(p.site)}\n客戶：${s(p.customerName)} 想預約 ${s(p.requestedCount)} 人\n目前：已訂 ${s(p.currentBooked)} / 上限 ${s(p.capacity)} 人`;
    case "admin_weekly":
      return `週期：${s(p.weekRange)}\n營收：NT$ ${m(p.revenue)}\n新增預約：${s(p.bookings)} 筆\n新會員：${s(p.newMembers)} 位\n待處理：${s(p.pending)} 筆`;
    default:
      return "";
  }
}

/**
 * 完整內容主體（站內通知 body / Email 內文 / 預覽 共用）：
 *   副標 + 說明文字 + 固定清單 + 動態資料 + 底部提示/標語
 */
export function composeFullBody(
  key: string,
  params: Record<string, unknown>,
  override?: MsgOverride | null,
): string {
  const parts: string[] = [];
  const subtitle = msgField(key, "subtitle", override);
  const bodyText = msgField(key, "bodyText", override);
  if (subtitle) parts.push(subtitle);
  if (bodyText) parts.push(bodyText);
  const lines = EXTRA_LINES[key];
  if (lines?.length) parts.push(lines.join("\n"));
  const dyn = buildDynamicBody(key, params);
  if (dyn) parts.push(dyn);
  const footerHint = msgField(key, "footerHint", override);
  if (footerHint) parts.push(footerHint);
  const footer = EXTRA_FOOTER[key];
  if (footer) parts.push(footer);
  return parts.join("\n\n");
}

/** 按鈕/站內通知連結：params.url > params.liffUrl */
export function resolveLinkUrl(params: Record<string, unknown>): string | null {
  if (typeof params.url === "string" && params.url) return params.url;
  if (typeof params.liffUrl === "string" && params.liffUrl) return params.liffUrl;
  return null;
}

// ── Email（品牌信件外殼 + 與站內/LINE 同一份內容）──
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function composeEmail(
  key: string,
  params: Record<string, unknown>,
  override?: MsgOverride | null,
  opts?: { subjectPrefix?: string; footnote?: string },
): { subject: string; text: string; html: string } {
  const title = msgField(key, "title", override) || key;
  const subtitle = msgField(key, "subtitle", override);
  const bodyText = msgField(key, "bodyText", override);
  const buttonLabel = msgField(key, "buttonLabel", override);
  const footerHint = msgField(key, "footerHint", override);
  const lines = EXTRA_LINES[key] ?? [];
  const dyn = buildDynamicBody(key, params);
  const footer = EXTRA_FOOTER[key] ?? "";
  // v600b：Email 按鈕預設導小編 LINE OA(避開 awstrack 追蹤破壞 LIFF)
  // v794：任一模板若後台填了「按鈕連結」(buttonUrl) 就改用它；留空則維持小編 LINE
  const ovBtnUrl = msgField(key, "buttonUrl", override);
  // v1032：Email 內的 LIFF 連結會被信件追蹤網址(awstrack)包壞 → 一律改導小編 LINE OA；
  //   其餘外部連結(如 Google 評論)照後台設定。
  const isLiffLink = /^https?:\/\/liff\.line\.me\//i.test(ovBtnUrl ?? "");
  const buttonUrl = ovBtnUrl && ovBtnUrl.length > 0 && !isLiffLink ? ovBtnUrl : EMAIL_BUTTON_URL;
  const heroEmoji = HERO_EMOJI[key] ?? "📩";
  const subject = `${opts?.subjectPrefix ?? ""}${title}`;
  const footnote = opts?.footnote ?? "系統自動通知信 · 動態欄位由系統自動帶入";

  const text = [subject, subtitle, bodyText, lines.join("\n"), dyn, footerHint, footer, buttonUrl ? `${buttonLabel || "前往"}：${buttonUrl}` : ""]
    .filter(Boolean)
    .join("\n\n");

  const listHtml = lines.length
    ? `<div style="margin:14px 0">${key === "welcome" ? '<div style="font-size:13px;font-weight:700;color:#0A2342;margin-bottom:8px">我們在 LINE / Email 為您提供：</div>' : ""}${lines
        .map((l) => `<div style="font-size:13px;line-height:1.6;color:#1A2330;margin:4px 0">${esc(l)}</div>`)
        .join("")}</div>`
    : "";
  // v1033：Email 內文改逐行 <div>（Outlook 不支援 white-space:pre-wrap → 原本擠成一團），
  //   並把長網址轉成「請點擊這裡 →」超連結（畫面乾淨、可讀性佳）。
  const attr = (u: string) => u.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const LINK_STYLE = "display:inline-block;background:#eef9f8;border:1px solid #bde5e0;border-radius:6px;padding:2px 10px;color:#0a8f86;font-weight:700;text-decoration:none;font-size:12.5px;";
  const htmlLine = (line: string) =>
    line
      .split(/(https?:\/\/[^\s]+)/g)
      .map((p) =>
        /^https?:\/\//.test(p)
          ? `<a href="${attr(p)}" style="${LINK_STYLE}">請點擊這裡 →</a>`
          : esc(p),
      )
      .join("");
  const dynHtml = dyn
    ? `<div style="background:#f4f9f8;border:1px solid #e2efed;border-radius:9px;padding:12px 14px;margin:16px 0;font-size:13px;color:#33464e;line-height:1.9;">${
        dyn.split("\n").map((l) =>
          l.trim() === ""
            ? `<div style="height:8px;line-height:8px;">&nbsp;</div>`
            : `<div>${htmlLine(l)}</div>`,
        ).join("")
      }</div>`
    : "";
  const hintHtml = footerHint
    ? `<div style="margin-top:14px;text-align:center;font-size:12px;color:#0a8f86;font-weight:600">${esc(footerHint)}</div>`
    : "";
  const footerHtml = footer
    ? `<div style="margin-top:14px;text-align:center;font-size:12px;color:#6B7682;font-style:italic">${esc(footer)}</div>`
    : "";
  // v1034：CTA 改「明確文字」——移除只有箭頭的寫法（客戶難解讀），按鈕下方加一行說明
  const CTA_HINT: Record<string, string> = {
    attendance_confirmed: "只要 30 秒就能完成，是給教練最大的鼓勵 🙏",
    booking_confirm: "可查看場次時間、集合地點與應付金額",
    d1_reminder: "可查看集合地點、海況與這筆預約的完整資訊",
    deposit_notice: "上傳截圖後我們會盡快核對，名額即正式保留",
    final_reminder: "上傳截圖後我們會盡快核對",
    trip_guide: "出發前花三分鐘看過，下水更安心",
    weather_cancel: "我們會協助你改期，或安排退費／轉抵用金",
    first_order_reward_grant: "可查看餘額與使用期限",
    credit_expiry: "選一個場次，結帳時就能直接折抵",
    vip_upgrade: "可查看你的等級、專屬權益與升等禮金",
    birthday_credit: "禮金已在帳戶裡，預約時可直接折抵",
    payment_reject: "重新上傳後我們會馬上再核對一次",
    refund_request: "確認後我們會立即為你處理",
    booking_cancel: "隨時歡迎再約，海就在那裡 🌊",
  };
  const btnHtml = buttonUrl && buttonLabel
    ? `<div style="text-align:center;margin-top:22px;">
        <a href="${buttonUrl}" style="display:inline-block;background-color:#00D9CB;color:#0A2342;padding:14px 36px;border-radius:10px;font-weight:800;text-decoration:none;font-size:15px;line-height:1.3;">${esc(buttonLabel)}</a>
        ${CTA_HINT[key] ? `<div style="margin-top:9px;font-size:12px;color:#6B7682;line-height:1.6;">${esc(CTA_HINT[key])}</div>` : ""}
      </div>`
    : "";
  // v994：第二顆按鈕（到場確認「有需要改善?告訴我們」）—— Email 導小編 LINE OA(email 外部無法直接進站內客服)
  const btn2Label = msgField(key, "button2Label", override);
  const btn2Html = btn2Label
    ? `<div style="text-align:center;margin-top:10px;"><a href="${EMAIL_BUTTON_URL}" style="display:inline-block;background-color:#ffffff;color:#0A2342;border:1.5px solid #cfdbe0;padding:11px 28px;border-radius:10px;font-weight:700;text-decoration:none;font-size:13.5px;">${esc(btn2Label)}</a></div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#1A2330;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f7" style="background-color:#eef2f7;">
    <tr><td align="center" style="padding:20px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e9f0;">
        <tr><td bgcolor="#0A2342" style="background-color:#0A2342;padding:20px 26px;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;line-height:1.3;">🌊 東北角海王子潛水團</div>
          <div style="font-size:11px;letter-spacing:3px;color:#00D9CB;margin-top:3px;">SEA PRINCE DIVING</div>
        </td></tr>
        <tr><td style="background-color:#eef9f8;padding:18px 26px;border-bottom:1px solid #e3e9f0;">
          <div style="font-size:20px;font-weight:800;color:#0A2342;line-height:1.35;">${heroEmoji} ${esc(title)}</div>
          ${subtitle ? `<div style="font-size:13.5px;color:#0a8f86;font-weight:600;margin-top:4px;">${esc(subtitle)}</div>` : ""}
        </td></tr>
        <tr><td style="padding:22px 26px;color:#1A2330;font-size:14px;line-height:1.75;">
          ${bodyText ? `<p style="margin:0 0 8px;color:#374151;white-space:pre-wrap;">${esc(bodyText)}</p>` : ""}
          ${listHtml}
          ${dynHtml}
          ${hintHtml}
          ${footerHtml}
          ${btnHtml}
          ${btn2Html}
        </td></tr>
        <tr><td bgcolor="#f5f7fa" style="background-color:#f5f7fa;padding:14px 26px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center;">
          ${footnote}<br>
          東北角海王子潛水 · 安全．專業，陪你看見海
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
