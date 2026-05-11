import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  lineUserId: z.string(),
  secret: z.string(),
});

// POST /api/admin/bootstrap
// 第一個 admin 升級用. 需要傳 LINE_CHANNEL_SECRET 當 secret.
// 之後其他人升 admin 走正規 /api/admin/users (要已是 admin 才能改)
export async function POST(req: NextRequest) {
  const data = Schema.parse(await req.json());
  const expected = process.env.LINE_CHANNEL_SECRET;
  if (!expected || data.secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { lineUserId: data.lineUserId },
    create: {
      lineUserId: data.lineUserId,
      displayName: `Admin ${data.lineUserId.slice(0, 8)}`,
      role: "admin",
    },
    update: { role: "admin" },
  });

  return NextResponse.json({ ok: true, user });
}
