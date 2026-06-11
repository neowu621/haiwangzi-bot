import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";

// 訂金繳費通知
// params: { tourTitle, deposit, deadline, bankName, bankAccount, holder, refCode, url }
// v480：接上後台 override（title / bodyText / buttonLabel）— fallback 與 /admin/templates 顯示的預設一致
export function depositNotice(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.gold,
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "title", "💰 訂金繳費通知"), color: COLORS.oceanDeep, weight: "bold", size: "md" },
        { type: "text", text: asString(params.tourTitle, "潛水團"), color: COLORS.oceanDeep, size: "lg", weight: "bold", margin: "xs", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "bodyText", "請於截止日前完成訂金匯款"), color: COLORS.mute, size: "sm", wrap: true },
        kv("訂金", `NT$ ${asNumber(params.deposit).toLocaleString()}`),
        kv("繳費截止", asString(params.deadline)),
        { type: "separator", margin: "md" },
        { type: "text", text: "匯款資訊", color: COLORS.mute, size: "xs", margin: "md" },
        kv("銀行", asString(params.bankName)),
        kv("戶名", asString(params.holder)),
        kv("帳號", asString(params.bankAccount)),
        kv("備註碼", asString(params.refCode), COLORS.coral),
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
            label: ovr(override, "buttonLabel", "上傳轉帳截圖"),
            uri: asString(params.url, "https://line.me/"),
          },
        },
      ],
    },
  });
}

function kv(k: string, v: string, vColor?: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, color: COLORS.mute, size: "sm", flex: 2 },
      {
        type: "text",
        text: v,
        weight: "bold",
        size: "sm",
        flex: 5,
        wrap: true,
        ...(vColor ? { color: vColor } : {}),
      },
    ],
  };
}
