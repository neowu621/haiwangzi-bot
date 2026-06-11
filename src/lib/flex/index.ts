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
import { paymentReject } from "./payment-reject";
import { bookingCancel } from "./booking-cancel";
import { refundComplete } from "./refund-complete";
import { vipUpgrade } from "./vip-upgrade";
import { birthdayCredit } from "./birthday-credit";
import { creditExpiry } from "./credit-expiry";

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
  // 收款 / 異常 / 會員 — 新增模板
  payment_reject: paymentReject,
  booking_cancel: bookingCancel,
  refund_complete: refundComplete,
  vip_upgrade: vipUpgrade,
  birthday_credit: birthdayCredit,
  credit_expiry: creditExpiry,
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

/** v480：呼叫端已查好 override 時用（notifyCustomer 單次查詢、不重複打 DB） */
export function buildFlexWithOverride(
  key: FlexTemplateKey,
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride | null,
): FlexMessage {
  const builder = FLEX_TEMPLATES[key];
  if (!builder) throw new Error(`unknown flex template: ${key}`);
  return builder(params, altText, override ?? undefined);
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
  payment_reject: "付款證明駁回",
  booking_cancel: "訂單取消通知",
  refund_complete: "退款完成通知",
  vip_upgrade: "VIP 升等通知",
  birthday_credit: "生日禮金發放",
  credit_expiry: "抵用金到期提醒",
};

// v196：每個 template 的分組 + icon + 預設管道開關
// defaultInApp：站內訊息通知（第三通道）預設值。客戶旅程相關 = true；純內部/管理用（發給老闆）= false
export const FLEX_TEMPLATE_META: Record<
  FlexTemplateKey,
  { group: string; icon: string; defaultLine: boolean; defaultEmail: boolean; defaultInApp: boolean }
> = {
  welcome:         { group: "加入",          icon: "👋", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  booking_confirm: { group: "預約",          icon: "✅", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  deposit_notice:  { group: "收款",          icon: "💰", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  deposit_confirm: { group: "收款",          icon: "✅", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  final_reminder:  { group: "收款",          icon: "🛟", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  trip_guide:      { group: "行前",          icon: "📘", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  // v480：D-1 email 原本走 tripGuideEmail；改模板組稿後預設開啟以保留行為
  d1_reminder:     { group: "行前",          icon: "🐡", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  weather_cancel:  { group: "異常",          icon: "🌧️", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  overcap_alert:   { group: "管理者（內部）", icon: "⚠️", defaultLine: true,  defaultEmail: true,  defaultInApp: false },
  admin_weekly:    { group: "管理者（內部）", icon: "📊", defaultLine: false, defaultEmail: true,  defaultInApp: false },
  attendance_confirmed:    { group: "到場 / 完成", icon: "🐠", defaultLine: true,  defaultEmail: false, defaultInApp: true  },
  first_order_reward_grant:{ group: "到場 / 完成", icon: "🎁", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  refund_request:          { group: "異常",        icon: "💸", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  payment_reject:          { group: "收款",        icon: "🚫", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  booking_cancel:          { group: "異常",        icon: "❌", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  refund_complete:         { group: "異常",        icon: "✅", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  vip_upgrade:             { group: "會員",        icon: "🌟", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  birthday_credit:         { group: "會員",        icon: "🎂", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
  credit_expiry:           { group: "會員",        icon: "💳", defaultLine: true,  defaultEmail: true,  defaultInApp: true  },
};

/**
 * 每個 template 可編輯的欄位 + 預設值
 * v480：搬到 @/lib/message-content（單一來源，後台顯示的預設＝實際發送 fallback）
 * 這裡 re-export 維持既有 import 相容
 */
export { MSG_EDITABLE_FIELDS as FLEX_EDITABLE_FIELDS } from "@/lib/message-content";

