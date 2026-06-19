// v592：日潛早鳥回饋 —— 訂單「結案(到場完成)」時發放抵用金,30 天到期。
//   只發一次;取消/退款/未完成不發。
import { prisma } from "./prisma";
import { grantCredit } from "./credit";

const EARLY_BIRD_EXPIRY_DAYS = 30;
const NO_GRANT_STATUS = ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid", "refunding", "refunded", "no_show"];

export async function maybeGrantEarlyBird(bookingId: string): Promise<void> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, userId: true, earlyBirdCredit: true, earlyBirdGranted: true, status: true, paymentStatus: true },
  });
  if (!b || b.earlyBirdGranted) return;
  if (!b.earlyBirdCredit || b.earlyBirdCredit <= 0) return;
  if (NO_GRANT_STATUS.includes(b.status)) return; // 取消/退款/未到不發
  if (["refunded", "refunding"].includes(b.paymentStatus)) return;

  const expiresAt = new Date(Date.now() + EARLY_BIRD_EXPIRY_DAYS * 86400000);
  await grantCredit({
    userId: b.userId,
    amount: b.earlyBirdCredit,
    reason: "early_bird",
    refType: "booking",
    refId: b.id,
    note: "早鳥回饋（提早預約，30 天內使用）",
    expiresAt,
  });
  await prisma.booking.update({ where: { id: b.id }, data: { earlyBirdGranted: true } });
}
