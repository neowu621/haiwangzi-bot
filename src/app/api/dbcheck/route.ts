import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase 1 開發期確認 DB 連通用,Phase 2 之後可移除
export async function GET() {
  try {
    const start = Date.now();
    const [userCount, tripCount, tourCount, bookingCount] = await Promise.all([
      prisma.user.count(),
      prisma.divingTrip.count(),
      prisma.tourPackage.count(),
      prisma.booking.count(),
    ]);
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - start,
      counts: {
        users: userCount,
        divingTrips: tripCount,
        tourPackages: tourCount,
        bookings: bookingCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
