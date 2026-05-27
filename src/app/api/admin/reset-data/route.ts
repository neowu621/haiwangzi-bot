import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reset-data
 * 清空訂單、日潛場次、潛水團（保留會員資料）
 * 僅限 admin/boss，需要在 body 帶 confirm 字串
 *
 * Body: { confirm: "DELETE ALL DATA" }
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== "DELETE ALL DATA") {
    return NextResponse.json(
      { error: "confirm 字串不符，請傳入 { confirm: 'DELETE ALL DATA' }" },
      { status: 400 },
    );
  }

  // 依 FK 順序刪除：先 Booking（有外鍵參照 Trip/Tour），再 Trip/Tour
  const [bookingCount, tripCount, tourCount] = await prisma.$transaction([
    prisma.booking.deleteMany({}),
    prisma.divingTrip.deleteMany({}),
    prisma.tourPackage.deleteMany({}),
  ]);

  await logAudit({
    actorId: auth.lineUserId,
    actorName: auth.user.displayName,
    action: "data.reset",
    targetType: "system",
    targetId: "all",
    targetLabel: "清空訂單/場次/潛水團",
    metadata: {
      bookingsDeleted: bookingCount.count,
      tripsDeleted: tripCount.count,
      toursDeleted: tourCount.count,
    },
  });

  return NextResponse.json({
    ok: true,
    deleted: {
      bookings: bookingCount.count,
      trips: tripCount.count,
      tours: tourCount.count,
    },
  });
}
