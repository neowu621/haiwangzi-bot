import { COLORS, asString, asNumber, flex } from "./_common";
import type { FlexMessage } from "./index";

// 尾款提醒 (D-3)
// params: { tourTitle, remaining, deadline, daysLeft, bankAccount, holder, url }
export function finalReminder(
  params: Record<string, unknown>,
  altText: string,
): FlexMessage {
  const days = asNumber(params.daysLeft, 3);
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.coral,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "⏳ 尾款提醒", color: "#ffffff", weight: "bold", size: "md" },
        { type: "text", text: `還剩 ${days} 天`, color: "#ffffff", size: "xl", weight: "bold", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: asString(params.tourTitle), weight: "bold", size: "md", wrap: true },
        { type: "separator", margin: "md" },
        kv("應繳金額", `NT$ ${asNumber(params.remaining).toLocaleString()}`),
        kv("繳清截止", asString(params.deadline)),
        kv("銀行帳號", asString(params.bankAccount)),
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: "上傳尾款截圖",
            uri: asString(params.url, "https://line.me/"),
          },
        },
      ],
    },
  });
}
function kv(k: string, v: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, color: COLORS.mute, size: "sm", flex: 2 },
      { type: "text", text: v, weight: "bold", size: "sm", flex: 5, wrap: true },
    ],
  };
}
