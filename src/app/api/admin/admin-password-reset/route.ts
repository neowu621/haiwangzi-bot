// v357：在線 admin/boss 重設「另一個 admin/boss」的後台登入密碼
//   設計：清空對方的 webPasswordHash → 對方下次登入會走「首次設定密碼」流程自設新密碼。
//   安全：需要「已登入的 admin/boss」JWT（authFromRequest）——攻擊者只有 ADMIN_WEB_SECRET
//        也登不進來、拿不到 JWT，無法觸發。每次重設寫 audit log。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getLineClient } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ targetLineUserId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed" }, { status: 400 });
  }
  const { targetLineUserId } = parsed.data;

  // 不能重設自己（自己請用「變更密碼」流程，需現密碼）
  if (targetLineUserId === auth.user.lineUserId) {
    return NextResponse.json(
      { error: "不能重設自己的密碼；請用登入頁的「變更密碼」", code: "SELF_RESET" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { lineUserId: targetLineUserId },
    select: { lineUserId: true, displayName: true, realName: true, role: true, roles: true, webPasswordHash: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  const targetRoles =
    target.roles && target.roles.length > 0 ? target.roles : [target.role];
  if (!targetRoles.includes("admin") && !targetRoles.includes("boss")) {
    return NextResponse.json(
      { error: "只能重設 admin / boss 帳號的登入密碼" },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { lineUserId: targetLineUserId },
    data: { webPasswordHash: null },
  });

  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: auth.user.realName ?? auth.user.displayName ?? undefined,
    action: "auth.password_force_reset",
    targetType: "user",
    targetId: targetLineUserId,
    targetLabel: target.realName ?? target.displayName ?? targetLineUserId,
    metadata: { hadPassword: !!target.webPasswordHash },
  });

  // v365：LINE 通知被重設的 admin/boss 本人（安全慣例：密碼被動就該知道）。best-effort，失敗不影響重設。
  let notified = false;
  try {
    const operator = auth.user.realName ?? auth.user.displayName ?? "管理員";
    const loginUrl = process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/admin/login`
      : "後台登入頁";
    const text =
      `🔑 後台登入密碼已被重設\n\n` +
      `你的「海王子後台」登入密碼已由 ${operator} 重設。\n` +
      `下次登入時，請在登入頁重新設定一組新密碼。\n\n` +
      `登入：${loginUrl}\n\n` +
      `⚠️ 若這不是你預期的操作，請立即聯絡其他管理員。`;
    const client = getLineClient();
    await client.pushMessage({
      to: targetLineUserId,
      messages: [{ type: "text", text }],
    });
    notified = true;
  } catch (e) {
    console.error("[admin-password-reset] LINE notify failed:", e);
  }

  return NextResponse.json({
    ok: true,
    notified,
    message: `已清空 ${target.realName ?? target.displayName ?? targetLineUserId} 的登入密碼，對方下次登入需重新設定${notified ? "（已 LINE 通知本人）" : "（LINE 通知未送達）"}`,
  });
}
