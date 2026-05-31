import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { genMemberCode } from "@/lib/code-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  lineUserId: z.string(),
  secret: z.string(),
});

// POST /api/admin/bootstrap
// 第一個 admin 升級用，僅在 DB 還沒有任何 admin/boss 時可用（v175 起一次性）
// 需要傳 LINE_CHANNEL_SECRET 當 secret.
// 之後其他人升 admin 走正規 /api/admin/users (要已是 admin 才能改)
export async function POST(req: NextRequest) {
  const data = Schema.parse(await req.json());
  const expected = process.env.LINE_CHANNEL_SECRET;
  if (!expected || data.secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // v175 安全修正：DB 已有 admin/boss → 拒絕 bootstrap 重複呼叫
  // 防止 secret 外洩後被反覆利用升 admin
  const existingAdmin = await prisma.user.findFirst({
    where: { OR: [{ role: "admin" }, { role: "boss" }] },
    select: { lineUserId: true },
  });
  if (existingAdmin) {
    return NextResponse.json(
      {
        error:
          "bootstrap 已執行過。請改用正規流程：請現有 admin 透過 /api/admin/users PATCH 來授權",
      },
      { status: 403 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { lineUserId: data.lineUserId } });
  const code = existing ? undefined : await genMemberCode();
  const user = await prisma.user.upsert({
    where: { lineUserId: data.lineUserId },
    create: {
      lineUserId: data.lineUserId,
      displayName: `Admin ${data.lineUserId.slice(0, 8)}`,
      role: "admin",
      ...(code && { code }),
    },
    update: { role: "admin" },
  });

  return NextResponse.json({ ok: true, user });
}
