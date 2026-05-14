import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/cron/expire-trip-photos
//   每日 cron，刪掉 expiresAt < now 的 TripPhoto + 對應的 R2 物件
//   Auth: Authorization: Bearer <CRON_SECRET>
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 },
    );
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const expired = await prisma.tripPhoto.findMany({
    where: { expiresAt: { lt: now } },
    select: { id: true, r2Key: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({
      ok: true,
      action: "nothing_to_delete",
      checkedAt: now,
    });
  }

  const r2Errors: Array<{ key: string; error: string }> = [];
  if (r2Configured()) {
    for (const p of expired) {
      try {
        await deleteObject("trips", p.r2Key);
      } catch (e) {
        r2Errors.push({
          key: p.r2Key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const r = await prisma.tripPhoto.deleteMany({
    where: { id: { in: expired.map((p) => p.id) } },
  });

  return NextResponse.json({
    ok: true,
    expired: expired.length,
    r2Deleted: expired.length - r2Errors.length,
    dbDeleted: r.count,
    r2Errors,
    checkedAt: now,
  });
}
