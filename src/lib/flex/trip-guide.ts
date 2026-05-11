import { COLORS, asString, flex } from "./_common";
import type { FlexMessage } from "./index";

// 行前手冊 (旅行團 D-1)
// params: { tourTitle, gather, transport, hotel, leader, phone }
export function tripGuide(
  params: Record<string, unknown>,
  altText: string,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "16px",
      contents: [
        { type: "text", text: "🧳 行前手冊", color: COLORS.phosphor, weight: "bold", size: "md" },
        { type: "text", text: asString(params.tourTitle), color: "#ffffff", size: "lg", weight: "bold", margin: "xs", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
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
