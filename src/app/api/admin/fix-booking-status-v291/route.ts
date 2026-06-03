import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/fix-booking-status-v291
 * 一次性修正：把舊資料的 booking.status 重新計算到「正確的當前狀態」
 *
 * v289 前日潛 hardcode 成 confirmed → 現在拿掉現場現金後應該 pending → awaiting_verify → confirmed
 *
 * 規則（不會動 daily / tour 任何已完結的）：
 *   1. 已完結（completed / no_show / cancelled_*）→ 不動
 *   2. 已付清（paymentStatus=fully_paid 或 paidAmount>=totalAmount）→ confirmed
 *   3. tour 訂金已付（paymentStatus=deposit_paid）→ confirmed
 *   4. 有未審核的 payment_proof → awaiting_verify
 *   5. 都沒有 → pending
 *
 * 加 ?dryRun=1 query 只顯示報告不更新。
 */
const TERMINAL = [
  "completed",
  "no_show",
  "cancelled_by_user",
  "cancelled_by_weather",
  "cancelled_unpaid",
];

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  const bookings = await prisma.booking.findMany({
    where: { status: { notIn: TERMINAL as never } },
    include: { paymentProofs: { select: { verifiedAt: true } } },
  });

  const changes: Array<{
    id: string;
    type: string;
    from: string;
    to: string;
    paid: number;
    total: number;
    paymentStatus: string;
    note: string;
  }> = [];

  for (const b of bookings) {
    let target: string = b.status;
    let note = "";

    if (
      b.paymentStatus === "fully_paid" ||
      (b.paidAmount >= b.totalAmount && b.totalAmount > 0)
    ) {
      target = "confirmed";
      note = "fully_paid";
    } else if (b.type === "tour" && b.paymentStatus === "deposit_paid") {
      target = "confirmed";
      note = "deposit_paid";
    } else if (b.paymentProofs.some((p) => p.verifiedAt == null)) {
      target = "awaiting_verify";
      note = "has unverified proof";
    } else {
      target = "pending";
      note = "no payment yet";
    }

    if (target !== b.status) {
      changes.push({
        id: b.id,
        type: b.type,
        from: b.status,
        to: target,
        paid: b.paidAmount,
        total: b.totalAmount,
        paymentStatus: b.paymentStatus,
        note,
      });
    }
  }

  // 統計
  const byTransition: Record<string, number> = {};
  for (const c of changes) {
    const k = `${c.type}: ${c.from} → ${c.to}`;
    byTransition[k] = (byTransition[k] ?? 0) + 1;
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      scanned: bookings.length,
      wouldUpdate: changes.length,
      transitions: byTransition,
      sample: changes.slice(0, 30),
    });
  }

  // 實際更新
  let ok = 0;
  const errors: string[] = [];
  for (const c of changes) {
    try {
      await prisma.booking.update({
        where: { id: c.id },
        data: { status: c.to as never },
      });
      try {
        await prisma.bookingStatusLog.create({
          data: {
            bookingId: c.id,
            fromStatus: c.from,
            toStatus: c.to,
            actorId: null,
            actorRole: "system",
            note: `v291 補正：${c.note}`,
          },
        });
      } catch {
        /* log 表可能 schema 不同，忽略 */
      }
      ok++;
    } catch (e) {
      errors.push(
        `${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: bookings.length,
    updated: ok,
    failed: errors.length,
    errors: errors.slice(0, 10),
    transitions: byTransition,
  });
}
