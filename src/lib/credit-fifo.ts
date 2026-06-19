// v592：抵用金「先用最近到期」批次扣抵 + 到期作廢。
//   正向 CreditTx = 一筆發放(lot);consumedAmount = 已用掉/作廢的金額;剩餘 = amount − consumedAmount。
//   扣抵時依到期日「近 → 遠」逐筆扣;過期未用完的部分作廢。creditBalance 維持 = 未過期剩餘加總。
import { prisma } from "./prisma";
import { genCreditCode } from "./code-gen";

// 未過期正向發放筆的「剩餘可用」總額
export async function availableCredit(userId: string, nowMs: number = Date.now()): Promise<number> {
  const lots = await prisma.creditTx.findMany({
    where: { userId, amount: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(nowMs) } }] },
    select: { amount: true, consumedAmount: true },
  });
  return lots.reduce((s, l) => s + Math.max(0, l.amount - l.consumedAmount), 0);
}

// 作廢已過期、未用完的發放筆 → 寫一筆負向 "expired" 紀錄 + 更新 balance。回傳作廢總額。
export async function reconcileExpiredCredits(userId: string, nowMs: number = Date.now()): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.creditTx.findMany({
      where: { userId, amount: { gt: 0 }, expiresAt: { lt: new Date(nowMs) } },
      select: { id: true, amount: true, consumedAmount: true },
    });
    let forfeited = 0;
    for (const lot of expired) {
      const remain = lot.amount - lot.consumedAmount;
      if (remain > 0) {
        forfeited += remain;
        await tx.creditTx.update({ where: { id: lot.id }, data: { consumedAmount: lot.amount } });
      }
    }
    if (forfeited > 0) {
      const u = await tx.user.findUnique({ where: { lineUserId: userId }, select: { creditBalance: true } });
      const newBal = Math.max(0, (u?.creditBalance ?? 0) - forfeited);
      const code = await genCreditCode();
      await tx.creditTx.create({ data: { code, userId, amount: -forfeited, reason: "expired", balanceAfter: newBal, note: "抵用金到期作廢" } });
      await tx.user.update({ where: { lineUserId: userId }, data: { creditBalance: newBal } });
    }
    return forfeited;
  });
}

// 批次扣抵:先用最近到期。不足會 throw。回傳實扣金額。
export async function spendCreditFIFO(args: {
  userId: string;
  amount: number;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
}): Promise<number> {
  const amount = Math.floor(args.amount);
  if (amount <= 0) return 0;
  await reconcileExpiredCredits(args.userId); // 先清掉過期
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const lots = await tx.creditTx.findMany({
      where: { userId: args.userId, amount: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, amount: true, consumedAmount: true },
    });
    const avail = lots.reduce((s, l) => s + (l.amount - l.consumedAmount), 0);
    if (amount > avail) throw new Error(`抵用金不足（可用 ${avail}，需 ${amount}）`);
    let need = amount;
    for (const lot of lots) {
      if (need <= 0) break;
      const remain = lot.amount - lot.consumedAmount;
      if (remain <= 0) continue;
      const take = Math.min(remain, need);
      await tx.creditTx.update({ where: { id: lot.id }, data: { consumedAmount: lot.consumedAmount + take } });
      need -= take;
    }
    const u = await tx.user.findUnique({ where: { lineUserId: args.userId }, select: { creditBalance: true } });
    const newBal = Math.max(0, (u?.creditBalance ?? 0) - amount);
    const code = await genCreditCode();
    await tx.creditTx.create({
      data: { code, userId: args.userId, amount: -amount, reason: "used", refType: args.refType ?? null, refId: args.refId ?? null, note: args.note ?? "訂單折抵", balanceAfter: newBal },
    });
    await tx.user.update({ where: { lineUserId: args.userId }, data: { creditBalance: newBal } });
    return amount;
  });
}
