import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  userId: z.string(),
  channel: z.enum(["line", "email", "both"]),
  lineText: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
});

// POST /api/admin/notify — 對單一會員發送 LINE 推播 或 Email
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = BodySchema.parse(await req.json());

  const user = await prisma.user.findUnique({
    where: { lineUserId: data.userId },
    select: {
      lineUserId: true,
      displayName: true,
      realName: true,
      email: true,
    },
  });
  if (!user)
    return NextResponse.json({ error: "user not found" }, { status: 404 });

  const result = {
    lineSent: false,
    emailSent: false,
    lineError: null as string | null,
    emailError: null as string | null,
  };

  // ── LINE 推播 ───────────────────────────────────────────────────────────────
  if (data.channel === "line" || data.channel === "both") {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      result.lineError = "LINE_CHANNEL_ACCESS_TOKEN 未設定";
    } else {
      try {
        const client = getLineClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).pushMessage({
          to: user.lineUserId,
          messages: [{ type: "text", text: data.lineText ?? "(無訊息)" }],
        });
        result.lineSent = true;
      } catch (e) {
        result.lineError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // ── Email ───────────────────────────────────────────────────────────────────
  if (data.channel === "email" || data.channel === "both") {
    if (!emailConfigured()) {
      result.emailError = "Email env 未設定";
    } else if (!user.email) {
      result.emailError = "此會員無 Email";
    } else {
      const bodyText = data.emailBody ?? "";
      const r = await sendEmail({
        to: user.email,
        subject: data.emailSubject?.trim() || "(無主旨)",
        text: bodyText,
        html: `<p>${bodyText.replace(/\n/g, "<br>")}</p>`,
      });
      if (r.ok) result.emailSent = true;
      else result.emailError = r.error ?? r.reason ?? "Email 發送失敗";
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "notify.send",
    targetType: "user",
    targetId: data.userId,
    metadata: { channel: data.channel, lineSent: result.lineSent, emailSent: result.emailSent },
  });

  return NextResponse.json({ ok: true, ...result });
}
