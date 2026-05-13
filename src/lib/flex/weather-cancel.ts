import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// 天氣取消通知
// params: { date, time, site, reason, options, url }
export function weatherCancel(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.coral,
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "title", "🌊 場次取消通知"), color: "#ffffff", weight: "bold", size: "md" },
        { type: "text", text: `${asString(params.date)} ${asString(params.time)}`, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" },
        { type: "text", text: asString(params.site), color: "#ffffff", size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "因海況不適合下水，本場次取消", weight: "bold", size: "md", wrap: true },
        { type: "text", text: asString(params.reason, "浪高超過 1.5m"), color: COLORS.mute, size: "xs", margin: "sm", wrap: true },
        { type: "separator", margin: "md" },
        { type: "text", text: "您可選擇：", color: COLORS.mute, size: "xs", margin: "md" },
        { type: "text", text: asString(params.options, "1. 改期至下次同類型場次（推薦）\n2. 全額退費"), wrap: true, size: "sm" },
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
          action: { type: "uri", label: ovr(override, "buttonLabel", "聯繫教練改期"), uri: asString(params.url, "https://line.me/") },
        },
      ],
    },
  });
}
