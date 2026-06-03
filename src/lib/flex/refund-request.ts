import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * v274：退款申請通知（給客戶）
 *
 * params:
 *   bookingTitle: string — 訂單描述
 *   amount: number       — 退款金額
 *   method: "cash" | "credit"
 *   creditBonus: number  — 抵用金加成（若 method=credit）
 *   reason: string       — 退款原因
 *   liffUrl: string      — 客戶確認頁 LIFF URL（含 refundRequest id）
 */
export function refundRequest(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const bookingTitle = asString(params.bookingTitle, "");
  const amount = asString(params.amount, "0");
  const method = asString(params.method, "cash");
  const creditBonus = asString(params.creditBonus, "0");
  const reason = asString(params.reason, "");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  const methodLabel = method === "credit" ? "🎁 抵用金" : "💵 現金退費";
  const bonusLine = method === "credit" && Number(creditBonus) > 0
    ? `（額外 +${creditBonus}% 加成）`
    : "";

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "💸", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "退款申請待您確認"),
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
            { type: "text", text: `${methodLabel}${bonusLine}`, size: "sm", weight: "bold", align: "end", wrap: true, color: COLORS.phosphor },
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
        ...(reason
          ? [
              { type: "separator" as const, margin: "md" },
              { type: "text" as const, text: "退款原因", color: COLORS.mute, size: "xs", margin: "md" },
              { type: "text" as const, text: reason, size: "sm", wrap: true, margin: "xs" },
            ]
          : []),
        {
          type: "text",
          text: ovr(override, "bodyText", "請點下方按鈕確認接受，或選擇有疑問與店家聯絡。"),
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "md",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      paddingAll: "12px",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: ovr(override, "buttonLabel", "查看詳情並確認"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
