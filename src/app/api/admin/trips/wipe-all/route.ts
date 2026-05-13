import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 危險：刪除所有 DivingTrip + TourPackage 開團設定 + 相關 booking + paymentProof + reminderLog
// 用途：admin 想從乾淨狀態重新開始建場次（例如初期測試用的資料清光）
//
// 安全：
// - 只有 admin 能呼叫
// - 必須在 body 帶 confirm: "WIPE-ALL-TRIPS-AND-TOURS"
// - 會回傳實際刪除的數量
// - 不會動：DiveSite / Coach / User / SiteConfig / TripMedia
const Body = z.object({
  confirm: z.literal("WIPE-ALL-TRIPS-AND-TOURS"),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          'confirm field 必須為 "WIPE-ALL-TRIPS-AND-TOURS" (前端 UI 已自動帶上)',
      },
      { status: 400 },
    );
  }

  // 在 transaction 內依關聯順序刪
  const result = await prisma.$transaction(async (tx) => {
    // 1. 找出全部 daily + tour bookings
    const allBookings = await tx.booking.findMany({
      where: { OR: [{ type: "daily" }, { type: "tour" }] },
      select: { id: true },
    });
    const bookingIds = allBookings.map((b) => b.id);

    // 2. 刪 paymentProof（onDelete: Cascade 也會處理，但顯式刪較清楚）
    const proofs = await tx.paymentProof.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });

    // 3. 刪 reminderLog（schema 為 SetNull on booking delete，但 booking 全刪我們也清乾淨）
    const reminders = await tx.reminderLog.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });

    // 4. 刪 bookings
    const bookings = await tx.booking.deleteMany({
      where: { id: { in: bookingIds } },
    });

    // 5. 刪 DivingTrip
    const trips = await tx.divingTrip.deleteMany({});

    // 6. 刪 TourPackage
    const tours = await tx.tourPackage.deleteMany({});

    return {
      tripsDeleted: trips.count,
      toursDeleted: tours.count,
      bookingsDeleted: bookings.count,
      paymentProofsDeleted: proofs.count,
      reminderLogsDeleted: reminders.count,
    };
  });

  return NextResponse.json({
    ok: true,
    ...result,
    note: "未動到：DiveSite / Coach / User / SiteConfig / TripMedia / MessageTemplate",
  });
}
