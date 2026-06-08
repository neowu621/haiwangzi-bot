import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 退款完成通知（給客戶）
 *
 * params:
 *   bookingTitle: string — 訂單描述
 *   amount: string       — 退款金額（數字字串）
 *   method: "cash" | "credit"
 *   liffUrl: string      — 我的預約頁
 */
export function refundComplete(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const bookingTitle = asString(params.bookingTitle, "");
  const amount = asString(params.amount, "0");
  const method = asString(params.method, "cash");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  const methodLabel = method === "credit" ? "🎁 抵用金" : "💵 現金退費";

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "✅", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "退款已完成"),
          color: "#ffffff",
          weight: "bold",
          size: "lg",
          align: "center",
          margin: "md",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: bookingTitle, weight: "bold", size: "sm", wrap: true },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "退款方式", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: methodLabel, size: "sm", weight: "bold", align: "end", wrap: true, color: COLORS.phosphor },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "退款金額", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `NT$ ${amount}`, size: "lg", weight: "bold", align: "end" },
          ],
        },
        {
          type: "text",
          text: ovr(override, "bodyText", "您的退款已處理完成，感謝您的耐心。"),
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "md",
          wrap: true,
        },
      ],
    },
  });
}
