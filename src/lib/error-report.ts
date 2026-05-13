/**
 * 輕量級錯誤回報 wrapper。
 *
 * 用法：
 *   import { reportError } from "@/lib/error-report";
 *   try { ... } catch (e) { reportError(e, { context: "cron/reminders" }); throw e; }
 *
 * 後端策略：
 *   1. 寫 console.error (Zeabur 自動收集 stdout)
 *   2. (選) 推 LINE 訊息給 admin (環境變數 ADMIN_LINE_USER_IDS 設了才推)
 *   3. (選) 送到 Sentry / Better Stack 等外部 (環境變數 SENTRY_DSN 設了才送)
 *
 * 目前實作 1 + 2；3 留位給未來接 Sentry SDK。
 */

import { getLineClient } from "@/lib/line";

export interface ErrorReportContext {
  context?: string;
  userId?: string;
  endpoint?: string;
  extra?: Record<string, unknown>;
}

export async function reportError(
  err: unknown,
  ctx: ErrorReportContext = {},
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  // 1. console.error (Zeabur logs)
  console.error("[ERROR]", {
    context: ctx.context,
    endpoint: ctx.endpoint,
    userId: ctx.userId,
    message: msg,
    stack,
    extra: ctx.extra,
  });

  // 2. 推 LINE 給 admin (如果有設 ADMIN_LINE_USER_IDS)
  const adminIds = (process.env.ADMIN_LINE_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    adminIds.length > 0 &&
    process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    process.env.NODE_ENV === "production"
  ) {
    try {
      const client = getLineClient();
      const text =
        `⚠️ 系統錯誤 (${ctx.context ?? "unknown"})\n` +
        `${ctx.endpoint ? `Endpoint: ${ctx.endpoint}\n` : ""}` +
        `${ctx.userId ? `User: ${ctx.userId.slice(0, 8)}...\n` : ""}` +
        `Error: ${msg.slice(0, 200)}`;
      await Promise.all(
        adminIds.map((to) =>
          client.pushMessage({
            to,
            messages: [{ type: "text", text }],
          }),
        ),
      );
    } catch (e) {
      // 失敗就忍痛吃掉（不能把錯誤回報本身搞 crash）
      console.error("[reportError push fail]", e);
    }
  }

  // 3. TODO: Sentry / Better Stack 接口 (留位)
  //   if (process.env.SENTRY_DSN) { Sentry.captureException(err, { context: ctx }); }
}
