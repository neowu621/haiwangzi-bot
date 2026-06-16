// 客人填 /contact 詢問表單後，主動通知老闆（LINE 推播 + Email）。
//
// 設計重點：
//   1. best-effort —— 任何一個管道失敗都只 console.error，絕不 throw，
//      不可影響客人送單（紀錄早已寫進客服信箱）。
//   2. Email 寄「老闆 Gmail」而非 service@：IMAP 收信只收 to:haiwangzi.xyz，
//      寄到 gmail.com 不會被收回去 → 避免無限迴圈。
import { getLineClient } from "@/lib/line";
import { sendViaZsend } from "@/lib/email/zsend";
import { sendViaZeaburEmail } from "@/lib/zeabur-email";
import { prisma } from "@/lib/prisma";

export interface BossInquiryInfo {
  type: "question" | "wish";
  subject: string;
  name: string;
  email: string;
  phone?: string;
  bodyText: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyBossNewInquiry(info: BossInquiryInfo): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://haiwangzi.xyz";
  const link = `${baseUrl}/admin/email`;
  const kind = info.type === "wish" ? "開團許願" : "購買疑慮";
  const title = `🔔 新網站詢問（${kind}）`;
  const who = info.phone ? `${info.name}（☎ ${info.phone}）` : info.name;

  // ── LINE 推播給老闆 / 管理者 ──────────────────────────────
  try {
    const adminIds = (process.env.ADMIN_LINE_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (adminIds.length > 0 && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      const text =
        `${title}\n` +
        `主旨：${info.subject}\n` +
        `姓名：${who}\n` +
        `Email：${info.email}\n\n` +
        `${info.bodyText.slice(0, 300)}\n\n` +
        `👉 前往回覆：${link}`;
      const client = getLineClient();
      for (const uid of adminIds) {
        try {
          await client.pushMessage({ to: uid, messages: [{ type: "text", text }] });
        } catch (e) {
          console.error(`[notify-boss] LINE push to ${uid} failed`, e);
        }
      }
    }
  } catch (e) {
    console.error("[notify-boss] LINE block failed", e);
  }

  // ── Email 通知（寄老闆 Gmail，非 service@ 避免迴圈）──────────
  try {
    const to =
      process.env.ADMIN_NOTIFY_EMAIL ||
      process.env.GMAIL_USER ||
      process.env.INBOUND_GMAIL_USER ||
      "";
    if (to) {
      const html =
        `<div style="font-family:'Microsoft JhengHei',sans-serif;font-size:15px;line-height:1.7;color:#0f2430">` +
        `<h2 style="color:#0a2342;margin:0 0 12px">${title}</h2>` +
        `<p style="margin:4px 0"><b>主旨：</b>${esc(info.subject)}</p>` +
        `<p style="margin:4px 0"><b>姓名：</b>${esc(who)}<br><b>Email：</b>${esc(info.email)}</p>` +
        `<pre style="white-space:pre-wrap;background:#f5f7fa;border-radius:8px;padding:12px;font-family:inherit">${esc(info.bodyText)}</pre>` +
        `<p style="margin:16px 0 4px"><a href="${link}" style="display:inline-block;background:#0a2342;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">前往客服信箱回覆 →</a></p>` +
        `</div>`;
      const text =
        `${title}\n主旨：${info.subject}\n姓名：${who}\nEmail：${info.email}\n\n${info.bodyText}\n\n前往回覆：${link}`;
      const r = await sendViaZsend({
        to,
        subject: `${title}：${info.subject}`,
        html,
        text,
        replyTo: info.email, // 老闆在信箱直接「回覆」即回到客人
      });
      if (!r.ok) console.error("[notify-boss] email send failed:", r.error);
    }
  } catch (e) {
    console.error("[notify-boss] email block failed", e);
  }
}

/**
 * 自動回覆客人：客人有留 Email 就寄一封「已收到，老闆會盡快回覆」確認信，
 * 並把這封 ack 記成同一串的 OUTBOUND（QUEUED→SENT/FAILED），讓客服信箱看得到已自動回過。
 * best-effort：失敗只記 log，不影響客人送單。
 */
export async function sendCustomerAck(params: {
  threadId: string;
  to: string;
  name: string;
  subject: string;
  inquiryMessageId: string;
}): Promise<void> {
  const { threadId, to, name, subject, inquiryMessageId } = params;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://haiwangzi.xyz";
  const ackSubject = `我們已收到你的詢問：${subject}`;
  const greet = name ? `${esc(name)} 你好，` : "你好，";
  const html =
    `<div style="font-family:'Microsoft JhengHei',sans-serif;font-size:15px;line-height:1.8;color:#0f2430;max-width:560px">` +
    `<p>${greet}</p>` +
    `<p>我們<b>已收到你的詢問</b>，汪汪教練會在<b>第一時間（通常一天內）親自回覆你</b>，請稍候 🤿</p>` +
    `<p style="background:#f5f7fa;border-left:4px solid #00d9cb;border-radius:8px;padding:10px 14px;color:#3d5563">` +
    `你詢問的主旨：<b>${esc(subject)}</b></p>` +
    `<p>若比較急，也可以直接加官方 LINE 找我們：<br>` +
    `<a href="https://line.me/R/ti/p/%40894bpmew" style="display:inline-block;margin-top:6px;background:#06c755;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">加 LINE 問汪汪教練</a></p>` +
    `<p style="color:#8595a6;font-size:13px;margin-top:18px">— 東北角海王子潛水團<br>` +
    `本信由系統自動發送；直接回覆此信即可聯絡到我們。</p>` +
    `</div>`;
  const text =
    `${name ? name + " 你好，" : "你好，"}\n\n` +
    `我們已收到你的詢問，汪汪教練會在第一時間（通常一天內）親自回覆你，請稍候。\n\n` +
    `你詢問的主旨：${subject}\n\n` +
    `若比較急，可直接加官方 LINE：https://line.me/R/ti/p/%40894bpmew\n\n` +
    `— 東北角海王子潛水團\n（本信由系統自動發送；直接回覆此信即可聯絡到我們）`;

  let pendingId: string | null = null;
  try {
    const pending = await prisma.emailMessage.create({
      data: {
        threadId,
        direction: "OUTBOUND",
        fromAddr: process.env.ZSEND_FROM ?? "service@haiwangzi.xyz",
        toAddr: to,
        subject: ackSubject,
        bodyText: text,
        bodyHtml: html,
        messageId: `<ack-pending-${Date.now()}@haiwangzi.xyz>`,
        inReplyTo: inquiryMessageId,
        references: inquiryMessageId,
        status: "QUEUED",
      },
    });
    pendingId = pending.id;
    const sent = await sendViaZeaburEmail({
      to,
      subject: ackSubject,
      html,
      text,
      inReplyTo: inquiryMessageId,
      references: inquiryMessageId,
    });
    await prisma.emailMessage.update({
      where: { id: pending.id },
      data: { status: "SENT", providerId: sent.providerId, messageId: sent.messageId },
    });
  } catch (e) {
    console.error("[customer-ack] send failed", e);
    if (pendingId) {
      try {
        await prisma.emailMessage.update({ where: { id: pendingId }, data: { status: "FAILED" } });
      } catch {
        /* ignore */
      }
    }
  }
}
