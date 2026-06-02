/**
 * v261：首單付款完成 → 自動發抵用金
 *
 * 觸發條件（全部成立）：
 *   1. user.emailVerifiedAt 不為 null（必須先驗證 email）
 *   2. user.firstOrderRewardGrantedAt 為 null（從未發過）
 *   3. user 的所有 booking 中，fully_paid 的只有「這筆當前」這一張（= 首單）
 *   4. SiteConfig.firstOrderRewardAmount > 0（admin 可在設定頁停用）
 *
 * 發放：
 *   - reason: "first_order_reward"
 *   - amount: SiteConfig.firstOrderRewardAmount（預設 100）
 *   - expiresAt: 從 SiteConfig.firstOrderRewardExpiryDays（預設 360 天）
 *   - refType: "booking", refId: 觸發的 booking.id
 *   - 同時設 user.firstOrderRewardGrantedAt = now() 避免重複發
 *
 * Idempotent：多次呼叫安全（用 firstOrderRewardGrantedAt 去重）
 *
 * 失敗策略：所有失敗都 try/catch 並 log，不影響觸發點主流程
 */
import { prisma } from "./prisma";
import { grantCredit } from "./credit";

export interface MaybeGrantResult {
  granted: boolean;
  reason?: string; // skip 的原因
  amount?: number;
  creditTxId?: string;
}

export async function maybeGrantFirstOrderReward(
  userId: string,
  triggerBookingId: string,
): Promise<MaybeGrantResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: userId },
      select: {
        emailVerifiedAt: true,
        firstOrderRewardGrantedAt: true,
      },
    });
    if (!user) return { granted: false, reason: "user not found" };

    if (!user.emailVerifiedAt) {
      return { granted: false, reason: "email not verified" };
    }
    if (user.firstOrderRewardGrantedAt) {
      return { granted: false, reason: "already granted" };
    }

    // 計算 user 的 fully_paid bookings 數量。若只有 1 筆 (=當前) 才算首單。
    const fullyPaidCount = await prisma.booking.count({
      where: { userId, paymentStatus: "fully_paid" },
    });
    if (fullyPaidCount > 1) {
      return { granted: false, reason: "not first order" };
    }

    // 讀 admin 設定的金額與有效天數
    const cfg = await prisma.siteConfig.findUnique({
      where: { id: "default" },
      select: {
        firstOrderRewardAmount: true,
        firstOrderRewardExpiryDays: true,
      } as never,
    });
    const amount =
      (cfg as unknown as { firstOrderRewardAmount?: number } | null)
        ?.firstOrderRewardAmount ?? 100;
    if (amount <= 0) {
      return { granted: false, reason: "feature disabled (amount=0)" };
    }
    const expiryDays =
      (cfg as unknown as { firstOrderRewardExpiryDays?: number } | null)
        ?.firstOrderRewardExpiryDays ?? 360;
    const expiresAt =
      expiryDays > 0
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
        : null;

    // 發抵用金 + 標記用戶已發過（兩步用 transaction 確保一致）
    const { tx } = await grantCredit({
      userId,
      amount,
      reason: "first_order_reward",
      refType: "booking",
      refId: triggerBookingId,
      note: `首單付款獎勵（首單 #${triggerBookingId.slice(0, 8)}）`,
      expiresAt,
    });
    await prisma.user.update({
      where: { lineUserId: userId },
      data: { firstOrderRewardGrantedAt: new Date() },
    });

    console.log(
      `[first-order-reward] granted ${amount} to ${userId} for booking ${triggerBookingId}`,
    );
    return { granted: true, amount, creditTxId: tx.id };
  } catch (e) {
    console.error("[first-order-reward] failed", { userId, triggerBookingId, error: e });
    return { granted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
