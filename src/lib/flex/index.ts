import type { messagingApi } from "@line/bot-sdk";
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

export type FlexMessage = messagingApi.FlexMessage;

export const FLEX_TEMPLATES = {
  booking_confirm: bookingConfirm,
  d1_reminder: d1Reminder,
  deposit_notice: depositNotice,
  deposit_confirm: depositConfirm,
  final_reminder: finalReminder,
  trip_guide: tripGuide,
  weather_cancel: weatherCancel,
  admin_weekly: adminWeekly,
  overcap_alert: overcapAlert,
  welcome: welcome,
} as const;

export type FlexTemplateKey = keyof typeof FLEX_TEMPLATES;

export function buildFlexByKey(
  key: FlexTemplateKey,
  params: Record<string, unknown>,
  altText: string,
): FlexMessage {
  const builder = FLEX_TEMPLATES[key];
  if (!builder) throw new Error(`unknown flex template: ${key}`);
  return builder(params, altText);
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
};
