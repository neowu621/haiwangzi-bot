import { COLORS, asString, asNumber, flex, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

/**
 * 超賣警示 Flex — 推給教練
 *
 * params: {
 *   tripDate, tripTime, site,
 *   customerName, requestedCount,
 *   currentBooked, capacity,
 *   bookingId, url
 * }
 */
export function overcapAlert(
  params: Record<string, unknown>,
  altText: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _override?: TemplateOverride,
): FlexMessage {
  const requested = asNumber(params.requestedCount, 1);
  const booked = asNumber(params.currentBooked, 0);
  const capacity = asNumber(params.capacity, 0);
  const after = booked + requested;
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
          text: "⚠️ 超賣警示",
          color: "#ffffff",
          weight: "bold",
          size: "md",
        },
        {
          type: "text",
          text: `${asString(params.tripDate)} ${asString(params.tripTime)}`,
          color: "#ffffff",
          size: "lg",
          weight: "bold",
          margin: "xs",
        },
        {
          type: "text",
          text: asString(params.site),
          color: "#ffffff",
          size: "sm",
          margin: "xs",
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
          text: `${asString(params.customerName)} 預約 ${requested} 位`,
          weight: "bold",
          size: "md",
        },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "原本",
              color: COLORS.mute,
              size: "xs",
              flex: 2,
            },
            {
              type: "text",
              text: `${booked} / ${capacity}`,
              color: COLORS.oceanDeep,
              size: "sm",
              flex: 3,
              align: "end",
            },
          ],
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: "預約後",
              color: COLORS.mute,
              size: "xs",
              flex: 2,
            },
            {
              type: "text",
              text: `${after} / ${capacity} (超 ${after - capacity} 位)`,
              color: COLORS.coral,
              size: "sm",
              flex: 3,
              align: "end",
              weight: "bold",
            },
          ],
        },
        { type: "separator", margin: "md" },
        {
          type: "text",
          text: "處理選項：",
          color: COLORS.mute,
          size: "xs",
          margin: "md",
        },
        {
          type: "text",
          text:
            "1. 提高場次容量\n2. 聯絡客戶改場次/取消",
          wrap: true,
          size: "sm",
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
            label: "處理此預約",
            uri: asString(params.url, "https://haiwangzi.zeabur.app/liff/coach/today"),
          },
        },
      ],
    },
  });
}
