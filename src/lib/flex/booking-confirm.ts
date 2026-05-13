import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// 預約確認 Flex 卡
// params: { name, date, time, site, total, bookingId? }
export function bookingConfirm(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "title", "✓ 預約成功"), color: COLORS.phosphor, weight: "bold", size: "md" },
        { type: "text", text: ovr(override, "subtitle", "海王子潛水團"), color: "#ffffff", weight: "bold", size: "xl", margin: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: asString(params.name, "—"), weight: "bold", size: "lg" },
        { type: "separator", margin: "sm" },
        kv("日期", asString(params.date)),
        kv("時間", asString(params.time)),
        kv("潛點", asString(params.site)),
        kv("金額", `NT$ ${asNumber(params.total).toLocaleString()}`),
        { type: "text", text: "（當日現場收費）", size: "xs", color: COLORS.mute, margin: "md" },
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
          action: { type: "uri", label: ovr(override, "buttonLabel", "查看我的預約"), uri: asString(params.url, "https://line.me/") },
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
