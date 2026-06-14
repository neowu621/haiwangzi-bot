import { NextRequest, NextResponse } from "next/server";
import type { Prisma, ThreadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/email/threads?status=&tag=&q=&cursor=
 * 客服信箱 console 列表。來源：bundle admin.email.ts 的 /threads，改寫為 Next.js handler。
 */
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status"); // WAITING / PROCESSING / CLOSED
  const tag = sp.get("tag");
  const q = sp.get("q");
  const cursor = sp.get("cursor");

  const where: Prisma.EmailThreadWhereInput = {
    ...(status ? { status: status as ThreadStatus } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const threads = await prisma.emailThread.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 30,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: {
      booking: { select: { id: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return NextResponse.json({ threads });
}
