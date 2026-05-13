// 取消政策計算器,對應 SPEC §5.1 業界折衷模式
// 輸入: 距離出發/潛水日期的天數,訂單類型,已繳金額
// 輸出: 可退金額 + 規則描述

export type CancellationContext = {
  type: "daily" | "tour";
  daysUntil: number; // 距離出發/潛水日期的天數 (負數 = 已過)
  totalAmount: number;
  paidAmount: number;
  depositAmount: number; // 潛水團才有
  hasMedicalProof?: boolean; // 醫師證明 (日潛全退)
};

export type CancellationResult = {
  refundAmount: number;
  rule: string; // 中文描述,放進通知訊息
};

export function calculateRefund(ctx: CancellationContext): CancellationResult {
  // 醫師證明任何時間全退 (日潛)
  if (ctx.type === "daily" && ctx.hasMedicalProof) {
    return { refundAmount: ctx.paidAmount, rule: "醫師證明 → 全額退款" };
  }

  if (ctx.type === "daily") {
    if (ctx.daysUntil >= 7)
      return { refundAmount: ctx.paidAmount, rule: "7 天前 → 全額退款" };
    if (ctx.daysUntil >= 3)
      return {
        refundAmount: Math.floor(ctx.paidAmount * 0.7),
        rule: "3-6 天前 → 退 70%",
      };
    if (ctx.daysUntil >= 1)
      return {
        refundAmount: Math.floor(ctx.paidAmount * 0.5),
        rule: "1-2 天前 → 退 50%",
      };
    return { refundAmount: 0, rule: "當天/未到 → 不退款,可改期 1 次 (30 天內)" };
  }

  // 潛水團
  const deposit = ctx.depositAmount;
  const balance = Math.max(0, ctx.paidAmount - deposit); // 已繳尾款

  if (ctx.daysUntil >= 30) {
    return {
      refundAmount: Math.floor(deposit * 0.8) + balance,
      rule: "出發 30 天前 → 退訂金 80% + 尾款全退",
    };
  }
  if (ctx.daysUntil >= 15) {
    return {
      refundAmount: Math.floor(deposit * 0.5) + balance,
      rule: "15-29 天前 → 退訂金 50% + 尾款全退",
    };
  }
  if (ctx.daysUntil >= 8) {
    return {
      refundAmount: Math.floor(balance * 0.5),
      rule: "8-14 天前 → 不退訂金,尾款退 50%",
    };
  }
  return { refundAmount: 0, rule: "出發 7 天內 → 全部不退" };
}
