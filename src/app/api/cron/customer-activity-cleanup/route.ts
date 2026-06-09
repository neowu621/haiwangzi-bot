// v334: 自動刪除 90 天前的客戶活動紀錄（合 PDPA）
// 排除 admin/boss/system 操作（合規保留）
// 建議 Cronicle 排程：每日 04:00 Asia/Taipei
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RETENTION_DAYS = 90;

async function run(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const r = await prisma.auditLog.deleteMany({
    where: {
      actorRole: "customer",
      createdAt: { lt: cutoff },
    },
  });

  return NextResponse.json({ ok: true, deleted: r.count, cutoffISO: cutoff.toISOString() });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
