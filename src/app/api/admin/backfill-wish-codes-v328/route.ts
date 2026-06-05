// v328: 一次性 backfill — 給舊願望單補上 W20260605-XX 編號
// 部署後跑一次（Bearer CRON_SECRET 或 admin auth），之後可刪除此 endpoint。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { genWishCodeForDate } from "@/lib/code-gen";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(req: NextRequest) {
  // 接受 Bearer CRON_SECRET 或 admin/boss
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  let authed = false;
  if (process.env.CRON_SECRET && authHeader === expected) {
    authed = true;
  } else {
    const auth = await authFromRequest(req);
    if (auth.ok) {
      const role = requireRole(auth.user, ["admin", "boss"]);
      if (role.ok) authed = true;
    }
  }
  if (!authed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const wishes = await prisma.diveWish.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    take: 500,
  });

  let ok = 0;
  let fail = 0;
  for (const w of wishes) {
    try {
      const code = await genWishCodeForDate(w.createdAt);
      await prisma.diveWish.update({
        where: { id: w.id },
        data: { code },
      });
      ok++;
    } catch (e) {
      fail++;
      console.error("[backfill-wish-codes]", w.id, e);
    }
  }

  return NextResponse.json({ ok: true, found: wishes.length, backfilled: ok, failed: fail });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
