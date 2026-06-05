// v335: 客戶端 LIFF 頁面 mount 時 ping 此 endpoint 紀錄產品瀏覽
//   - 30 分鐘 dedupe：同 userId + 同 targetId 30 分鐘內只 log 1 筆
//   - 公開瀏覽 (未登入)：不 log
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { logCustomerActivity } from "@/lib/customer-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  type: z.enum(["daily", "tour", "date"]),
  id: z.string().min(1).max(64),
  label: z.string().max(128).optional(),
});

const DEDUPE_MINUTES = 30;

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  // 未登入：不 log（產品頁公開可看）
  if (!auth.ok) return NextResponse.json({ ok: true, logged: false, reason: "not_logged_in" });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { type, id, label } = parsed.data;

  // dedupe：同 userId + 同 action + 同 targetId 30 分鐘內已有 log → skip
  const dedupeCutoff = new Date(Date.now() - DEDUPE_MINUTES * 60_000);
  const recent = await prisma.auditLog.findFirst({
    where: {
      actorId: auth.user.lineUserId,
      action: "customer.view.product",
      targetType: type,
      targetId: id,
      createdAt: { gte: dedupeCutoff },
    },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json({ ok: true, logged: false, reason: "dedupe" });
  }

  await logCustomerActivity({
    req,
    user: { lineUserId: auth.user.lineUserId, realName: auth.user.realName, displayName: auth.user.displayName },
    action: "customer.view.product",
    targetType: type,        // "daily" / "tour" / "date"
    targetId: id,
    targetLabel: label,
    metadata: { type },
  });

  return NextResponse.json({ ok: true, logged: true });
}
