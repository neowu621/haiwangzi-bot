import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { authFromRequest, requireRole, getUserRoles } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bookings - 全部訂單，含 trip/tour 的日期時間資訊
// ?userId=xxx  → 只回該 user 的訂單（用於會員管理的潛水紀錄彈窗）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  try {
    const url = new URL(req.url);
    const filterUserId = url.searchParams.get("userId") ?? undefined;
    const filterRefId = url.searchParams.get("refId") ?? undefined; // v183: 按場次 ID 過濾

    const where: Prisma.BookingWhereInput =
      filterUserId ? { userId: filterUserId }
      : filterRefId ? { refId: filterRefId }
      : {};

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filterUserId || filterRefId ? 500 : 200,
      include: { user: { select: { displayName: true, realName: true, phone: true } } },
    });

    // 撈所有相關 trip / tour，附加日期 + 時間
    const dailyIds = bookings.filter((b) => b.type === "daily").map((b) => b.refId);
    const tourIds = bookings.filter((b) => b.type === "tour").map((b) => b.refId);
    const [trips, tours] = await Promise.all([
      dailyIds.length === 0 ? Promise.resolve([]) : prisma.divingTrip.findMany({
        where: { id: { in: dailyIds } },
        select: { id: true, date: true, startTime: true, diveSiteIds: true },
      }),
      tourIds.length === 0 ? Promise.resolve([]) : prisma.tourPackage.findMany({
        where: { id: { in: tourIds } },
        select: { id: true, title: true, dateStart: true, dateEnd: true },
      }),
    ]);
    const tripMap = new Map(trips.map((t) => [t.id, t]));
    const tourMap = new Map(tours.map((t) => [t.id, t]));

    // 撈所有 dive sites
    const siteIds = Array.from(new Set(trips.flatMap((t) => t.diveSiteIds)));
    const sites = siteIds.length === 0 ? [] : await prisma.diveSite.findMany({
      where: { id: { in: siteIds } },
      select: { id: true, name: true },
    });
    const siteMap = new Map(sites.map((s) => [s.id, s.name]));

    const isAdminOrBoss = getUserRoles(auth.user).some((r) => r === "admin" || r === "boss");

    // v262：簽名圖 presigned URL（讓 admin UI 直接顯示）
    const { previewUrl, r2Configured } = await import("@/lib/r2");
    const signatureUrls = new Map<string, string>();
    if (r2Configured()) {
      await Promise.all(
        bookings.map(async (b) => {
          if (!b.signatureImageKey) return;
          try {
            const url = await previewUrl("signatures", b.signatureImageKey);
            signatureUrls.set(b.id, url);
          } catch {
            // ignore
          }
        }),
      );
    }

    return NextResponse.json({
      bookings: bookings.map((b) => {
        let ref: Record<string, unknown> = {};
        if (b.type === "daily") {
          const t = tripMap.get(b.refId);
          if (t) {
            ref = {
              date: t.date.toISOString().slice(0, 10),
              startTime: t.startTime, // "08:00" 字串，直接顯示不要走時區轉換
              // v153：找不到 DiveSite 時用 id 本身（多半就是中文名稱）
              sites: t.diveSiteIds.map((id) => siteMap.get(id) ?? id),
            };
          }
        } else {
          const t = tourMap.get(b.refId);
          if (t) {
            ref = {
              title: t.title,
              dateStart: t.dateStart.toISOString().slice(0, 10),
              dateEnd: t.dateEnd.toISOString().slice(0, 10),
            };
          }
        }
        return {
          ...b,
          // 管理備註僅 admin/boss 可見
          adminNotes: isAdminOrBoss ? b.adminNotes : undefined,
          // v262：簽名 presigned URL（10 分鐘 TTL）
          signatureImageUrl: signatureUrls.get(b.id) ?? null,
          ref,
        };
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /api/admin/bookings] error:", msg, e);
    return NextResponse.json(
      {
        error: `訂單查詢失敗：${msg}`,
        hint: "若包含 'column does not exist'，代表 DB schema 沒同步；請去 Zeabur 重新部署或檢查 docker-entrypoint logs",
      },
      { status: 500 },
    );
  }
}
