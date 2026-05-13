import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { testEmail } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  // 可選：若不填則寄給 admin 自己（從 user.email 取）
  to: z.string().email().optional(),
});

// POST /api/admin/email/test
//   寄一封測試信，驗證 Gmail SMTP / Resend / 任何 email 通道是否能用
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  if (!emailConfigured()) {
    return NextResponse.json(
      {
        error: "Email 未設定",
        hint: "請在 Zeabur dashboard 設環境變數：GMAIL_USER + GMAIL_APP_PASSWORD",
      },
      { status: 503 },
    );
  }

  const { to } = Body.parse(await req.json().catch(() => ({})));
  const targetEmail = to ?? auth.user.email ?? null;
  if (!targetEmail) {
    return NextResponse.json(
      {
        error:
          "沒有收件 email：admin 帳號還沒填 email，請先到 /liff/profile 填，或 body 直接帶 { to: '...' }",
      },
      { status: 400 },
    );
  }

  // 取顯示名稱（避免依賴 user.realName 可能 null）
  const u = await prisma.user.findUnique({
    where: { lineUserId: auth.user.lineUserId },
  });
  const name = u?.realName || u?.displayName || "潛水員";

  const tpl = testEmail(name);
  const r = await sendEmail({
    to: targetEmail,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
  });

  return NextResponse.json({
    to: targetEmail,
    ...r,
  });
}
