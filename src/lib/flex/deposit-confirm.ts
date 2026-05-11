import { COLORS, asString, asNumber, flex } from "./_common";
import type { FlexMessage } from "./index";

// 訂金確認
// params: { tourTitle, paid, remaining, finalDeadline }
export function depositConfirm(
  params: Record<string, unknown>,
  altText: string,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.phosphor,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "✓ 訂金已確認", color: COLORS.oceanDeep, weight: "bold", size: "md" },
        { type: "text", text: asString(params.tourTitle), color: COLORS.oceanDeep, size: "lg", weight: "bold", margin: "xs", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "您的位置已保留 🎉", weight: "bold", size: "md" },
        { type: "separator", margin: "md" },
        kv("已繳訂金", `NT$ ${asNumber(params.paid).toLocaleString()}`),
        kv("尾款餘額", `NT$ ${asNumber(params.remaining).toLocaleString()}`),
        kv("尾款繳清", asString(params.finalDeadline)),
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
