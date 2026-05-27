import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  genMemberCodeForDate,
  genTripCodeForDate,
  genTourCodeForDate,
  genBookingCodeForDate,
} from "@/lib/code-gen";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-codes
 * 一次性補發所有沒有 code 的舊資料
 * 使用各記錄的 createdAt 日期作為編號日期
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const result = {
    users: 0,
    trips: 0,
    tours: 0,
    bookings: 0,
    errors: 0,
  };

  // ── 會員 ────────────────────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { code: null },
    select: { lineUserId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  for (const u of users) {
    try {
      const code = await genMemberCodeForDate(u.createdAt);
      await prisma.user.update({
        where: { lineUserId: u.lineUserId },
        data: { code },
      });
      result.users++;
    } catch {
      result.errors++;
    }
  }

  // ── 日潛場次 ────────────────────────────────────────────────────────────────
  const trips = await prisma.divingTrip.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  for (const t of trips) {
    try {
      const code = await genTripCodeForDate(t.createdAt);
      await prisma.divingTrip.update({
        where: { id: t.id },
        data: { code },
      });
      result.trips++;
    } catch {
      result.errors++;
    }
  }

  // ── 潛水團 ──────────────────────────────────────────────────────────────────
  const tours = await prisma.tourPackage.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  for (const t of tours) {
    try {
      const code = await genTourCodeForDate(t.createdAt);
      await prisma.tourPackage.update({
        where: { id: t.id },
        data: { code },
      });
      result.tours++;
    } catch {
      result.errors++;
    }
  }

  // ── 訂單 ────────────────────────────────────────────────────────────────────
  const bookings = await prisma.booking.findMany({
    where: { code: null },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  for (const b of bookings) {
    try {
      const code = await genBookingCodeForDate(b.createdAt);
      await prisma.booking.update({
        where: { id: b.id },
        data: { code },
      });
      result.bookings++;
    } catch {
      result.errors++;
    }
  }

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "backfill.codes",
    targetType: "system",
    metadata: result,
  });

  return NextResponse.json({ ok: true, ...result });
}

/**
 * GET /api/admin/backfill-codes
 * 查詢還有多少記錄缺少 code（preview，不執行補發）
 */
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const [users, trips, tours, bookings] = await Promise.all([
    prisma.user.count({ where: { code: null } }),
    prisma.divingTrip.count({ where: { code: null } }),
    prisma.tourPackage.count({ where: { code: null } }),
    prisma.booking.count({ where: { code: null } }),
  ]);

  return NextResponse.json({ users, trips, tours, bookings, total: users + trips + tours + bookings });
}
