import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tours - 列出開放中的旅行團
export async function GET() {
  const tours = await prisma.tourPackage.findMany({
    where: { status: { in: ["open", "full"] } },
    orderBy: { dateStart: "asc" },
  });

  // 算每個 tour 的 booked count
  const ids = tours.map((t) => t.id);
  const bookings = await prisma.booking.groupBy({
    by: ["refId"],
    where: { refId: { in: ids }, type: "tour", status: { not: "cancelled_by_user" } },
    _sum: { participants: true },
  });
  const bookedMap = new Map(bookings.map((b) => [b.refId, b._sum.participants ?? 0]));

  return NextResponse.json({
    tours: tours.map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      dateStart: t.dateStart.toISOString().slice(0, 10),
      dateEnd: t.dateEnd.toISOString().slice(0, 10),
      basePrice: t.basePrice,
      deposit: t.deposit,
      capacity: t.capacity,
      booked: bookedMap.get(t.id) ?? 0,
      available: t.capacity - (bookedMap.get(t.id) ?? 0),
      status: t.status,
    })),
  });
}
