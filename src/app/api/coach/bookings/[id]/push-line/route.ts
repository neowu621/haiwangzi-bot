import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { logMessage } from "@/lib/message-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v1010：教練今日「💬 LINE」—— 透過官方帳號推播文字訊息給該筆訂單的客人。
//   個人 LINE 無法用 userId 開聊天室，走 OA 推播；客人回覆會進客服信箱。
//   教練/助教/老闆/管理者可用；記入通訊紀錄。
const Body = z.object({ message: z.string().min(1).max(500) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "assistant", "boss", "admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "請輸入訊息（500 字內）" }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: { userId: true, user: { select: { realName: true, displayName: true } } },
  });
  if (!booking) return NextResponse.json({ error: "訂單不存在" }, { status: 404 });

  const lineClient = getLineClient();
  if (!lineClient) return NextResponse.json({ error: "LINE 未設定" }, { status: 500 });

  const coachName = auth.user.realName ?? auth.user.displayName ?? "教練";
  const text = `🤿 ${coachName} 教練訊息：\n${parsed.data.message}\n\n（直接回覆此訊息即可，小編/教練都看得到）`;
  const who = booking.user.realName ?? booking.user.displayName;
  try {
    await lineClient.pushMessage({ to: booking.userId, messages: [{ type: "text", text }] });
    logMessage({ channel: "line", templateKey: "coach_push", recipientId: booking.userId, recipient: who, title: `教練訊息：${parsed.data.message.slice(0, 30)}`, status: "sent", source: "coach" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logMessage({ channel: "line", templateKey: "coach_push", recipientId: booking.userId, recipient: who, title: "教練訊息", status: "failed", error: msg, source: "coach" });
    return NextResponse.json({ error: `發送失敗：${msg}` }, { status: 500 });
  }
}
