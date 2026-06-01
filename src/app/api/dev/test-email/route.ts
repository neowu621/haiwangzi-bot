import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { testEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cron/test-email
//   專用測試端點：以 CRON_SECRET 認證，只寄給 body 指定的單一收件人
//   用途：deploy 後驗證 Gmail SMTP 帳密設定（不需 LIFF idToken）
//
// curl -X POST https://haiwangzi.zeabur.app/api/cron/test-email \
//   -H "Authorization: Bearer $CRON_SECRET" \
//   -H "Content-Type: application/json" \
//   -d '{"to":"neowu@msi.com"}'
const Body = z.object({
  to: z.string().email(),
  name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "server_misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );

  if (!emailConfigured()) {
    return NextResponse.json(
      {
        error: "email_not_configured",
        hint: "請在 Zeabur dashboard 設 GMAIL_USER + GMAIL_APP_PASSWORD",
        envState: {
          GMAIL_USER: !!process.env.GMAIL_USER,
          GMAIL_APP_PASSWORD: !!process.env.GMAIL_APP_PASSWORD,
        },
      },
      { status: 503 },
    );
  }

  const tpl = testEmail(parsed.data.name ?? "潛水員");
  const r = await sendEmail({
    to: parsed.data.to,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });

  return NextResponse.json({
    to: parsed.data.to,
    ...r,
  });
}
