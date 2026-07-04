/**
 * v261 / v270：首單獎勵
 *
 * 觸發條件（全部成立）：
 *   1. user.emailVerifiedAt 不為 null（必須先驗證 email）
 *   2. user.firstOrderRewardGrantedAt 為 null（從未發過）
 *   3. v270：booking.status === "completed"（已到場 — 由教練 / 老闆勾選）
 *   4. SiteConfig.firstOrderRewardAmount > 0
 *
 * v270 變更：原本在「fully_paid」時觸發，改為「到場完成」才觸發。
 *   理由：付完款但沒到場 → 取消政策可能讓客戶拿回錢，但獎勵已發出來不好取回。
 *
 * 發放後：
 *   - 寫 CreditTx (reason: first_order_reward)
 *   - 更新 user.firstOrderRewardGrantedAt
 *   - 推 LINE Flex (first_order_reward_grant) + Email 給客戶
 */
import { prisma } from "./prisma";
import { grantCredit } from "./credit";
import { notifyCustomer } from "./notify-template";

const LIFF_BASE = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";

export interface MaybeGrantResult {
  granted: boolean;
  reason?: string;
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
        email: true,
        notifyByLine: true,
        notifyByEmail: true,
        realName: true,
        displayName: true,
      },
    });
    if (!user) return { granted: false, reason: "user not found" };

    if (!user.emailVerifiedAt) {
      return { granted: false, reason: "email not verified" };
    }
    if (user.firstOrderRewardGrantedAt) {
      return { granted: false, reason: "already granted" };
    }

    // v270：必須是「已完成」的訂單（教練/老闆勾過到場）
    const booking = await prisma.booking.findUnique({
      where: { id: triggerBookingId },
      select: { status: true, type: true, refId: true },
    });
    if (!booking) return { granted: false, reason: "booking not found" };
    if (booking.status !== "completed") {
      return { granted: false, reason: "booking not completed yet" };
    }

    // 必須是該 user 第一筆 completed booking（防：客戶有兩筆，第一筆未完成、第二筆完成→應該也算首單）
    // 用 completed count 判斷，目前這筆已是 completed，所以 count=1 = 首單
    const completedCount = await prisma.booking.count({
      where: { userId, status: "completed" },
    });
    if (completedCount > 1) {
      return { granted: false, reason: "not first completed order" };
    }

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

    const { tx, newBalance } = await grantCredit({ skipNotify: true,
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

    // ── 推播通知 ── v480：改走 notifyCustomer — LINE/Email/站內 全由模板組稿（後台填什麼發什麼）
    const expiryStr = expiresAt ? expiresAt.toISOString().slice(0, 10) : "";
    // 組 booking title
    let bookingTitle = `預約 #${triggerBookingId.slice(0, 8)}`;
    try {
      if (booking.type === "daily") {
        const trip = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
        if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
      } else {
        const tour = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
        if (tour) bookingTitle = tour.title;
      }
    } catch { /* ignore */ }

    notifyCustomer({
      userId,
      templateKey: "first_order_reward_grant",
      params: {
        amount,
        balance: newBalance,
        expiresAt: expiryStr,
        bookingTitle,
        liffUrl: `${LIFF_BASE}/profile`,
      },
    });

    return { granted: true, amount, creditTxId: tx.id };
  } catch (e) {
    console.error("[first-order-reward] failed", { userId, triggerBookingId, error: e });
    return { granted: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
