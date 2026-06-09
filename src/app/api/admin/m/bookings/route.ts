import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { authFromRequest, requireRole } from "@/lib/auth";
import { deriveBookingDisplay } from "@/lib/booking-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/m/bookings?q=&status=&limit=20&cursor=
//
// 手機簡版後台「訂單快查」專用輕量端點。
//   q      — 搜尋客戶姓名（displayName / realName）或訂單 code
//   status — DB BookingStatus（pending / awaiting_verify / confirmed / completed
//            / cancelled_by_user / cancelled_by_weather / cancelled_unpaid / no_show）
//   limit  — 預設 20、上限 50
//   cursor — 上一頁最後一筆 id（id 游標分頁，搭配 createdAt desc 穩定排序）
//
// 每筆只回：{ id, code, customerName, status, statusLabel, amount, date, title }
//   不回名單 / 截圖 / 簽名 / 電話。完整細節請走 /admin/bookings。
type MBooking = {
  id: string;
  code: string | null;
  customerName: string;
  status: string;
  statusLabel: string;
  amount: number;
  date: string | null; // 活動日 YYYY-MM-DD（日潛=trip.date / 潛旅=dateStart）
  title: string; // 日潛=潛點 / 潛旅=團名
};

const ALLOWED_STATUS = new Set([
  "pending",
  "awaiting_verify",
  "confirmed",
  "cancelled_by_user",
  "cancelled_by_weather",
  "cancelled_unpaid",
  "completed",
  "no_show",
]);

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = url.searchParams.get("status") ?? "";
    const cursor = url.searchParams.get("cursor") ?? "";
    const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 50);

    const and: Prisma.BookingWhereInput[] = [];
    if (status && ALLOWED_STATUS.has(status)) {
      and.push({ status: status as Prisma.BookingWhereInput["status"] });
    }
    if (q) {
      and.push({
        OR: [
          { code: { contains: q, mode: "insensitive" } },
          { user: { is: { displayName: { contains: q, mode: "insensitive" } } } },
          { user: { is: { realName: { contains: q, mode: "insensitive" } } } },
        ],
      });
    }
    const where: Prisma.BookingWhereInput = and.length ? { AND: and } : {};

    // 多撈 1 筆判斷是否還有下一頁（id 游標分頁）
    const rows = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        code: true,
        type: true,
        refId: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        createdAt: true,
        user: { select: { realName: true, displayName: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // 補活動日 + 標題（只撈這頁需要的 trip / tour，輕量）
    const dailyIds = page.filter((b) => b.type === "daily").map((b) => b.refId);
    const tourIds = page.filter((b) => b.type === "tour").map((b) => b.refId);
    const [trips, tours] = await Promise.all([
      dailyIds.length === 0
        ? Promise.resolve([])
        : prisma.divingTrip.findMany({
            where: { id: { in: dailyIds } },
            select: { id: true, date: true, diveSiteIds: true },
          }),
      tourIds.length === 0
        ? Promise.resolve([])
        : prisma.tourPackage.findMany({
            where: { id: { in: tourIds } },
            select: { id: true, title: true, dateStart: true },
          }),
    ]);
    const tripMap = new Map(trips.map((t) => [t.id, t]));
    const tourMap = new Map(tours.map((t) => [t.id, t]));

    // dive site 名稱（找不到用 id 本身）
    const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
    const sites = siteIds.length === 0
      ? []
      : await prisma.diveSite.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } });
    const siteMap = new Map(sites.map((s) => [s.id, s.name]));

    const items: MBooking[] = page.map((b) => {
      let date: string | null = null;
      let title = "";
      if (b.type === "daily") {
        const t = tripMap.get(b.refId);
        if (t) {
          date = t.date.toISOString().slice(0, 10);
          title = t.diveSiteIds.map((id) => siteMap.get(id) ?? id).join("、") || "日潛";
        } else {
          title = "日潛";
        }
      } else {
        const t = tourMap.get(b.refId);
        if (t) {
          date = t.dateStart.toISOString().slice(0, 10);
          title = t.title;
        } else {
          title = "潛水團";
        }
      }
      const display = deriveBookingDisplay({
        status: b.status,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt,
        activityDate: date,
      });
      return {
        id: b.id,
        code: b.code,
        customerName: b.user.realName ?? b.user.displayName,
        status: b.status,
        statusLabel: display.label,
        amount: b.totalAmount,
        date,
        title,
      };
    });

    return NextResponse.json({
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/m/bookings] error:", msg, e);
    return NextResponse.json({ error: `訂單載入失敗：${msg}` }, { status: 500 });
  }
}
