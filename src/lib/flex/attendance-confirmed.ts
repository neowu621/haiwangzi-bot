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
  // v782：五星好評連結（Google Maps）。可由 params.reviewUrl 覆寫。
  const reviewUrl = asString(params.reviewUrl, "https://maps.app.goo.gl/L58ukZuJroo5vbjv5");

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
          text: ovr(override, "bodyText", "🎉 謝謝你和東北海王子潛水一起下水！今天玩得開心嗎？"),
          color: COLORS.oceanDeep,
          size: "sm",
          weight: "bold",
          align: "center",
          margin: "lg",
          wrap: true,
        },
        {
          type: "text",
          text: "喜歡今天的旅程的話，給我們 ⭐⭐⭐⭐⭐ 鼓勵一下，是我們最大的動力！",
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: "有任何建議或想說的，也超歡迎直接回訊息告訴我們 💙",
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "sm",
          wrap: true,
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "12px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: "⭐ 給我們五星好評",
            uri: reviewUrl,
          },
        },
        {
          type: "button",
          style: "link",
          height: "sm",
          action: {
            type: "uri",
            label: ovr(override, "buttonLabel", "查看我的潛水紀錄"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
