// v959：抵用金到期「一鍵發送提醒」——通知在 window 天內有抵用金即將到期、且仍有餘額的會員。
//   通道由後台傳入(line/email/inapp)；LINE/Email 尊重會員 opt-in，站內一律寫。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";
import { logMessage } from "@/lib/message-log"; // v1067：寫進通訊紀錄 + 拿來做去重依據

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINE_OA = "https://line.me/R/ti/p/%40894bpmew";
const Body = z.object({
  window: z.union([z.literal(7), z.literal(30)]).default(30),
  channels: z.object({ line: z.boolean(), email: z.boolean(), inapp: z.boolean() }).default({ line: false, email: true, inapp: true }),
  preview: z.boolean().optional(), // 只估人數、不發送
  // v1067：同一個到期批次 N 天內不重複提醒（0 = 不去重，強制全發）
  dedupDays: z.number().int().min(0).max(90).optional().default(7),
});

function fmtDate(d: Date): string {
  return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const data = Body.parse(await req.json().catch(() => ({})));
  const now = new Date();
  const end = new Date(now.getTime() + data.window * 86400000);

  // 找 window 內即將到期的發放，取每位會員「最近到期日」
  const grants = await prisma.creditTx.findMany({
    where: { amount: { gt: 0 }, expiresAt: { gte: now, lte: end }, consumedAmount: { lt: prisma.creditTx.fields.amount } }, // v963：只算仍有剩餘的批次
    select: { userId: true, expiresAt: true },
  });
  const earliestByUser = new Map<string, Date>();
  for (const g of grants) {
    if (!g.expiresAt) continue;
    const cur = earliestByUser.get(g.userId);
    if (!cur || g.expiresAt < cur) earliestByUser.set(g.userId, g.expiresAt);
  }
  const userIds = Array.from(earliestByUser.keys());
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, targets: 0, inapp: 0, email: 0, line: 0, note: `${data.window} 天內沒有即將到期的抵用金` });
  }

  // 只通知「仍有餘額 > 0」且未軟刪/黑名單的會員
  const targets = await prisma.user.findMany({
    where: { lineUserId: { in: userIds }, deletedAt: null, blacklisted: false, creditBalance: { gt: 0 } },
    select: { lineUserId: true, displayName: true, realName: true, email: true, creditBalance: true, notifyByLine: true, notifyByEmail: true },
  });

  // v1067：去重 —— 逾時重按、或老闆隔天又按一次，都不該讓同一位會員再收一次同樣的提醒。
  //   依據是 MessageLog：source 帶 window（credit-remind-7 / -30），所以
  //   「30 天提醒發過 → 之後進入 7 天更急迫」仍然發得出去，只有「同一個 window 重複按」才擋。
  const source = `credit-remind-${data.window}`;
  let recentIds = new Set<string>();
  if (data.dedupDays > 0) {
    const since = new Date(now.getTime() - data.dedupDays * 86400000);
    const recent = await prisma.messageLog.findMany({
      where: {
        source,
        status: "sent",
        createdAt: { gte: since },
        recipientId: { in: targets.map((t) => t.lineUserId) },
      },
      select: { recipientId: true },
      distinct: ["recipientId"],
    });
    recentIds = new Set(recent.map((r) => r.recipientId).filter((x): x is string => !!x));
  }
  const pending = targets.filter((t) => !recentIds.has(t.lineUserId));
  const skipped = targets.length - pending.length;

  if (data.preview) {
    return NextResponse.json({ ok: true, targets: pending.length, skipped, inapp: 0, email: 0, line: 0, preview: true });
  }
  if (pending.length === 0) {
    return NextResponse.json({
      ok: true, targets: 0, skipped, inapp: 0, email: 0, line: 0,
      note: `這 ${targets.length} 位在 ${data.dedupDays} 天內都已經提醒過了，這次沒有再發`,
    });
  }

  const wantLine = data.channels.line, wantEmail = data.channels.email, wantInApp = data.channels.inapp;
  const title = "⏰ 抵用金即將到期提醒";
  let inappN = 0, emailN = 0, lineN = 0;
  const client = wantLine ? getLineClient() : null;

  // v1066：原本是「一位一位 await」——17 位會員光 Email 就可能跑掉數十秒，前端 12 秒逾時直接掛掉。
  //   改成分批平行（每批 5 位）：牆鐘時間降到約 1/5，又不會一次打爆 LINE / SES 的速率限制。
  //   刻意不改成 fire-and-forget —— 老闆需要看到「實際發了幾封」，非同步就回不了準確數字。
  const CONCURRENCY = 5;

  async function sendOne(u: typeof targets[number]) {
    const exp = earliestByUser.get(u.lineUserId);
    const bal = u.creditBalance ?? 0;
    const who = u.realName ?? u.displayName ?? "會員";
    const bodyText = [
      `您有抵用金即將到期${exp ? `（最近到期日 ${fmtDate(exp)}）` : ""}。`,
      `目前抵用金餘額：NT$${bal.toLocaleString()}`,
      "💡 下次潛水預約時可直接折抵，把握時間使用喔！",
    ].join("\n");

    if (wantInApp) {
      try {
        await prisma.notification.create({
          data: { userId: u.lineUserId, templateKey: "credit_expiring", title, body: bodyText, linkUrl: "/liff/booking", buttonLabel: "去預約使用", icon: "⏰" },
        });
        inappN++;
        logMessage({ channel: "inapp", templateKey: "credit_expiring", recipientId: u.lineUserId, recipient: who, title, status: "sent", source });
      } catch (e) { console.error("[credit remind inApp]", e); }
    }
    if (wantEmail && (u.notifyByEmail ?? true) && u.email) {
      try {
        const html = `
<div style="font-family:-apple-system,'Noto Sans TC',sans-serif;max-width:480px;margin:0 auto;color:#0A2342">
  <h2 style="color:#0A2342;font-size:18px;margin:0 0 4px">${title}</h2>
  <p style="color:#6b7280;font-size:13px;margin:0 0 16px">${who} 您好，提醒您抵用金即將到期：</p>
  <div style="background:#fff8ec;border:1px solid #f3d8a0;border-radius:10px;padding:16px 18px;margin-bottom:16px">
    <div style="font-size:14px;color:#0A2342">目前抵用金餘額：<b style="font-size:20px;color:#0a8f86">NT$${bal.toLocaleString()}</b></div>
    ${exp ? `<div style="font-size:12.5px;color:#c0392b;margin-top:6px">最近到期日：${fmtDate(exp)}</div>` : ""}
    <div style="font-size:12.5px;color:#0a8f86;font-weight:700;margin-top:10px">💡 下次潛水預約可直接折抵，把握時間使用！</div>
  </div>
  <a href="${LINE_OA}" style="display:inline-block;background:#06c755;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:8px;font-size:14px">預約潛水 / 聯絡小編 →</a>
</div>`;
        await sendEmail({ to: u.email, subject: `${title} — 東北角海王子潛水`, text: bodyText, html });
        emailN++;
        logMessage({ channel: "email", templateKey: "credit_expiring", recipientId: u.lineUserId, recipient: u.email, title, status: "sent", source });
      } catch (e) { console.error("[credit remind email]", e); }
    }
    if (wantLine && client && (u.notifyByLine ?? true)) {
      try {
        await client.pushMessage({ to: u.lineUserId, messages: [{ type: "text", text: `${title}\n\n${bodyText}` }] });
        lineN++;
        logMessage({ channel: "line", templateKey: "credit_expiring", recipientId: u.lineUserId, recipient: who, title, status: "sent", source });
      } catch (e) { console.error("[credit remind line]", e); }
    }
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map(sendOne));
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "credit.remind_expiring",
    targetType: "credit",
    metadata: { window: data.window, targets: pending.length, skipped, inapp: inappN, email: emailN, line: lineN },
  }).catch(() => {});

  return NextResponse.json({ ok: true, targets: pending.length, skipped, inapp: inappN, email: emailN, line: lineN });
}
