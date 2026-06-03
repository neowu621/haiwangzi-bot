import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * v270：首單獎勵發放通知
 *
 * params:
 *   amount: number       — 發放金額（NT$）
 *   balance: number      — 發放後抵用金總餘額
 *   expiresAt: string    — 到期日 YYYY-MM-DD
 *   bookingTitle: string — 觸發此獎勵的訂單描述（例：日潛 6/15 龍洞）
 *   liffUrl: string      — 我的預約頁 LIFF URL
 */
export function firstOrderRewardGrant(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const amount = asString(params.amount, "100");
  const balance = asString(params.balance, "100");
  const expiresAt = asString(params.expiresAt, "");
  const bookingTitle = asString(params.bookingTitle, "");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm");

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "24px",
      contents: [
        { type: "text", text: "🎁", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "首單獎勵入帳"),
          color: "#ffffff",
          weight: "bold",
          size: "xl",
          align: "center",
          margin: "md",
        },
        {
          type: "text",
          text: `NT$ ${amount}`,
          color: COLORS.phosphor,
          weight: "bold",
          size: "xxl",
          align: "center",
          margin: "xs",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: ovr(
            override,
            "bodyText",
            "感謝您完成首次潛水！為了感謝您的支持，我們已將首單抵用金存入您的帳戶。",
          ),
          wrap: true,
          size: "sm",
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "首單", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: bookingTitle, size: "xs", align: "end", wrap: true },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "目前餘額", color: COLORS.mute, size: "xs", flex: 0 },
            {
              type: "text",
              text: `NT$ ${balance}`,
              size: "sm",
              weight: "bold",
              align: "end",
              color: COLORS.phosphor,
            },
          ],
        },
        ...(expiresAt
          ? [
              {
                type: "box" as const,
                layout: "horizontal" as const,
                margin: "sm",
                contents: [
                  { type: "text" as const, text: "有效期至", color: COLORS.mute, size: "xs", flex: 0 },
                  { type: "text" as const, text: expiresAt, size: "xs", align: "end" as const },
                ],
              },
            ]
          : []),
        {
          type: "text",
          text: ovr(override, "footerHint", "下次預約時可直接折抵 ✨"),
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
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: ovr(override, "buttonLabel", "查看我的抵用金"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
