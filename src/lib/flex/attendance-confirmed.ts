import { COLORS, asString, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";
import { liffAppUrl } from "../liff-url"; // v992：用 App 本身的 LIFF ID 產生站內深連結

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
  // v782/v792：五星好評連結（Google Maps）。優先用後台可編輯的「按鈕連結」(buttonUrl)，再退回 params/預設。
  const reviewUrl = ovr(override, "buttonUrl", asString(params.reviewUrl, "https://maps.app.goo.gl/L58ukZuJroo5vbjv5"));

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
            // v989：vipLevel 可能是純數字(2)或已含等級名(LV2 小丑魚)；純數字才補「LV」，避免出現「LVLV2」
            { type: "text", text: /^\d+$/.test(vipLevel) ? `LV${vipLevel}` : vipLevel, size: "sm", weight: "bold", align: "end" },
          ],
        },
        {
          type: "text",
          text: ovr(override, "bodyText", "🎉 謝謝你和東北海王子潛水一起下水！玩得開心嗎？"),
          color: COLORS.oceanDeep,
          size: "sm",
          weight: "bold",
          align: "center",
          margin: "lg",
          wrap: true,
        },
        {
          type: "text",
          text: "喜歡今天的旅程，給我們海王子評論鼓勵一下，",
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: "只要一分鐘就好 🙏 給我們 Google 五星評價",
          color: COLORS.mute,
          size: "xs",
          align: "center",
          margin: "sm",
          wrap: true,
        },
        {
          type: "text",
          text: "任何建議或想說的，也超歡迎直接回訊息告訴我們 💙",
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
          // v788：合併為單一「評價」按鈕（原「⭐ 海王子評論」＋「查看紀錄」兩顆合一）→ Google 評論
          type: "button",
          style: "primary",
          color: COLORS.phosphor,
          action: {
            type: "uri",
            label: ovr(override, "buttonLabel", "給予我們 ⭐⭐⭐⭐⭐ 評價"),
            uri: reviewUrl,
          },
        },
        {
          // v833：第二顆「私訊反映」分流 —— 讓不滿意/有建議的客人私下告訴小編與教練。
          //   v987：改開「站內 → 訊息‧客服」頁(?feedback=1 自動帶入回饋起手訊息)，直接發給客服。
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "uri",
            // v834：按鈕文字後台可編輯（/admin/templates → 到場確認）
            // v992：用 App 本身 LIFF ID 開站內「訊息‧客服」頁 + 帶場次(fb=1&s=…)給對話框自動起手
            label: ovr(override, "button2Label", "💬 有需要改善?告訴我們"),
            uri: liffAppUrl(`/messages?fb=1&s=${encodeURIComponent(bookingTitle || "")}`),
          },
        },
      ],
    },
  });
}
