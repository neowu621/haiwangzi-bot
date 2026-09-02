import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/stats/lite
//
// 手機簡版後台（/admin/m）專用「輕量 badge 端點」。
// 只回 6 張卡需要的數字，全部用 count / groupBy._sum，**不 include user、不回名單/截圖**。
// 回傳 < 1KB，目的：手機 / 高延遲環境秒開。完整 dashboard 請打 /api/admin/stats。
//
// 對照（與完整 stats 一致的語意）：
//   tonight.proofs     — 待確認匯款（pending payment_proof，DISTINCT booking）
//   tonight.attendance — 待確認到場（confirmed 且場次/團日期落在昨/今天）
//   pendingProofs      — 待審付款訂單（booking.status = awaiting_verify）
//   todayTrips         — 今日場次數 + 人數
//   tomorrowTrips      — 明日場次數 + 人數
//   pendingWishes      — 待回覆願望單（dive_wish.status = pending）
//   pendingRefunds     — v1069：客戶自己申請、等老闆審的退款（refund_request.status = pending_admin）
//   overdueFinals      — v1076：潛旅尾款已逾期未繳（只算逾期，未逾期不進徽章）
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  // v306：「今天」用台北時區算 — 避免 UTC 偏移把場次算錯天
  const tw = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const now = new Date();
  const todayStr = tw(now);
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = tw(yest);
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrowStr = tw(tmr);

  // DivingTrip.date / TourPackage.dateStart 是 @db.Date（無時區），用 UTC 午夜邊界查最穩
  const todayDate = new Date(todayStr + "T00:00:00.000Z");
  const tomorrowDate = new Date(tomorrowStr + "T00:00:00.000Z");
  const dayAfterDate = new Date(todayDate);
  dayAfterDate.setUTCDate(dayAfterDate.getUTCDate() + 2);
  const yesterdayDate = new Date(yesterdayStr + "T00:00:00.000Z");

  const NOT_CANCELLED = ["cancelled_by_user", "cancelled_by_weather", "no_show"] as const;

  // 先撈「今日 / 明日」場次 id（只取 id，輕量），再 aggregate 算人數
  const [todayTripRows, tomorrowTripRows] = await Promise.all([
    prisma.divingTrip.findMany({
      where: { date: { gte: todayDate, lt: tomorrowDate }, status: { not: "cancelled" } },
      select: { id: true },
    }),
    prisma.divingTrip.findMany({
      where: { date: { gte: tomorrowDate, lt: dayAfterDate }, status: { not: "cancelled" } },
      select: { id: true },
    }),
  ]);
  const todayTripIds = todayTripRows.map((t) => t.id);
  const tomorrowTripIds = tomorrowTripRows.map((t) => t.id);

  const [
    pendingProofsResult,
    awaitingVerify,
    todayPeopleAgg,
    tomorrowPeopleAgg,
    pendingWishes,
    attendanceTrips,
    attendanceTours,
    pendingEmails,
    pendingOrders,
    pendingRefunds,
    finalCandidates,
  ] = await Promise.all([
    // 待確認匯款：未審核 + booking 仍存在（DISTINCT booking_id，與完整 stats 一致）
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT pp.booking_id)::bigint AS count
      FROM payment_proofs pp
      INNER JOIN bookings b ON pp.booking_id = b.id
      WHERE pp.verified_at IS NULL
    `,
    // 待審付款訂單數（卡片導到 /admin/bookings?status=awaiting_verify）
    prisma.booking.count({ where: { status: "awaiting_verify" } }),
    // 今日場次總人數
    todayTripIds.length === 0
      ? null
      : prisma.booking.aggregate({
          where: { type: "daily", refId: { in: todayTripIds }, status: { notIn: [...NOT_CANCELLED] } },
          _sum: { participants: true },
        }),
    // 明日場次總人數
    tomorrowTripIds.length === 0
      ? null
      : prisma.booking.aggregate({
          where: { type: "daily", refId: { in: tomorrowTripIds }, status: { notIn: [...NOT_CANCELLED] } },
          _sum: { participants: true },
        }),
    // 待回覆願望單
    prisma.diveWish.count({ where: { status: "pending" } }),
    // 待確認到場（confirmed + 昨/今日場次）— 先抓昨/今日場次/團 id
    prisma.divingTrip.findMany({
      where: { date: { gte: yesterdayDate, lt: tomorrowDate }, status: { not: "cancelled" } },
      select: { id: true },
    }),
    prisma.tourPackage.findMany({
      where: { dateStart: { gte: yesterdayDate, lt: tomorrowDate }, status: { not: "cancelled" } },
      select: { id: true },
    }),
    // v533：客服信箱待回覆數（側欄徽章用）
    prisma.emailThread.count({ where: { status: "WAITING" } }),
    // v683b：已下單·待匯款（status=pending，還沒上傳付款證明）— 老闆結帳卡片要算進去
    prisma.booking.count({ where: { status: "pending" } }),
    // v1069：客戶申請退款、等老闆決定 —— 客戶正在等回覆，是最該優先處理的待辦
    prisma.refundRequest.count({ where: { status: "pending_admin" } }),
    // v1076：潛旅尾款候選（已付訂金、還欠錢）。逾期與否在下面用 TS 算 ——
    //   期限規則是「後台填的 finalDeadline，沒填就退回出發前 30 天」，跨兩張表且有預設值，
    //   寫成 raw SQL 型別檢查不到、又沒有本機 DB 可驗；用 Prisma 撈候選再過濾比較安全。
    //   候選集本來就很小（只有在跑的團、且欠尾款的人）。
    prisma.booking.findMany({
      where: {
        type: "tour",
        status: "confirmed",
        paymentStatus: "deposit_paid",
      },
      select: { id: true, refId: true, totalAmount: true, paidAmount: true },
    }),
  ]);

  const attTripIds = attendanceTrips.map((t) => t.id);
  const attTourIds = attendanceTours.map((t) => t.id);
  const attendance =
    attTripIds.length + attTourIds.length === 0
      ? 0
      : await prisma.booking.count({
          where: {
            status: "confirmed",
            OR: [
              { type: "daily", refId: { in: attTripIds } },
              { type: "tour", refId: { in: attTourIds } },
            ],
          },
        });

  // v1076：算「尾款已逾期」筆數。
  //   ⚠️ 刻意只算逾期的 —— 把所有未繳尾款都算進徽章，只要有團在跑徽章就永遠不會歸零，
  //      老闆會學會忽略它。未逾期的仍列在「老闆處理與通知」頁上，只是不催。
  const owing = finalCandidates.filter((b) => b.totalAmount > b.paidAmount);
  let overdueFinals = 0;
  if (owing.length > 0) {
    const tourRows = await prisma.tourPackage.findMany({
      where: { id: { in: [...new Set(owing.map((b) => b.refId))] } },
      select: { id: true, dateStart: true, finalDeadline: true },
    });
    const twDate = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
    const todayTw = twDate(new Date());
    const dueByTour = new Map(
      tourRows.map((t) => {
        // 與 /api/cron/reminders 及老闆處理頁的 finalDueOf 同一套規則：
        // 有填 finalDeadline 就用它，沒填退回「出發前 30 天」
        if (t.finalDeadline) return [t.id, { due: twDate(t.finalDeadline), start: twDate(t.dateStart) }] as const;
        const d = new Date(t.dateStart);
        d.setDate(d.getDate() - 30);
        return [t.id, { due: twDate(d), start: twDate(t.dateStart) }] as const;
      }),
    );
    overdueFinals = owing.filter((b) => {
      const x = dueByTour.get(b.refId);
      // 已出發的不算（那是結案問題，不是催繳問題）
      return !!x && x.start >= todayTw && x.due < todayTw;
    }).length;
  }

  const proofs = Number(pendingProofsResult[0]?.count ?? BigInt(0));

  return NextResponse.json({
    tonight: { proofs, attendance, pendingOrders },
    pendingProofs: awaitingVerify,
    todayTrips: { count: todayTripIds.length, people: todayPeopleAgg?._sum.participants ?? 0 },
    tomorrowTrips: { count: tomorrowTripIds.length, people: tomorrowPeopleAgg?._sum.participants ?? 0 },
    pendingWishes,
    pendingEmails,
    pendingRefunds, // v1069
    overdueFinals, // v1076：尾款已逾期未繳（只算逾期）
  });
}
