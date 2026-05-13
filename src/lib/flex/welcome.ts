import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 歡迎 Flex — 第一次加好友時推送
 */
export function welcome(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  const liffUrl = asString(
    params.liffUrl,
    "https://liff.line.me/2010006458-fyokMnVv",
  );
  return flex(altText, {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "24px",
      contents: [
        {
          type: "text",
          text: "🌊",
          align: "center",
          size: "3xl",
        },
        {
          type: "text",
          text: ovr(override, "title", "歡迎潛入"),
          color: "#ffffff",
          weight: "bold",
          size: "xl",
          align: "center",
          margin: "md",
        },
        {
          type: "text",
          text: ovr(override, "subtitle", "東北角海王子潛水"),
          color: COLORS.phosphor,
          size: "md",
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
          text: "我們在 LINE 為您提供：",
          weight: "bold",
          size: "sm",
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          margin: "sm",
          contents: [
            { type: "text", text: "📅", size: "sm", flex: 0 },
            { type: "text", text: "日潛預約：選日期 → 選場次 → 一鍵搞定", wrap: true, size: "sm", flex: 6 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "text", text: "✈️", size: "sm", flex: 0 },
            { type: "text", text: "旅遊潛水：蘭嶼 / 綠島 / 墾丁 多日團", wrap: true, size: "sm", flex: 6 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "text", text: "💳", size: "sm", flex: 0 },
            { type: "text", text: "上傳轉帳截圖，教練即時核對", wrap: true, size: "sm", flex: 6 },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            { type: "text", text: "🔔", size: "sm", flex: 0 },
            { type: "text", text: "行前一天自動提醒，海況即時推播", wrap: true, size: "sm", flex: 6 },
          ],
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: ovr(override, "bodyText", "安全．專業．陪你看見海"),
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
            label: ovr(override, "buttonLabel", "開啟預約 App"),
            uri: liffUrl,
          },
        },
      ],
    },
  });
}
