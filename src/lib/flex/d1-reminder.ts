import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// D-1 行前提醒
// params: { date, time, site, weather, wave, water, vis, gather }
export function d1Reminder(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanSurface,
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "title", "🤿 明日行前提醒"), color: COLORS.phosphor, weight: "bold", size: "md" },
        { type: "text", text: `${asString(params.date)} ${asString(params.time)}`, color: "#ffffff", size: "lg", weight: "bold", margin: "xs" },
        { type: "text", text: asString(params.site), color: "#ffffff", size: "md", margin: "xs" },
        ...(override?.subtitle ? [{ type: "text" as const, text: override.subtitle, color: "#ffffff", size: "xs", margin: "xs", wrap: true }] : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: "明日海況", color: COLORS.mute, size: "xs" },
        kv("天氣", asString(params.weather, "晴")),
        kv("浪高", asString(params.wave, "1m")),
        kv("水溫", asString(params.water, "24°C")),
        kv("能見度", asString(params.vis, "8-12m")),
        { type: "separator", margin: "md" },
        { type: "text", text: "集合地點 / 時間", color: COLORS.mute, size: "xs", margin: "md" },
        { type: "text", text: asString(params.gather, "—"), weight: "bold", wrap: true },
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
