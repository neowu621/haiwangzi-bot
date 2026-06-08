import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * VIP 升等通知（給客戶）
 *
 * params:
 *   tierName: string   — 等級名
 *   tierEmoji: string  — 等級 emoji
 *   benefits: string   — 權益說明（可多行）
 *   liffUrl: string    — 我的會員頁
 */
export function vipUpgrade(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const tierName = asString(params.tierName, "");
  const tierEmoji = asString(params.tierEmoji, "🌟");
  const benefits = asString(params.benefits, "");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  const title = tierName
    ? `恭喜升等 ${tierName}！`
    : ovr(override, "title", "恭喜升等");

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "🌟", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", title),
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
            "謝謝你一直跟著海王子潛水，已為你升級會員等級，享有更多專屬優惠。",
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
            { type: "text", text: "會員等級", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `${tierEmoji} ${tierName}`, size: "sm", weight: "bold", align: "end", wrap: true, color: COLORS.gold },
          ],
        },
        ...(benefits
          ? [
              { type: "separator" as const, margin: "md" },
              { type: "text" as const, text: "專屬權益", color: COLORS.mute, size: "xs", margin: "md" },
              { type: "text" as const, text: benefits, size: "sm", wrap: true, margin: "xs" },
            ]
          : []),
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
            label: ovr(override, "buttonLabel", "查看我的會員"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
