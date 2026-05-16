import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEV_PERSONAS, isDevModeEnabled, findDevPersona } from "@/lib/dev-personas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/dev/login — 列出所有 dev personas（僅 dev 模式可用）
export async function GET() {
  if (!isDevModeEnabled()) {
    return NextResponse.json(
      { error: "dev mode not enabled" },
      { status: 403 },
    );
  }
  return NextResponse.json({
    enabled: true,
    personas: DEV_PERSONAS,
  });
}

// POST /api/dev/login  body: { lineUserId }
// 確保該 dev persona 已建在 DB（upsert），不存在則建立
// 注意：實際「登入」是 client side 把 lineUserId 存 localStorage，
//   後續 fetchWithAuth 把 ?lineUserId= 帶在 query string，
//   server 端 authFromRequest 在 dev mode 接受這個 fallback。
//   這個 endpoint 只負責建立 user row。
export async function POST(req: NextRequest) {
  if (!isDevModeEnabled()) {
    return NextResponse.json(
      { error: "dev mode not enabled" },
      { status: 403 },
    );
  }
  const body = await req.json();
  const lineUserId = body.lineUserId as string;
  const persona = findDevPersona(lineUserId);
  if (!persona) {
    return NextResponse.json(
      { error: "unknown dev persona", lineUserId },
      { status: 400 },
    );
  }

  // upsert：保留現有資料（roles 已被人為改過時不蓋掉），只在 create 時填預設
  const user = await prisma.user.upsert({
    where: { lineUserId: persona.lineUserId },
    create: {
      lineUserId: persona.lineUserId,
      displayName: persona.displayName,
      realName: persona.realName,
      phone: persona.phone ?? null,
      email: persona.email ?? null,
      cert: persona.cert ?? null,
      certNumber: persona.certNumber ?? null,
      role: persona.roles[0],
      roles: persona.roles,
    },
    update: {
      lastActiveAt: new Date(),
      // 強制把 roles 對齊 persona 定義（dev 預期角色固定）
      role: persona.roles[0],
      roles: persona.roles,
    },
  });

  return NextResponse.json({ ok: true, persona, user });
}
