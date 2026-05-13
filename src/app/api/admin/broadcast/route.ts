import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { buildFlexByKey, type FlexTemplateKey } from "@/lib/flex";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { broadcastEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  audience: z.enum(["all", "customers", "coaches", "admins"]).default("all"),
  template: z.string(),
  altText: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  text: z.string().optional(), // 純文字模式（template = "text" 時使用）
  // 通道：line / email / both
  channel: z.enum(["line", "email", "both"]).default("line"),
  // Email 專用欄位
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
});

// POST /api/admin/broadcast
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = BodySchema.parse(await req.json());

  // 算 audience userIds（拿完整 user 物件，後面 email 也要用）
  const where =
    data.audience === "all"
      ? {}
      : { role: data.audience.slice(0, -1) as "customer" | "coach" | "admin" };
  const targets = await prisma.user.findMany({ where });

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0, emailed: 0 });
  }

  const result: {
    ok: boolean;
    delivered: number;
    emailed: number;
    dryRun?: boolean;
    note?: string;
    channel: string;
  } = {
    ok: true,
    delivered: 0,
    emailed: 0,
    channel: data.channel,
  };

  // ── LINE 通道 ───────────────────────────────────
  if (data.channel === "line" || data.channel === "both") {
    let messages;
    if (data.template === "text") {
      messages = [{ type: "text" as const, text: data.text ?? data.altText }];
    } else {
      const flex = buildFlexByKey(
        data.template as FlexTemplateKey,
        data.params as Record<string, unknown>,
        data.altText,
      );
      messages = [flex];
    }

    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      result.dryRun = true;
      result.note = "LINE_CHANNEL_ACCESS_TOKEN 未設定，LINE 僅 dry-run";
    } else {
      const client = getLineClient();
      // 只發給 opt-in 的 user
      const lineUserIds = targets
        .filter((t) => t.notifyByLine)
        .map((t) => t.lineUserId);

      const chunks: string[][] = [];
      for (let i = 0; i < lineUserIds.length; i += 500)
        chunks.push(lineUserIds.slice(i, i + 500));

      for (const chunk of chunks) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await client.multicast({ to: chunk, messages: messages as any });
          result.delivered += chunk.length;
        } catch (e) {
          console.error("multicast chunk error", e);
        }
      }
    }
  }

  // ── Email 通道 ───────────────────────────────────
  if (data.channel === "email" || data.channel === "both") {
    if (!emailConfigured()) {
      result.dryRun = true;
      result.note =
        (result.note ? result.note + "; " : "") +
        "Email env (GMAIL_USER/GMAIL_APP_PASSWORD) 未設定，Email 僅 dry-run";
    } else {
      const subject = data.emailSubject?.trim() || data.altText;
      const body = data.emailBody?.trim() || data.text || data.altText;
      const emailRecipients = targets.filter(
        (t) => t.notifyByEmail && t.email,
      );
      for (const u of emailRecipients) {
        if (!u.email) continue;
        const tpl = broadcastEmail({
          name: u.realName ?? u.displayName,
          subject,
          bodyText: body,
        });
        const r = await sendEmail({
          to: u.email,
          subject: tpl.subject,
          text: tpl.text,
          html: tpl.html,
        });
        if (r.ok) result.emailed += 1;
      }
    }
  }

  return NextResponse.json(result);
}
