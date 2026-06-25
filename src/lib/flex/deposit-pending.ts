import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 老闆訂金[確認中] Flex —— 推給老闆 / 管理者（內部）
 * 觸發：客戶上傳「訂金」付款證明後，提醒老闆去核對確認。
 * v665：把原本寫死的「待確認付款」推播，改成可在「訊息模板」頁編輯字句。
 *
 * params: {
 *   customerName, tourTitle, amount, last5, method, url
 * }
 */
export function depositPending(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const amount = asNumber(params.amount, 0);
  const last5 = asString(params.last5);
  const method = asString(params.method);
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.coral,
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: ovr(override, "title", "💳 訂金待確認"),
          color: "#ffffff",
          weight: "bold",
          size: "md",
        },
        {
          type: "text",
          text: asString(params.customerName, "客戶") + " 已上傳訂金證明",
          color: "#ffffff",
          size: "sm",
          margin: "xs",
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: asString(params.tourTitle, "潛旅訂單"),
          weight: "bold",
          size: "md",
          wrap: true,
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "金額", color: COLORS.mute, size: "xs", flex: 2 },
            {
              type: "text",
              text: `NT$ ${amount.toLocaleString()}`,
              color: COLORS.oceanDeep,
              size: "sm",
              flex: 3,
              align: "end",
              weight: "bold",
            },
          ],
        },
        ...(last5
          ? [
              {
                type: "box" as const,
                layout: "horizontal" as const,
                contents: [
                  { type: "text" as const, text: "帳號後5碼", color: COLORS.mute, size: "xs" as const, flex: 2 },
                  { type: "text" as const, text: last5, color: COLORS.oceanDeep, size: "sm" as const, flex: 3, align: "end" as const },
                ],
              },
            ]
          : []),
        ...(method
          ? [
              {
                type: "box" as const,
                layout: "horizontal" as const,
                contents: [
                  { type: "text" as const, text: "付款方式", color: COLORS.mute, size: "xs" as const, flex: 2 },
                  { type: "text" as const, text: method, color: COLORS.oceanDeep, size: "sm" as const, flex: 3, align: "end" as const },
                ],
              },
            ]
          : []),
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "請點下方核對，確認無誤後標記「訂金已收」。",
          wrap: true,
          size: "sm",
          color: COLORS.mute,
          margin: "md",
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
            label: ovr(override, "buttonLabel", "前往核對"),
            uri: asString(params.url, "https://haiwangzi.xyz/admin/bookings?status=awaiting_verify"),
          },
        },
      ],
    },
  });
}
