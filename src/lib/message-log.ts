// v473：訊息發送紀錄 + 管理者站內通知 helper
import { prisma } from "./prisma";
import { isQuietHours, quietHoursNote } from "./quiet-hours"; // v1069

export type MsgChannel = "line" | "email" | "inapp";
export type MsgStatus = "sent" | "failed" | "skipped";

/**
 * 記一筆對外訊息發送紀錄（fire-and-forget，永不 throw、永不阻塞主流程）。
 * 任何發送點（notifyCustomer / 試送 / 群發 / 日報…）都可呼叫。
 */
/** v1053：這則訊息是為哪一筆訂單/場次發的（後台通訊紀錄的「對應訂單」欄）。選填，沒帶就顯示「—」。 */
export interface MsgRef {
  type: "booking" | "trip" | "tour";
  id: string;
  /** 顯示用短標，如訂單編號 O20260809-V5；沒有就退回 id 前 8 碼 */
  label?: string | null;
}

export function logMessage(entry: {
  channel: MsgChannel;
  templateKey: string;
  recipientId?: string | null;
  recipient: string;
  title: string;
  status: MsgStatus;
  error?: string | null;
  source?: string;
  ref?: MsgRef | null;
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
        refType: entry.ref?.type ?? null,
        refId: entry.ref?.id ?? null,
        refLabel: entry.ref ? (entry.ref.label || entry.ref.id.slice(0, 8)).slice(0, 128) : null,
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
  /**
   * v1069：true = 同時 LINE 推播給老闆。
   * 站內通知要老闆主動打開 App 才看得到 —— 客戶在等回覆的事（例如退款申請）
   * 半夜送出可能隔一天才被發現，這種要用 LINE 推出去。
   * 收件對象：ADMIN_LINE_USER_IDS（未設定就退回 DB 裡的 admin/boss/it）。
   */
  line?: boolean;
}): void {
  void (async () => {
    try {
      const admins = await prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { role: { in: ["admin", "boss", "it"] } },
            { roles: { hasSome: ["admin", "boss", "it"] } },
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

      // v1069：LINE 推播（best-effort，失敗不影響站內通知）
      //   安靜時段不推 —— 老闆此刻在睡覺，站內通知與待辦徽章隔天一樣看得到，不會漏掉。
      if (opts.line && isQuietHours()) {
        console.log(`[notifyAdmins] ${quietHoursNote()}，改只留站內通知：${opts.title}`);
        logMessage({
          channel: "line",
          templateKey: opts.templateKey,
          recipient: "老闆",
          title: opts.title,
          status: "skipped",
          error: quietHoursNote(),
          source: "admin-notify",
        });
      } else if (opts.line && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
        try {
          const envIds = (process.env.ADMIN_LINE_USER_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
          const targets = envIds.length > 0 ? envIds : admins.map((a) => a.lineUserId);
          const { getLineClient } = await import("./line");
          const client = getLineClient();
          if (client && targets.length > 0) {
            const base = process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz";
            const link = opts.linkUrl
              ? (opts.linkUrl.startsWith("http") ? opts.linkUrl : `${base}${opts.linkUrl}`)
              : "";
            const text = `${opts.title}\n\n${opts.body}${link ? `\n\n👉 ${link}` : ""}`;
            let ok = 0;
            let lastErr = "";
            for (const uid of targets) {
              try {
                await client.pushMessage({ to: uid, messages: [{ type: "text", text }] });
                ok += 1;
              } catch (e) {
                lastErr = e instanceof Error ? e.message : String(e);
                console.error(`[notifyAdmins] LINE push to ${uid} failed`, e);
              }
            }
            logMessage({
              channel: "line",
              templateKey: opts.templateKey,
              recipient: `老闆 ×${ok || targets.length}`,
              title: opts.title,
              status: ok > 0 ? "sent" : "failed",
              error: ok > 0 ? null : lastErr,
              source: "admin-notify",
            });
          }
        } catch (e) {
          console.error("[notifyAdmins] LINE block failed", e);
        }
      }
    } catch (e) {
      console.error("[notifyAdmins]", e);
    }
  })();
}
