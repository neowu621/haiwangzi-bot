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
  | "altText"
  | "footerHint";

/** 與 prisma MessageTemplate / flex TemplateOverride 同形（只取文字欄位） */
export interface MsgOverride {
  title?: string | null;
  subtitle?: string | null;
  bodyText?: string | null;
  buttonLabel?: string | null;
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
  booking_confirm: [
    { key: "title", label: "標題", defaultValue: "✅ 預約成功" },
    { key: "subtitle", label: "副標", defaultValue: "您的日潛預約已確認" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的預約" },
    { key: "altText", label: "通知列文字", defaultValue: "預約已確認" },
  ],
  d1_reminder: [
    { key: "title", label: "標題", defaultValue: "🔱 明日行前提醒" },
    { key: "subtitle", label: "副標", defaultValue: "海況穩定，記得帶裝備" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看詳情" },
    { key: "altText", label: "通知列文字", defaultValue: "明日行前提醒" },
  ],
  deposit_notice: [
    { key: "title", label: "標題", defaultValue: "💰 訂金繳費通知" },
    { key: "bodyText", label: "說明文字", defaultValue: "請於截止日前完成訂金匯款" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "上傳轉帳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "請繳訂金" },
  ],
  deposit_confirm: [
    { key: "title", label: "標題", defaultValue: "✅ 訂金已收到" },
    { key: "subtitle", label: "副標", defaultValue: "謝謝您的繳費，位置已保留 🎉" },
    { key: "altText", label: "通知列文字", defaultValue: "訂金已收" },
  ],
  final_reminder: [
    { key: "title", label: "標題", defaultValue: "⏰ 尾款繳費提醒" },
    { key: "bodyText", label: "說明文字", defaultValue: "出發前請完成尾款" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "上傳轉帳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "尾款提醒" },
  ],
  trip_guide: [
    { key: "title", label: "標題", defaultValue: "📘 行前手冊" },
    { key: "bodyText", label: "注意事項", defaultValue: "請攜帶證照、防寒衣、防曬等" },
    { key: "altText", label: "通知列文字", defaultValue: "行前手冊" },
  ],
  weather_cancel: [
    { key: "title", label: "標題", defaultValue: "🌊 場次取消通知" },
    { key: "bodyText", label: "說明", defaultValue: "因海況不適合下水，本場次取消" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "聯繫教練改期" },
    { key: "altText", label: "通知列文字", defaultValue: "場次取消" },
  ],
  admin_weekly: [
    { key: "title", label: "標題", defaultValue: "📊 上週營運摘要" },
    { key: "subtitle", label: "副標", defaultValue: "本週統計報表" },
    { key: "altText", label: "通知列文字", defaultValue: "週報" },
  ],
  overcap_alert: [
    { key: "title", label: "標題", defaultValue: "⚠️ 超賣警示" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "處理此預約" },
    { key: "altText", label: "通知列文字", defaultValue: "超賣警示" },
  ],
  welcome: [
    { key: "title", label: "歡迎標語", defaultValue: "歡迎潛入" },
    { key: "subtitle", label: "副標", defaultValue: "東北角海王子潛水" },
    { key: "bodyText", label: "說明", defaultValue: "安全．專業．陪你看見海" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "開啟預約 App" },
    { key: "altText", label: "通知列文字", defaultValue: "歡迎加入" },
  ],
  attendance_confirmed: [
    { key: "title", label: "標題", defaultValue: "已記錄您的到場" },
    { key: "bodyText", label: "說明文字", defaultValue: "感謝您今日的參與，期待下次海上見！" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的紀錄" },
    { key: "altText", label: "通知列文字", defaultValue: "已記錄到場" },
  ],
  first_order_reward_grant: [
    { key: "title", label: "標題", defaultValue: "首單獎勵入帳" },
    { key: "bodyText", label: "說明文字", defaultValue: "感謝您完成首次潛水！為了感謝您的支持，我們已將首單抵用金存入您的帳戶。" },
    { key: "footerHint", label: "底部提示", defaultValue: "下次預約時可直接折抵 ✨" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的抵用金" },
    { key: "altText", label: "通知列文字", defaultValue: "首單獎勵已入帳" },
  ],
  refund_request: [
    { key: "title", label: "標題", defaultValue: "退款申請待您確認" },
    { key: "bodyText", label: "說明文字", defaultValue: "請點下方按鈕確認接受，或選擇有疑問與店家聯絡。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看詳情並確認" },
    { key: "altText", label: "通知列文字", defaultValue: "退款申請待確認" },
  ],
  payment_reject: [
    { key: "title", label: "標題", defaultValue: "付款證明需要重傳" },
    { key: "bodyText", label: "說明文字", defaultValue: "您上傳的轉帳證明未能核對通過，請依正確金額重新上傳轉帳截圖。如有疑問歡迎 LINE 聯繫我們。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "重新上傳截圖" },
    { key: "altText", label: "通知列文字", defaultValue: "付款證明需重傳" },
  ],
  booking_cancel: [
    { key: "title", label: "標題", defaultValue: "您的預約已取消" },
    { key: "bodyText", label: "說明文字", defaultValue: "您的這筆預約已取消。若有任何疑問，歡迎直接 LINE 與我們聯繫。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的預約" },
    { key: "altText", label: "通知列文字", defaultValue: "預約已取消" },
  ],
  refund_complete: [
    { key: "title", label: "標題", defaultValue: "退款已完成" },
    { key: "bodyText", label: "說明文字", defaultValue: "您的退款已處理完成，感謝您的耐心。" },
    { key: "altText", label: "通知列文字", defaultValue: "退款已完成" },
  ],
  vip_upgrade: [
    { key: "title", label: "標題", defaultValue: "恭喜升等" },
    { key: "bodyText", label: "說明文字", defaultValue: "謝謝你一直跟著海王子潛水，已為你升級會員等級，享有更多專屬優惠。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的會員" },
    { key: "altText", label: "通知列文字", defaultValue: "會員升等通知" },
  ],
  birthday_credit: [
    { key: "title", label: "標題", defaultValue: "生日快樂！🎂" },
    { key: "bodyText", label: "說明文字", defaultValue: "祝你生日快樂！我們準備了一份生日禮金給你，已存入你的帳戶。" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "立即使用禮金" },
    { key: "altText", label: "通知列文字", defaultValue: "生日禮金到帳" },
  ],
  credit_expiry: [
    { key: "title", label: "標題", defaultValue: "抵用金即將到期" },
    { key: "bodyText", label: "說明文字", defaultValue: "提醒你，帳戶內的抵用金即將到期，記得在期限前預約使用，別讓優惠過期囉！" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "立即預約使用" },
    { key: "altText", label: "通知列文字", defaultValue: "抵用金即將到期" },
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
  welcome: "🌊", booking_confirm: "✅", deposit_notice: "💰", deposit_confirm: "✅",
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
  booking_confirm: { name: "王小明", date: "2026-06-14", time: "08:30", site: "龍洞灣 體驗潛水", total: 2400, url: `${SAMPLE_BASE}/liff/my` },
  d1_reminder: { date: "2026-06-14", time: "08:30", site: "深澳", weather: "晴時多雲", wave: "0.5 m", water: "27°C", vis: "8-12 m", gather: "深澳漁港停車場 07:50" },
  deposit_notice: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", deposit: 8000, deadline: "2026-09-01", bankName: "玉山銀行（808）", bankAccount: "0163-979-251023", holder: "汪○○", refCode: "HW-2409", url: `${SAMPLE_BASE}/liff/my` },
  deposit_confirm: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", paid: 8000, remaining: 9000, finalDeadline: "2026-09-15" },
  final_reminder: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", remaining: 9000, deadline: "2026-09-15", daysLeft: 3, bankAccount: "0163-979-251023", url: `${SAMPLE_BASE}/liff/my` },
  trip_guide: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", gather: "後壁湖碼頭 07:00", transport: "藍鯨號客輪", hotel: "蘭嶼海景民宿", leader: "汪教練", phone: "0988-346-634" },
  weather_cancel: { date: "2026-06-14", time: "08:30", site: "鶯歌石", reason: "今日東北風 6 級、浪高 1.8 m，海況不適合下水", options: "🅰️ 改期 🅱️ 全額退費 / 轉抵用金 +10%", url: `${SAMPLE_BASE}/liff/my` },
  admin_weekly: { weekRange: "2026-06-02 ~ 06-08", revenue: 86400, bookings: 23, newMembers: 6, pending: 3 },
  overcap_alert: { tripDate: "2026-06-14", tripTime: "08:30", site: "鶯歌石", customerName: "王小明", requestedCount: 2, currentBooked: 8, capacity: 8, url: `${SAMPLE_BASE}/liff/coach/today` },
  welcome: { liffUrl: "https://liff.line.me" },
  attendance_confirmed: { bookingTitle: "6/14 龍洞灣 體驗潛水", addLogs: 2, totalLogs: 38, vipLevel: "LV2 小丑魚", liffUrl: "https://liff.line.me" },
  first_order_reward_grant: { amount: 100, balance: 100, expiresAt: "2027-06-14", bookingTitle: "6/14 龍洞灣 體驗潛水", liffUrl: "https://liff.line.me" },
  refund_request: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2400, method: "credit", creditBonus: 10, reason: "臨時有事無法參加", liffUrl: "https://liff.line.me" },
  payment_reject: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "轉帳金額與應繳不符（少 200 元），請確認後重新上傳", liffUrl: "https://liff.line.me" },
  booking_cancel: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "因人數不足取消，造成不便敬請見諒", liffUrl: "https://liff.line.me" },
  refund_complete: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2640, method: "credit", liffUrl: "https://liff.line.me" },
  vip_upgrade: { tierName: "LV3 海龜", tierEmoji: "🐢", benefits: "每筆訂單 95 折・生日禮金 200・優先候補", liffUrl: "https://liff.line.me" },
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
    case "booking_confirm":
      return `預約場次：${s(p.site)}\n出發時間：${s(p.date)} ${s(p.time)}\n應付金額：NT$ ${m(p.total)}（一次付清）`;
    case "d1_reminder": {
      const head = `明日場次：${s(p.date)} ${s(p.time)}・${s(p.site)}`;
      const sea = p.weather ? `\n天氣 ${s(p.weather)}・浪高 ${s(p.wave)}・水溫 ${s(p.water)}・能見度 ${s(p.vis)}` : "";
      return `${head}${sea}\n集合：${s(p.gather)}`;
    }
    case "attendance_confirmed": {
      const lv = s(p.vipLevel);
      return `${s(p.bookingTitle)}\n本次 +${s(p.addLogs)} 潛・海王子累積 ${s(p.totalLogs)} 潛\n會員等級：${/^\d+$/.test(lv) ? `LV${lv}` : lv}`;
    }
    // ── 旅遊潛水（訂金 + 尾款）──
    case "deposit_notice":
      return `旅遊團：${s(p.tourTitle)}\n應繳訂金：NT$ ${m(p.deposit)}\n繳費截止：${s(p.deadline)}\n匯款：${s(p.bankName)} ${s(p.bankAccount)}（戶名 ${s(p.holder)}）\n備註碼：${s(p.refCode)}`;
    case "deposit_confirm":
      return `旅遊團：${s(p.tourTitle)}\n已收訂金：NT$ ${m(p.paid)}\n尾款餘額：NT$ ${m(p.remaining)}\n尾款截止：${s(p.finalDeadline)}`;
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
    case "vip_upgrade":
      return `新等級：${s(p.tierEmoji)} ${s(p.tierName)}${p.benefits ? `\n專屬權益：${s(p.benefits)}` : ""}`;
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
  // v600b：Email 按鈕一律導小編 LINE OA(避開 awstrack 追蹤破壞 LIFF);忽略 params.url/liffUrl
  const buttonUrl = EMAIL_BUTTON_URL;
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
  const dynHtml = dyn
    ? `<div style="background:#f4f9f8;border:1px solid #e2efed;border-radius:9px;padding:12px 14px;margin:16px 0;font-size:13px;color:#33464e;line-height:1.8;white-space:pre-wrap">${esc(dyn)}</div>`
    : "";
  const hintHtml = footerHint
    ? `<div style="margin-top:14px;text-align:center;font-size:12px;color:#0a8f86;font-weight:600">${esc(footerHint)}</div>`
    : "";
  const footerHtml = footer
    ? `<div style="margin-top:14px;text-align:center;font-size:12px;color:#6B7682;font-style:italic">${esc(footer)}</div>`
    : "";
  const btnHtml = buttonUrl && buttonLabel
    ? `<div style="text-align:center;margin-top:20px;"><a href="${buttonUrl}" style="display:inline-block;background-color:#00D9CB;color:#0A2342;padding:13px 34px;border-radius:10px;font-weight:800;text-decoration:none;font-size:14px;">${esc(buttonLabel)} →</a></div>`
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
