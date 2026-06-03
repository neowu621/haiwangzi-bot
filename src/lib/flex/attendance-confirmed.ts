import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * v270：到場確認通知
 *
 * params:
 *   bookingTitle: string — 例：日潛 6/15 龍洞 08:00
 *   addLogs: number      — 本次累計的潛水次數
 *   totalLogs: number    — 海王子累計總次數
 *   vipLevel: number     — 目前 VIP 等級
 *   liffUrl: string
 */
export function attendanceConfirmed(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const bookingTitle = asString(params.bookingTitle, "");
  const addLogs = asString(params.addLogs, "");
  const totalLogs = asString(params.totalLogs, "");
  const vipLevel = asString(params.vipLevel, "1");
  const liffUrl = asString(params.liffUrl, "https://liff.line.me/2010219428-E5frY7tm");

  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "20px",
      contents: [
        { type: "text", text: "🐠", align: "center", size: "3xl" },
        {
          type: "text",
          text: ovr(override, "title", "已記錄您的到場"),
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
          text: bookingTitle,
          weight: "bold",
          size: "md",
          wrap: true,
        },
        { type: "separator", margin: "md" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "本次累積", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `+${addLogs} 潛`, size: "sm", weight: "bold", align: "end", color: COLORS.phosphor },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "海王子總計", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `${totalLogs} 潛`, size: "sm", weight: "bold", align: "end" },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: "目前 VIP", color: COLORS.mute, size: "xs", flex: 0 },
            { type: "text", text: `LV${vipLevel}`, size: "sm", weight: "bold", align: "end" },
          ],
        },
        {
          type: "text",
          text: ovr(override, "bodyText", "感謝您今日的參與，期待下次海上見！"),
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
            label: ovr(override, "buttonLabel", "查看我的紀錄"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
