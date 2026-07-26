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
  channels: z.array(z.enum(["line", "inapp"])).optional(), // v909：加站內，預設站內
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

  const channels = parsed.data.channels ?? ["inapp"]; // v909：預設站內
  const results: Record<string, { ok: boolean; error?: string }> = {};

  // 站內（一律送達，不看 opt-in）
  if (channels.includes("inapp")) {
    try {
      await prisma.notification.create({
        data: {
          userId: target.lineUserId, templateKey: "admin_push", title: "訊息",
          body: parsed.data.message, linkUrl: "/liff/messages", icon: "💬",
        },
      });
      results.inapp = { ok: true };
    } catch (e) {
      results.inapp = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // LINE（選配，需客戶開啟 LINE 通知）
  if (channels.includes("line")) {
    if (!target.notifyByLine) {
      results.line = { ok: false, error: "客戶關閉了 LINE 通知" };
    } else {
      const client = getLineClient();
      if (!client) {
        results.line = { ok: false, error: "LINE Channel access token 未設定" };
      } else {
        try {
          await client.pushMessage({ to: target.lineUserId, messages: [{ type: "text", text: parsed.data.message }] });
          results.line = { ok: true };
        } catch (e) {
          results.line = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "admin.push_line",
    targetType: "user",
    targetId: target.lineUserId,
    targetLabel: target.realName ?? target.displayName,
    metadata: { channels, messagePreview: parsed.data.message.slice(0, 100), results },
  });
  const allOk = Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results }, { status: allOk ? 200 : 207 });
}
