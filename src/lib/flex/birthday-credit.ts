import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 生日禮金發放（給客戶）
 *
 * params:
 *   amount: number     — 禮金金額
 *   expiryDays: number — 有效天數（0=永久）
 *   liffUrl: string    — 使用禮金頁
 */
export function birthdayCredit(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const amount = asString(params.amount, "0");
  const expiryDays = asNumber(params.expiryDays, 0);
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  const effectiveText = expiryDays > 0 ? `${expiryDays} 天內有效` : "永久有效";

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "🎂", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "生日快樂！🎂"),
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
        {
          type: "text",
          text: ovr(
            override,
            "bodyText",
            "祝你生日快樂！我們準備了一份生日禮金給你，已存入你的帳戶。",
          ),
          size: "sm",
          color: COLORS.mute,
          wrap: true,
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "生日禮金", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `NT$ ${amount}`, size: "lg", weight: "bold", align: "end", color: COLORS.gold },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "使用期限", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: effectiveText, size: "sm", weight: "bold", align: "end", wrap: true },
          ],
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
            label: ovr(override, "buttonLabel", "立即使用禮金"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
