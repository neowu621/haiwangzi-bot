// v779：手機 LIFF「老闆結帳／待收款」資料源（老闆專用）。
//   回「還有欠款且尚待處理」的訂單 —— status ∈ {pending, completed} 且 應付>0 且非退款/取消。
//   前端據此分三桶：待匯款 / 現場付款·逾期 / 已到場·未付清（與桌機老闆結帳一致）。
//   收款/到場動作沿用既有 /api/admin/bookings/[id]/payment-entry + /api/coach/bookings/[id]/attendance。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  // 收款是老闆權限（boss/admin/it）；教練/助教不碰款項（對齊 v756）
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["pending", "completed"] },
      paymentStatus: { notIn: ["refunded", "refunding"] },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      user: { select: { displayName: true, realName: true, phone: true } },
    },
  });

  // 只留還有欠款的
  const owedBookings = bookings.filter((b) => b.totalAmount - b.paidAmount > 0);

  // 補活動日期 + 場次/團名
  const dailyIds = owedBookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const tourIds = owedBookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [trips, tours] = await Promise.all([
    dailyIds.length
      ? prisma.divingTrip.findMany({ where: { id: { in: dailyIds } }, select: { id: true, date: true, startTime: true, diveSiteIds: true } })
      : Promise.resolve([]),
    tourIds.length
      ? prisma.tourPackage.findMany({ where: { id: { in: tourIds } }, select: { id: true, title: true, dateStart: true } })
      : Promise.resolve([]),
  ]);
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const tourMap = new Map(tours.map((t) => [t.id, t]));
  const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
  const sites = siteIds.length
    ? await prisma.diveSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
    : [];
  const siteName = new Map(sites.map((s) => [s.id, s.name]));

  const items = owedBookings.map((b) => {
    let activityDate = "";
    let label = "";
    if (b.type === "daily") {
      const t = tripMap.get(b.refId);
      if (t) {
        activityDate = t.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
        label = `${t.startTime} ${t.diveSiteIds.map((id) => siteName.get(id) ?? id).join("、")}`.trim();
      }
    } else {
      const t = tourMap.get(b.refId);
      if (t) {
        activityDate = t.dateStart.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
        label = t.title;
      }
    }
    return {
      id: b.id,
      code: b.code,
      name: b.user.realName ?? b.user.displayName,
      phone: b.user.phone,
      type: b.type,
      participants: b.participants,
      totalAmount: b.totalAmount,
      paidAmount: b.paidAmount,
      creditUsed: b.creditUsed,
      status: b.status,
      paymentMethod: b.paymentMethod,
      activityDate,
      label,
    };
  });

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  return NextResponse.json({ today: todayStr, items });
}
