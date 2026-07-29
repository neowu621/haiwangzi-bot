// v955：下單時可選的付款方式（存 Booking.paymentMethod）。日潛/潛旅下單頁共用。
export type PayMethodSel = "" | "bank" | "linepay" | "cash" | "other";

export const PAY_OPTIONS: { k: Exclude<PayMethodSel, "">; ic: string; nm: string; ds: string }[] = [
  { k: "bank", ic: "🏦", nm: "銀行轉帳", ds: "下單後上傳匯款末 5 碼" },
  { k: "linepay", ic: "💚", nm: "LINE Pay", ds: "掃 QR／轉帳後上傳截圖" },
  { k: "cash", ic: "💵", nm: "現場支付", ds: "當天到現場付給教練，免上傳" },
  { k: "other", ic: "📝", nm: "其他", ds: "已直接付款給老闆…下單後備註說明" },
];

export const PAY_LABEL: Record<Exclude<PayMethodSel, "">, string> = {
  bank: "🏦 銀行轉帳", linepay: "💚 LINE Pay", cash: "💵 現場支付", other: "📝 其他",
};
