/**
 * v278：訂單狀態歷史 helper
 *
 * 每次 booking.status 變更時呼叫一次。fire-and-forget — 失敗只 log，不影響主流程。
 */
import { prisma } from "./prisma";

export async function logBookingStatusChange(args: {
  bookingId: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  actorRole: "customer" | "coach" | "admin" | "boss" | "system";
  note?: string;
}): Promise<void> {
  try {
    await prisma.bookingStatusLog.create({
      data: {
        bookingId: args.bookingId,
        fromStatus: args.fromStatus ?? null,
        toStatus: args.toStatus,
        actorId: args.actorId,
        actorRole: args.actorRole,
        note: args.note ?? null,
      },
    });
  } catch (e) {
    console.error("[booking-status-log] failed", { args, error: e });
  }
}
