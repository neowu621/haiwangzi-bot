/**
 * 補償金 / 抵用金 (CreditTx) helper
 *
 * 設計：
 *  - User.creditBalance 是 denormalized 餘額（讀取時快）
 *  - CreditTx 是 audit trail，每筆紀錄變動 + balanceAfter
 *  - 寫入時用 prisma.$transaction 同步更新兩邊
 *  - amount 正 = 增加抵用金 / 負 = 使用抵用金
 */
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { genCreditCode } from "./code-gen";
import { notifyCreditChange } from "./notify-credit"; // v610

export type CreditReason =
  | "birthday"            // 生日自動發
  | "vip_upgrade"         // VIP 升等獎勵
  | "refund"              // 退款轉抵用金
  | "used"                // 訂單使用（負數）
  | "admin_adjust"        // admin 手動調整
  | "first_order_reward"  // v261：首單付款完成 + Email 已驗證
  | "signup_reward"       // v388：註冊禮金（Email 驗證通過後發）
  | "vip_overflow"        // v388：VIP5 滿級後每 N 潛回饋
  | "early_bird"          // v592：日潛早鳥回饋（結案後發）
  | "expired";            // v592：到期作廢（負數）

export interface GrantCreditArgs {
  userId: string;
  amount: number; // 正 = 增 / 負 = 用
  reason: CreditReason;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  createdBy?: string | null; // admin lineUserId
  expiresAt?: Date | null;   // v184: 到期日（null = 永不過期）
  // v610：呼叫端已自帶專屬通知（首單/生日/VIP/退款）時設 true，避免重複通知。
  //   一次性 backfill 也設 true，避免對歷史會員大量補推。
  skipNotify?: boolean;
}

/**
 * 寫入一筆 CreditTx + 同步更新 User.creditBalance
 * 用 transaction 確保 balance 與 audit log 一致
 * v610：交易成功後統一發「抵用金異動通知」（除非 skipNotify）。
 */
export async function grantCredit(args: GrantCreditArgs) {
  const result = await prisma.$transaction(async (tx) => {
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

    // v225：每筆 CreditTx 自動產編碼 C20260601-XX
    const code = await genCreditCode();
    const txRow = await tx.creditTx.create({
      data: {
        code,
        userId: args.userId,
        amount: args.amount,
        reason: args.reason,
        refType: args.refType ?? null,
        refId: args.refId ?? null,
        note: args.note ?? null,
        balanceAfter: newBalance,
        createdBy: args.createdBy ?? null,
        expiresAt: args.expiresAt ?? null,
      },
    });

    await tx.user.update({
      where: { lineUserId: args.userId },
      data: { creditBalance: newBalance },
    });

    return { tx: txRow, oldBalance, newBalance };
  });

  // v610：統一通知（fire-and-forget；專屬通知/backfill 用 skipNotify 跳過）
  if (!args.skipNotify) {
    notifyCreditChange({
      userId: args.userId,
      amount: args.amount,
      balanceAfter: result.newBalance,
      reason: args.reason,
      note: args.note ?? null,
      expiresAt: args.expiresAt ?? null,
    });
  }

  return result;
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
