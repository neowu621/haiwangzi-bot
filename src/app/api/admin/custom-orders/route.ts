import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { generatePayLinkToken, buildPayLinkUrl } from "@/lib/pay-link";
import { genBookingCode } from "@/lib/code-gen";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";
import { logMessage } from "@/lib/message-log";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/custom-orders — 列出客製訂單
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const rows = await prisma.booking.findMany({
    where: { type: "custom" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { displayName: true, realName: true, code: true } } },
  });
  return NextResponse.json({
    orders: rows.map((b) => ({
      id: b.id,
      code: b.code,
      customer: b.user.realName ?? b.user.displayName,
      memberCode: b.user.code,
      itemName: b.customItemName,
      category: b.customCategory,
      amount: b.totalAmount,
      paidAmount: b.paidAmount,
      status: b.status,
      paymentStatus: b.paymentStatus,
      signed: !!b.signedAt,
      contractPdfKey: b.contractPdfKey,
      payLink: b.payLinkToken && !b.payLinkVerifiedAt ? buildPayLinkUrl(b.id, b.payLinkToken) : null,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}

const CreateSchema = z.object({
  userId: z.string().min(1), // 會員 lineUserId（須已註冊）
  itemName: z.string().min(1).max(128),
  amount: z.number().int().min(1).max(1_000_000),
  category: z.string().min(1).max(32), // 合約類別
  refUrl: z.string().max(2000).optional().or(z.literal("")),
  adminNote: z.string().max(2000).optional().or(z.literal("")),
});

// POST /api/admin/custom-orders — 老闆開單給會員
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const d = CreateSchema.parse(await req.json());

  // 前提：會員須已註冊且未被停用
  const member = await prisma.user.findUnique({ where: { lineUserId: d.userId } });
  if (!member || member.deletedAt) {
    return NextResponse.json({ error: "找不到此會員（或已停用）。客製開單前會員須先註冊。" }, { status: 400 });
  }

  // 合約類別須存在
  const tpl = await prisma.contractTemplate.findUnique({ where: { category: d.category } });
  if (!tpl) {
    return NextResponse.json({ error: "找不到此合約類別，請先到合約範本建立。" }, { status: 400 });
  }

  const code = await genBookingCode().catch(() => null);
  const payLinkToken = generatePayLinkToken();

  const booking = await prisma.booking.create({
    data: {
      code,
      userId: d.userId,
      type: "custom",
      refId: crypto.randomUUID(), // 客製單無對應 trip，填隨機 UUID 佔位
      participants: 1,
      totalAmount: d.amount,
      depositAmount: 0,
      paidAmount: 0,
      paymentStatus: "pending",
      status: "pending",
      payLinkToken,
      customItemName: d.itemName,
      customCategory: d.category,
      customRefUrl: d.refUrl || tpl.refUrl || null,
      adminNotes: d.adminNote || null,
      // 客製單由老闆建立，會員的正式同意以「合約簽署」(signedAt) 為準；此欄記為建單時間
      agreedToTermsAt: new Date(),
    },
  });

  const payUrl = buildPayLinkUrl(booking.id, payLinkToken);
  const who = member.realName ?? member.displayName ?? "您";
  const altText = `海王子為您開立訂單：${d.itemName}，金額 NT$${d.amount.toLocaleString()}`;
  const bodyText = `${who} 您好，海王子教練為您開立了一筆訂單：\n\n📋 ${d.itemName}\n💰 NT$ ${d.amount.toLocaleString()}\n📝 合約：${tpl.title}\n\n請點開連結，閱讀並簽署合約後完成付款。`;

  // ── 通知會員：LINE 文字 + 站內 + Email ──
  // LINE
  void (async () => {
    try {
      if (member.notifyByLine ?? true) {
        const client = getLineClient();
        if (client) {
          await client.pushMessage({ to: d.userId, messages: [{ type: "text", text: `${altText}\n\n👉 ${payUrl}` }] });
          logMessage({ channel: "line", templateKey: "custom_order_created", recipientId: d.userId, recipient: who, title: altText, status: "sent", source: "custom-order" });
        }
      }
    } catch (e) {
      logMessage({ channel: "line", templateKey: "custom_order_created", recipientId: d.userId, recipient: who, title: altText, status: "failed", error: e instanceof Error ? e.message : String(e), source: "custom-order" });
    }
  })();
  // 站內
  void prisma.notification.create({
    data: { userId: d.userId, templateKey: "custom_order_created", title: `📋 海王子為您開立訂單`, body: bodyText, linkUrl: payUrl, icon: "📋" },
  }).then(() => logMessage({ channel: "inapp", templateKey: "custom_order_created", recipientId: d.userId, recipient: who, title: altText, status: "sent", source: "custom-order" }))
    .catch(() => {});
  // Email
  if ((member.notifyByEmail ?? true) && member.email) {
    void (async () => {
      const html = `<div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;line-height:1.8"><h2>📋 海王子為您開立訂單</h2><p>${who} 您好，海王子教練為您開立了一筆訂單：</p><ul><li>品項：<b>${d.itemName}</b></li><li>金額：<b>NT$ ${d.amount.toLocaleString()}</b></li><li>合約：${tpl.title}</li></ul><p>請點下方連結，閱讀並簽署合約後完成付款：</p><p><a href="${payUrl}" style="background:#00D9CB;color:#0A2342;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">前往付款 →</a></p></div>`;
      const r = await sendEmail({ to: member.email!, subject: `海王子訂單：${d.itemName}`, text: `${bodyText}\n\n${payUrl}`, html });
      logMessage({ channel: "email", templateKey: "custom_order_created", recipientId: d.userId, recipient: member.email!, title: altText, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error ?? null, source: "custom-order" });
    })();
  }

  void logAudit({
    actorId: auth.user.lineUserId,
    action: "custom_order.create",
    targetType: "booking",
    targetId: booking.id,
    targetLabel: `${d.itemName} NT$${d.amount} → ${who}`,
  });

  return NextResponse.json({ ok: true, booking: { id: booking.id, code: booking.code, payLink: payUrl } });
}
