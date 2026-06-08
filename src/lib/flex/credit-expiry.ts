import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 抵用金到期提醒（給客戶）
 *
 * params:
 *   amount: number     — 可用抵用金
 *   expireDate: string — 到期日（e.g. 2026/06/16）
 *   liffUrl: string    — 預約使用頁
 */
export function creditExpiry(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const amount = asString(params.amount, "0");
  const expireDate = asString(params.expireDate, "");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm/welcome");

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "💳", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "抵用金即將到期"),
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
            "提醒你，帳戶內的抵用金即將到期，記得在期限前預約使用，別讓優惠過期囉！",
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
            { type: "text", text: "可用抵用金", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `NT$ ${amount}`, size: "lg", weight: "bold", align: "end", color: COLORS.phosphor },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "到期日", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: expireDate, size: "sm", weight: "bold", align: "end", wrap: true, color: COLORS.coral },
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
            label: ovr(override, "buttonLabel", "立即預約使用"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
