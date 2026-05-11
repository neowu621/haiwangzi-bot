import { COLORS, asString, asNumber, flex } from "./_common";
import type { FlexMessage } from "./index";

// Admin 週報摘要
// params: { weekRange, revenue, bookings, newMembers, pending }
export function adminWeekly(
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
        { type: "text", text: "📊 本週營運摘要", color: COLORS.phosphor, weight: "bold", size: "md" },
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
