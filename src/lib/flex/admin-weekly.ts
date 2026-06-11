import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// Admin 週報摘要
// params: { weekRange, revenue, bookings, newMembers, pending }
// v480：接上後台 override（title / subtitle）
export function adminWeekly(
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
        { type: "text", text: ovr(override, "title", "📊 上週營運摘要"), color: COLORS.phosphor, weight: "bold", size: "md" },
        ...(override?.subtitle ? [{ type: "text" as const, text: override.subtitle, color: "#cfe8e5", size: "xs", margin: "xs" }] : []),
        { type: "text", text: asString(params.weekRange), color: "#ffffff", size: "sm", margin: "xs" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        kv("營收", `NT$ ${asNumber(params.revenue).toLocaleString()}`),
        kv("新預約", String(asNumber(params.bookings))),
        kv("新會員", String(asNumber(params.newMembers))),
        kv("待處理", `${asNumber(params.pending)} 筆轉帳`),
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
      { type: "text", text: v, weight: "bold", size: "md", flex: 5 },
    ],
  };
}
