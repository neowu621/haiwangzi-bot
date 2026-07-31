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
        { type: "text", text: ovr(override, "title", "🔱 明日行前提醒"), color: COLORS.phosphor, weight: "bold", size: "md" },
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
        // v975：即時海況（浮標）——有資料才顯示，無資料整區略過
        ...(params.wave || params.water
          ? [
              { type: "text" as const, text: `即時海況${params.buoyLabel ? `（${asString(params.buoyLabel)}浮標）` : ""}`, color: COLORS.mute, size: "xs" as const },
              ...(params.wave ? [kv("浪高", `${asString(params.wave)}${params.waveText ? `　${asString(params.waveLight)} ${asString(params.waveText)}` : ""}`)] : []),
              ...(params.water ? [kv("水溫", asString(params.water))] : []),
              ...(params.wetsuit ? [kv("防寒衣", asString(params.wetsuit))] : []),
              { type: "separator" as const, margin: "md" as const },
            ]
          : []),
        { type: "text", text: "集合地點 / 時間", color: COLORS.mute, size: "xs", margin: "md" },
        { type: "text", text: asString(params.gather, "—"), weight: "bold", wrap: true },
      ],
    },
    // v480：有連結時加按鈕（buttonLabel 接後台欄位）
    //   v973：另加「集合地圖」「潛點介紹影片」連結按鈕（有填才顯示）
    ...(params.url || params.liffUrl || params.mapUrl || params.videoUrl
      ? {
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            paddingAll: "12px",
            contents: [
              ...(params.url || params.liffUrl
                ? [{
                    type: "button" as const,
                    style: "primary" as const,
                    color: COLORS.phosphor,
                    action: { type: "uri" as const, label: ovr(override, "buttonLabel", "查看詳情"), uri: asString(params.url ?? params.liffUrl) },
                  }]
                : []),
              ...(params.mapUrl
                ? [{
                    type: "button" as const,
                    style: "secondary" as const,
                    height: "sm" as const,
                    action: { type: "uri" as const, label: "📍 集合地圖", uri: asString(params.mapUrl) },
                  }]
                : []),
              ...(params.videoUrl
                ? [{
                    type: "button" as const,
                    style: "secondary" as const,
                    height: "sm" as const,
                    action: { type: "uri" as const, label: "🎬 潛點介紹影片", uri: asString(params.videoUrl) },
                  }]
                : []),
            ],
          },
        }
      : {}),
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
