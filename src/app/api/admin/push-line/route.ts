// v310：admin 直接送 LINE 訊息給單一客戶
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  userId: z.string().min(1), // lineUserId
  message: z.string().min(1).max(1000),
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
    select: { lineUserId: true, displayName: true, realName: true, notifyByLine: true },
  });
  if (!target) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  if (!target.notifyByLine) {
    return NextResponse.json(
      { error: "客戶關閉了 LINE 通知，無法私訊" },
      { status: 400 },
    );
  }

  const client = getLineClient();
  if (!client) {
    return NextResponse.json(
      { error: "LINE Channel access token 未設定" },
      { status: 500 },
    );
  }

  try {
    await client.pushMessage({
      to: target.lineUserId,
      messages: [{ type: "text", text: parsed.data.message }],
    });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "admin.push_line",
      targetType: "user",
      targetId: target.lineUserId,
      targetLabel: target.realName ?? target.displayName,
      metadata: { messagePreview: parsed.data.message.slice(0, 100) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /admin/push-line]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
