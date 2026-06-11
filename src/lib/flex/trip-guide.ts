import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// 行前手冊 (潛水團 D-1)
// params: { tourTitle, gather, transport, hotel, leader, phone }
// v480：接上後台 override（title / bodyText）— fallback 與 /admin/templates 顯示的預設一致
export function tripGuide(
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
        { type: "text", text: ovr(override, "title", "📘 行前手冊"), color: COLORS.phosphor, weight: "bold", size: "md" },
        { type: "text", text: asString(params.tourTitle), color: "#ffffff", size: "lg", weight: "bold", margin: "xs", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "bodyText", "請攜帶證照、防寒衣、防曬等"), color: COLORS.mute, size: "sm", wrap: true },
        kv("集合", asString(params.gather)),
        kv("交通", asString(params.transport)),
        kv("住宿", asString(params.hotel)),
        kv("領隊", asString(params.leader)),
        kv("聯絡電話", asString(params.phone)),
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
