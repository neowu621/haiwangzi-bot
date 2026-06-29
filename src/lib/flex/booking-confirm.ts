import { COLORS, asString, asNumber, flex, ovr, type TemplateOverride } from "./_common";
import type { FlexMessage } from "./index";
import { FUBON_MARINE_URL } from "@/lib/insurance"; // v582

// 預約確認 Flex 卡
// params: { name, date, time, site, total, bookingId? }
export function bookingConfirm(
  params: Record<string, unknown>,
  altText: string,
  override?: TemplateOverride,
): FlexMessage {
  // v732：應付 = 扣抵用金後金額。有折抵用金時顯示「總額 / 折抵 / 應付」三行，避免只顯示原始總額。
  const total = asNumber(params.total);
  const credit = asNumber(params.creditUsed);
  const payable = params.payable != null ? asNumber(params.payable) : total;
  const amountLines =
    credit > 0
      ? [
          kv("訂單總額", `NT$ ${total.toLocaleString()}`),
          kv("折抵用金", `−NT$ ${credit.toLocaleString()}`),
          kv("應付金額", `NT$ ${payable.toLocaleString()}`),
        ]
      : [kv("應付金額", `NT$ ${payable.toLocaleString()}`)];
  return flex(altText, {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: COLORS.oceanDeep,
      paddingAll: "16px",
      contents: [
        { type: "text", text: ovr(override, "title", "✅ 預約成功"), color: COLORS.phosphor, weight: "bold", size: "md" },
        { type: "text", text: ovr(override, "subtitle", "您的日潛預約已確認"), color: "#ffffff", weight: "bold", size: "xl", margin: "sm", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        { type: "text", text: asString(params.name, "—"), weight: "bold", size: "lg" },
        { type: "separator", margin: "sm" },
        kv("日期", asString(params.date)),
        kv("時間", asString(params.time)),
        kv("潛點", asString(params.site)),
        ...amountLines,
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
          action: { type: "uri", label: ovr(override, "buttonLabel", "查看我的預約"), uri: asString(params.url, "https://line.me/") },
        },
        // v582：建議自行加保個人海域險(富邦,第1類含水肺潛水)
        {
          type: "button",
          style: "link",
          height: "sm",
          action: { type: "uri", label: "海域險投保《第1類活動》", uri: FUBON_MARINE_URL },
        },
        { type: "text", text: "建議自行加保個人海域險・詳情洽富邦", size: "xxs", color: COLORS.mute, align: "center", wrap: true },
      ],
    },
  });
}

function kv(k: string, v: string) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: k, color: COLORS.mute, size: "sm", flex: 2 },
      { type: "text", text: v, weight: "bold", size: "sm", flex: 5, wrap: true },
    ],
  };
}
