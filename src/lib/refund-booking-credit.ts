// v603：訂單取消 → 退還「下單當下用掉的抵用金 (booking.creditUsed)」。
//
// 背景：下單時 daily/route 會立即用 spendCreditFIFO 扣掉 creditUsed（抵用金即預付）。
//   先前各取消路徑（客戶自取消 / admin 軟取消 / cancel-all / 天候取消）都沒有把這筆退回，
//   等於客戶用了抵用金又取消就憑空蒸發。此 helper 統一補上退還。
//
// 冪等：以 (reason="refund", refType="booking_cancel", refId=bookingId) 為鍵，同一張訂單只退一次；
//   與 admin 手動退款 route（refType="booking"）分流，兩者不會互相重複退。
//
// 退還的抵用金永不過期（與 admin「退款轉抵用金」一致，expiresAt=null）。
import { prisma } from "./prisma";
import { grantCredit } from "./credit";

/**
 * 退還某張訂單下單時折抵的抵用金。回傳實退金額（0 = 無須退或已退過）。
 * fire-and-forget 呼叫端可不 await；但建議 await 以便回應反映退還結果。
 */
export async function refundBookingCredit(
  bookingId: string,
  opts?: { note?: string; createdBy?: string | null },
): Promise<number> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, creditUsed: true, code: true },
  });
  if (!booking) return 0;
  const used = booking.creditUsed ?? 0;
  if (used <= 0) return 0;

  // 冪等：已退過就不再退
  const dup = await prisma.creditTx.findFirst({
    where: { reason: "refund", refType: "booking_cancel", refId: bookingId },
    select: { id: true },
  });
  if (dup) return 0;

  await grantCredit({
    userId: booking.userId,
    amount: used,
    reason: "refund",
    refType: "booking_cancel",
    refId: bookingId,
    note:
      opts?.note ??
      `訂單 ${booking.code ?? bookingId.slice(0, 8)} 取消，退還折抵的抵用金 NT$${used}`,
    createdBy: opts?.createdBy ?? null,
    expiresAt: null, // 退還的抵用金永不過期
  });
  return used;
}
