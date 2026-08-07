// v1042：校正「海王子累積潛水次數」(User.haiwangziLogCount)。
//
//   為什麼需要：這個數字是「標到場時累加」出來的，不是每次即時重算。
//   在 v1042 補上冪等保護之前，同一筆訂單被重複標到場（例如老闆結帳與到場點名各按一次）
//   就會重複累加；改判未到場也不會扣回。久了就會跟實際氣瓶支數對不上。
//
//   正確值 = 所有 status=completed 的訂單加總：
//     日潛 → (booking.tankCount ?? trip.tankCount ?? 1) × participants   ← 與到場端同一條公式
//     潛旅 → participants
//
//   GET  → 只比對，回「誰對不上、差多少」，不寫任何資料
//   POST → 把清單裡的人改成正確值（可帶 userIds 只修特定幾位）
//
//   注意：這個欄位後台可以手動調整（補登舊資料）。所以一律先看 GET 的差異清單再決定套用，
//        不要無腦全表覆蓋。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function computeExpected() {
  const bookings = await prisma.booking.findMany({
    where: { status: "completed" },
    select: { userId: true, type: true, refId: true, participants: true, tankCount: true },
  });
  const tripIds = Array.from(new Set(bookings.filter((b) => b.type === "daily").map((b) => b.refId)));
  const trips = tripIds.length
    ? await prisma.divingTrip.findMany({ where: { id: { in: tripIds } }, select: { id: true, tankCount: true } })
    : [];
  const tripTank = new Map(trips.map((t) => [t.id, t.tankCount]));

  const expected = new Map<string, number>();
  for (const b of bookings) {
    const add = b.type === "daily"
      ? (b.tankCount ?? tripTank.get(b.refId) ?? 1) * b.participants
      : b.participants; // 潛旅：每人算 1 趟（與到場端一致）
    expected.set(b.userId, (expected.get(b.userId) ?? 0) + add);
  }
  return expected;
}

async function buildDiff() {
  const expected = await computeExpected();
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { lineUserId: true, displayName: true, realName: true, nickname: true, haiwangziLogCount: true, vipLevel: true },
  });
  return users
    .map((u) => {
      const exp = expected.get(u.lineUserId) ?? 0;
      const cur = u.haiwangziLogCount ?? 0;
      return {
        userId: u.lineUserId,
        name: `${(u.nickname ?? "").trim() || "?"}（${u.realName ?? u.displayName}）`,
        current: cur,
        expected: exp,
        diff: exp - cur,
        vipLevel: u.vipLevel ?? 1,
      };
    })
    .filter((r) => r.diff !== 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const rows = await buildDiff();
  return NextResponse.json({
    mismatched: rows.length,
    overCounted: rows.filter((r) => r.diff < 0).length,  // 目前記太多
    underCounted: rows.filter((r) => r.diff > 0).length, // 目前記太少
    rows,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  let only: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.userIds) && body.userIds.length > 0) only = body.userIds as string[];
  } catch { /* 沒帶 body = 全部套用 */ }

  const rows = (await buildDiff()).filter((r) => !only || only.includes(r.userId));
  for (const r of rows) {
    await prisma.user.update({
      where: { lineUserId: r.userId },
      data: { haiwangziLogCount: r.expected },
    });
  }

  // 留下軌跡：這是會改動 VIP 判定基準的資料修正，要查得到是誰在什麼時候按的
  await prisma.auditLog.create({
    data: {
      actorId: auth.user.lineUserId,
      actorName: auth.user.realName ?? auth.user.displayName,
      actorRole: "admin",
      action: "admin.dives.recount",
      targetType: "user",
      targetLabel: `校正 ${rows.length} 位會員的潛水次數`,
      metadata: { changes: rows.map((r) => ({ userId: r.userId, name: r.name, from: r.current, to: r.expected })) },
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, updated: rows.length, rows });
}
