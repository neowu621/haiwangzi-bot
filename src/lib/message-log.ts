// v473：訊息發送紀錄 + 管理者站內通知 helper
import { prisma } from "./prisma";

export type MsgChannel = "line" | "email" | "inapp";
export type MsgStatus = "sent" | "failed" | "skipped";

/**
 * 記一筆對外訊息發送紀錄（fire-and-forget，永不 throw、永不阻塞主流程）。
 * 任何發送點（notifyCustomer / 試送 / 群發 / 日報…）都可呼叫。
 */
export function logMessage(entry: {
  channel: MsgChannel;
  templateKey: string;
  recipientId?: string | null;
  recipient: string;
  title: string;
  status: MsgStatus;
  error?: string | null;
  source?: string;
}): void {
  void prisma.messageLog
    .create({
      data: {
        channel: entry.channel,
        templateKey: entry.templateKey,
        recipientId: entry.recipientId ?? null,
        recipient: (entry.recipient || "—").slice(0, 254),
        title: entry.title || "—",
        status: entry.status,
        error: entry.error ? String(entry.error).slice(0, 2000) : null,
        source: entry.source ?? "system",
      },
    })
    .catch((e) => console.error("[logMessage]", e));
}

/**
 * 發站內通知給「所有現役管理者 / 老闆」(admin / boss)。
 * 用於需要老闆/管理者確認的事件（新付款證明、退款申請、客製願望單…）。
 * fire-and-forget，獨立 try/catch。
 */
export function notifyAdmins(opts: {
  templateKey: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  icon?: string | null;
}): void {
  void (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { role: { in: ["admin", "boss"] } },
            { roles: { hasSome: ["admin", "boss"] } },
          ],
        },
        select: { lineUserId: true },
      });
      if (admins.length === 0) return;
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.lineUserId,
          templateKey: opts.templateKey,
          title: opts.title,
          body: opts.body,
          linkUrl: opts.linkUrl ?? null,
          icon: opts.icon ?? "🔔",
        })),
      });
      // 同步記入發送紀錄（彙總一列，標明發給 N 位管理者）
      logMessage({
        channel: "inapp",
        templateKey: opts.templateKey,
        recipient: `管理者 ×${admins.length}`,
        title: opts.title,
        status: "sent",
        source: "admin-notify",
      });
    } catch (e) {
      console.error("[notifyAdmins]", e);
    }
  })();
}
