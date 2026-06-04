// v317：admin 一次性發訊息給單一客戶（LINE / Email / 兩者）
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1),
  message: z.string().min(1).max(2000),
  channels: z.array(z.enum(["line", "email"])).min(1),
  emailSubject: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { lineUserId: parsed.data.userId },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      email: true,
      notifyByLine: true,
      notifyByEmail: true,
    },
  });
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }

  const results: Record<string, { ok: boolean; error?: string }> = {};
  const message = parsed.data.message;
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";

  // 1. LINE
  if (parsed.data.channels.includes("line")) {
    if (!target.notifyByLine) {
      results.line = { ok: false, error: "客戶關閉了 LINE 通知" };
    } else {
      const client = getLineClient();
      if (!client) {
        results.line = { ok: false, error: "LINE Channel access token 未設定" };
      } else {
        try {
          await client.pushMessage({
            to: target.lineUserId,
            messages: [{ type: "text", text: message }],
          });
          results.line = { ok: true };
        } catch (e) {
          results.line = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
  }

  // 2. Email
  if (parsed.data.channels.includes("email")) {
    if (!target.email) {
      results.email = { ok: false, error: "客戶未填寫 Email" };
    } else if (!target.notifyByEmail) {
      results.email = { ok: false, error: "客戶關閉了 Email 通知" };
    } else {
      try {
        const subject = parsed.data.emailSubject?.trim() || `${appName} — 訊息通知`;
        await sendEmail({
          to: target.email,
          subject,
          html: `<div style="font-family: 'PingFang TC','Microsoft JhengHei',sans-serif; max-width:600px; padding:24px">
            <p>${(target.realName ?? target.displayName ?? "客戶")} 您好：</p>
            <pre style="white-space:pre-wrap; font-family:inherit; background:#f8fafc; padding:16px; border-radius:8px; line-height:1.7">${message.replace(/</g, "&lt;")}</pre>
            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb" />
            <p style="font-size:12px; color:#6b7280">${appName}</p>
          </div>`,
        });
        results.email = { ok: true };
      } catch (e) {
        results.email = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  // Audit log
  await logAudit({
    actorId: auth.user.lineUserId,
    action: "admin.contact_customer",
    targetType: "user",
    targetId: target.lineUserId,
    targetLabel: target.realName ?? target.displayName,
    metadata: {
      channels: parsed.data.channels,
      messagePreview: message.slice(0, 100),
      results,
    },
  });

  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
