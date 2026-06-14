import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { sendViaZeaburEmail } from "@/lib/zeabur-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/email/threads/:id/reply  body: { html, text? }
 * 回信 → Zeabur Email → 寫 OUTBOUND。來源：bundle admin.email.ts 的 POST /threads/:id/reply。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const { html, text } = (await req.json()) as { html: string; text?: string };
  if (!html) return NextResponse.json({ error: "missing html" }, { status: 400 });

  const thread = await prisma.emailThread.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "desc" } } },
  });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 抑制名單檢查（退信/投訴過的地址不再寄）
  const suppressed = await prisma.suppressedEmail.findUnique({
    where: { email: thread.customerEmail },
  });
  if (suppressed) {
    return NextResponse.json(
      { error: `此地址已被列入抑制名單（${suppressed.reason}），請改用 LINE/電話聯絡` },
      { status: 409 },
    );
  }

  // threading：接到最近一封信
  const last = thread.messages[0];
  const subject = thread.subject.match(/^re:/i) ? thread.subject : `Re: ${thread.subject}`;

  // 先寫 OUTBOUND（QUEUED）
  const pending = await prisma.emailMessage.create({
    data: {
      threadId: id,
      direction: "OUTBOUND",
      fromAddr: process.env.ZSEND_FROM ?? "service@haiwangzi.xyz",
      toAddr: thread.customerEmail,
      subject,
      bodyHtml: html,
      bodyText: text,
      messageId: `<pending-${Date.now()}@haiwangzi.xyz>`, // 寄出後覆寫
      inReplyTo: last?.messageId,
      references: [last?.references, last?.messageId].filter(Boolean).join(" ") || null,
      status: "QUEUED",
    },
  });

  try {
    const sent = await sendViaZeaburEmail({
      to: thread.customerEmail,
      subject,
      html,
      text,
      inReplyTo: last?.messageId ?? undefined,
      references: pending.references ?? undefined,
    });

    await prisma.emailMessage.update({
      where: { id: pending.id },
      data: { status: "SENT", providerId: sent.providerId, messageId: sent.messageId },
    });
    await prisma.emailThread.update({
      where: { id },
      data: { status: "PROCESSING", lastMessageAt: new Date() },
    });

    return NextResponse.json({ ok: true, messageId: pending.id });
  } catch (e) {
    await prisma.emailMessage.update({
      where: { id: pending.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
