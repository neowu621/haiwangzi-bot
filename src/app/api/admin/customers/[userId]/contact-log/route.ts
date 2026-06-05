// v320: 客戶完整聯絡討論串
// 回傳 audit_logs 中 action="admin.contact_customer" + targetId=userId 的紀錄
// 給 CustomerDetailDialog 用，老闆看得到過去 LINE / Email 通通講過什麼。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContactMeta {
  channels?: string[];
  messagePreview?: string;
  results?: Record<string, { ok: boolean; error?: string }>;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { userId } = await ctx.params;

  const logs = await prisma.auditLog.findMany({
    where: {
      action: "admin.contact_customer",
      targetId: userId,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      actorId: true,
      actorName: true,
      metadata: true,
    },
  });

  const entries = logs.map((l) => {
    const meta = (l.metadata as ContactMeta) ?? {};
    return {
      id: l.id,
      at: l.createdAt.toISOString(),
      from: l.actorName ?? l.actorId ?? "管理員",
      channels: meta.channels ?? [],
      message: meta.messagePreview ?? "",
      results: meta.results ?? {},
    };
  });

  return NextResponse.json({ entries });
}
