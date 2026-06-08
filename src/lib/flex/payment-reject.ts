import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 付款證明駁回（給客戶）
 *
 * params:
 *   bookingTitle: string — 訂單描述
 *   reason: string       — 駁回原因（可空）
 *   liffUrl: string      — 重新上傳頁
 */
export function paymentReject(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const bookingTitle = asString(params.bookingTitle, "");
  const reason = asString(params.reason, "");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "🚫", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "付款證明需要重傳"),
          color: "#ffffff",
          weight: "bold",
          size: "lg",
          align: "center",
          margin: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: bookingTitle, weight: "bold", size: "sm", wrap: true },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: ovr(
            override,
            "bodyText",
            "您上傳的轉帳證明未能核對通過，請依正確金額重新上傳轉帳截圖。如有疑問歡迎 LINE 聯繫我們。",
          ),
          size: "sm",
          color: COLORS.mute,
          margin: "md",
          wrap: true,
        },
        ...(reason
          ? [
              { type: "separator" as const, margin: "md" },
              { type: "text" as const, text: `原因：${reason}`, size: "sm", color: COLORS.coral, margin: "md", wrap: true },
            ]
          : []),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: ovr(override, "buttonLabel", "重新上傳截圖"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
