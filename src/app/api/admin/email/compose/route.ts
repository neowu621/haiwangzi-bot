import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { sendViaZeaburEmail } from "@/lib/zeabur-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/email/compose  body: { to, subject, html, text?, customerName?, bookingId? }
 * 主動寄新信給客人 → 開一條新 thread + OUTBOUND message。
 * v521：bundle 的 README 有列此端點但未附程式碼，這裡補上（與 reply 同寄信流程，差在開新串）。
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { to, subject, html, text, customerName, bookingId } = (await req.json()) as {
    to?: string;
    subject?: string;
    html?: string;
    text?: string;
    customerName?: string;
    bookingId?: string;
  };
  if (!to || !subject || !html) {
    return NextResponse.json({ error: "to / subject / html 必填" }, { status: 400 });
  }

  // 抑制名單檢查（退信/投訴過的地址不再寄）
  const suppressed = await prisma.suppressedEmail.findUnique({ where: { email: to } });
  if (suppressed) {
    return NextResponse.json(
      { error: `此地址已被列入抑制名單（${suppressed.reason}），請改用 LINE/電話聯絡` },
      { status: 409 },
    );
  }

  // 開新 thread（OUTBOUND 主動信 → 視為處理中）
  const thread = await prisma.emailThread.create({
    data: {
      subject,
      customerEmail: to,
      customerName: customerName || undefined,
      status: "PROCESSING",
      lastMessageAt: new Date(),
      ...(bookingId ? { booking: { connect: { id: bookingId } } } : {}),
    },
  });

  // 先寫 OUTBOUND（QUEUED）
  const pending = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      fromAddr: process.env.ZSEND_FROM ?? "service@haiwangzi.xyz",
      toAddr: to,
      subject,
      bodyHtml: html,
      bodyText: text,
      messageId: `<pending-${Date.now()}@haiwangzi.xyz>`, // 寄出後覆寫
      status: "QUEUED",
    },
  });

  try {
    const sent = await sendViaZeaburEmail({ to, subject, html, text });
    await prisma.emailMessage.update({
      where: { id: pending.id },
      data: { status: "SENT", providerId: sent.providerId, messageId: sent.messageId },
    });
    return NextResponse.json({ ok: true, threadId: thread.id, messageId: pending.id });
  } catch (e) {
    await prisma.emailMessage.update({ where: { id: pending.id }, data: { status: "FAILED" } });
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
