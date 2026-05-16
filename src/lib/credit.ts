/**
 * 補償金 / 禮金 (CreditTx) helper
 *
 * 設計：
 *  - User.creditBalance 是 denormalized 餘額（讀取時快）
 *  - CreditTx 是 audit trail，每筆紀錄變動 + balanceAfter
 *  - 寫入時用 prisma.$transaction 同步更新兩邊
 *  - amount 正 = 增加禮金 / 負 = 使用禮金
 */
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

export type CreditReason =
  | "birthday"        // 生日自動發
  | "vip_upgrade"     // VIP 升等獎勵
  | "refund"          // 退款轉禮金
  | "used"            // 訂單使用（負數）
  | "admin_adjust";   // admin 手動調整

export interface GrantCreditArgs {
  userId: string;
  amount: number; // 正 = 增 / 負 = 用
  reason: CreditReason;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdBy?: string | null; // admin lineUserId
}

/**
 * 寫入一筆 CreditTx + 同步更新 User.creditBalance
 * 用 transaction 確保 balance 與 audit log 一致
 */
export async function grantCredit(args: GrantCreditArgs) {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { lineUserId: args.userId },
      select: { creditBalance: true },
    });
    if (!user) throw new Error(`user not found: ${args.userId}`);

    const oldBalance = user.creditBalance ?? 0;
    const newBalance = oldBalance + args.amount;
    if (newBalance < 0) {
      throw new Error(
        `credit balance would become negative: ${oldBalance} + ${args.amount} = ${newBalance}`,
      );
    }

    const txRow = await tx.creditTx.create({
      data: {
        userId: args.userId,
        amount: args.amount,
        reason: args.reason,
        refType: args.refType ?? null,
        refId: args.refId ?? null,
        note: args.note ?? null,
        balanceAfter: newBalance,
        createdBy: args.createdBy ?? null,
      },
    });

    await tx.user.update({
      where: { lineUserId: args.userId },
      data: { creditBalance: newBalance },
    });

    return { tx: txRow, oldBalance, newBalance };
  });
}

/**
 * 取 VIP 升等獎金金額（從 SiteConfig 讀，後備為硬編碼預設）
 * 預設：LV2=200, LV3=500, LV4=1000, LV5=2000
 */
export function vipUpgradeCreditAmount(
  upgradeCredits: Prisma.JsonValue | null | undefined,
  toLevel: number,
): number {
  const defaults: Record<string, number> = {
    "2": 200,
    "3": 500,
    "4": 1000,
    "5": 2000,
  };
  if (
    upgradeCredits &&
    typeof upgradeCredits === "object" &&
    !Array.isArray(upgradeCredits)
  ) {
    const v = (upgradeCredits as Record<string, unknown>)[String(toLevel)];
    if (typeof v === "number" && v >= 0) return v;
  }
  return defaults[String(toLevel)] ?? 0;
}
