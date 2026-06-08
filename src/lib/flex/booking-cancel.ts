import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 訂單取消通知（給客戶）
 *
 * params:
 *   bookingTitle: string — 訂單描述
 *   reason: string       — 取消原因（可空）
 *   liffUrl: string      — 我的預約頁
 */
export function bookingCancel(
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
        { type: "text", text: "❌", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "您的預約已取消"),
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
            "您的這筆預約已取消。若有任何疑問，歡迎直接 LINE 與我們聯繫。",
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
            label: ovr(override, "buttonLabel", "查看我的預約"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
