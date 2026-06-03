import type { messagingApi } from "@line/bot-sdk";
import { prisma } from "@/lib/prisma";
import type { TemplateOverride } from "./_common";
import { bookingConfirm } from "./booking-confirm";
import { d1Reminder } from "./d1-reminder";
import { depositNotice } from "./deposit-notice";
import { depositConfirm } from "./deposit-confirm";
import { finalReminder } from "./final-reminder";
import { tripGuide } from "./trip-guide";
import { weatherCancel } from "./weather-cancel";
import { adminWeekly } from "./admin-weekly";
import { overcapAlert } from "./overcap-alert";
import { welcome } from "./welcome";
import { firstOrderRewardGrant } from "./first-order-reward-grant";
import { attendanceConfirmed } from "./attendance-confirmed";
import { refundRequest } from "./refund-request";

export type FlexMessage = messagingApi.FlexMessage;

/**
 * Factory signature：每個 template factory 接受 (params, altText, override?)
 * 同步使用：buildFlexByKey(key, params, altText) — 不讀 DB
 * 非同步用：buildFlexByKeyAsync(key, params, altText) — 讀 DB override
 */
type FlexFactory = (
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
) => FlexMessage;

// v229：依「客戶旅程」順序排列 — 加入 → 預約 → 收款 → 行前 → 異常 → 管理者
export const FLEX_TEMPLATES: Record<string, FlexFactory> = {
  // 加入
  welcome: welcome,
  // 預約
  booking_confirm: bookingConfirm,
  // 收款
  deposit_notice: depositNotice,
  deposit_confirm: depositConfirm,
  final_reminder: finalReminder,
  // 行前
  trip_guide: tripGuide,
  d1_reminder: d1Reminder,
  // 異常
  weather_cancel: weatherCancel,
  // 管理者（內部）
  overcap_alert: overcapAlert,
  admin_weekly: adminWeekly,
  // v270：到場 / 完成 / 首單獎勵通知
  attendance_confirmed: attendanceConfirmed,
  first_order_reward_grant: firstOrderRewardGrant,
  // v274：退款申請
  refund_request: refundRequest,
} as const;

export type FlexTemplateKey = keyof typeof FLEX_TEMPLATES;

/** 同步建構 — 不讀 DB override，舊呼叫位點繼續用 */
export function buildFlexByKey(
  key: FlexTemplateKey,
  params: Record<string, unknown>,
  altText: string,
): FlexMessage {
  const builder = FLEX_TEMPLATES[key];
  if (!builder) throw new Error(`unknown flex template: ${key}`);
  return builder(params, altText);
}

/** 非同步建構 — 讀 DB 的 MessageTemplate override 再套 */
export async function buildFlexByKeyAsync(
  key: FlexTemplateKey,
  params: Record<string, unknown>,
  altText: string,
): Promise<FlexMessage> {
  const builder = FLEX_TEMPLATES[key];
  if (!builder) throw new Error(`unknown flex template: ${key}`);
  const override = await prisma.messageTemplate.findUnique({ where: { key } });
  const finalAlt = override?.altText ?? altText;
  return builder(params, finalAlt, override ?? undefined);
}

export const FLEX_TEMPLATE_LABELS: Record<FlexTemplateKey, string> = {
  booking_confirm: "預約確認",
  d1_reminder: "D-1 行前提醒",
  deposit_notice: "訂金繳費通知",
  deposit_confirm: "訂金確認",
  final_reminder: "尾款提醒",
  trip_guide: "行前手冊",
  weather_cancel: "天氣取消通知",
  admin_weekly: "Admin 週報摘要",
  overcap_alert: "超賣警示",
  welcome: "歡迎加入",
  attendance_confirmed: "到場確認",
  first_order_reward_grant: "首單獎勵發放",
  refund_request: "退款申請（待客戶確認）",
};

// v196：每個 template 的分組 + icon + 預設管道開關
export const FLEX_TEMPLATE_META: Record<
  FlexTemplateKey,
  { group: string; icon: string; defaultLine: boolean; defaultEmail: boolean }
> = {
  welcome:         { group: "加入",          icon: "👋", defaultLine: true,  defaultEmail: true  },
  booking_confirm: { group: "預約",          icon: "✅", defaultLine: true,  defaultEmail: true  },
  deposit_notice:  { group: "收款",          icon: "💰", defaultLine: true,  defaultEmail: true  },
  deposit_confirm: { group: "收款",          icon: "✅", defaultLine: true,  defaultEmail: true  },
  final_reminder:  { group: "收款",          icon: "🛟", defaultLine: true,  defaultEmail: true  },
  trip_guide:      { group: "行前",          icon: "📘", defaultLine: true,  defaultEmail: true  },
  d1_reminder:     { group: "行前",          icon: "🐡", defaultLine: true,  defaultEmail: false },
  weather_cancel:  { group: "異常",          icon: "🌧️", defaultLine: true,  defaultEmail: true  },
  overcap_alert:   { group: "管理者（內部）", icon: "⚠️", defaultLine: true,  defaultEmail: true  },
  admin_weekly:    { group: "管理者（內部）", icon: "📊", defaultLine: false, defaultEmail: true  },
  attendance_confirmed:    { group: "到場 / 完成", icon: "🐠", defaultLine: true,  defaultEmail: false },
  first_order_reward_grant:{ group: "到場 / 完成", icon: "🎁", defaultLine: true,  defaultEmail: true  },
  refund_request:          { group: "異常",        icon: "💸", defaultLine: true,  defaultEmail: true  },
};

/**
 * 每個 template 可編輯的欄位 + 預設值
 * 給 /liff/admin/templates 顯示用
 */
export const FLEX_EDITABLE_FIELDS: Record<
  FlexTemplateKey,
  Array<{ key: keyof TemplateOverride; label: string; defaultValue: string }>
> = {
  booking_confirm: [
    { key: "title", label: "標題", defaultValue: "✅ 預約成功" },
    { key: "subtitle", label: "副標", defaultValue: "您的日潛預約已確認" },
    { key: "buttonLabel", label: "按鈕文字", defaultValue: "查看我的預約" },
    { key: "altText", label: "通知列文字", defaultValue: "預約已確認" },
  ],
  d1_reminder: [
    { key: "title", label: "標題", defaultValue: "🤿 明日行前提醒" },
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
    { key: "subtitle", label: "副標", defaultValue: "謝謝您的繳費" },
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
};
