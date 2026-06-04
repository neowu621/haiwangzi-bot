// v305：補正「訂單不成立 (cancelled_unpaid) 但已付款」的資料不一致
//   情境：v305 之前 客戶 DELETE 時 paidAmount=0 → 寫 cancelled_unpaid，
//        之後 admin 又核可了未審 proof → paidAmount > 0，但 status 還是 cancelled_unpaid
//   修法：cancelled_unpaid + paidAmount > 0 → 改為 cancelled_by_user（語意正確）
//        錢已收，admin 之後可決定是否退款
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";

  // 找出 cancelled_unpaid 但其實有付款的訂單
  const targets = await prisma.booking.findMany({
    where: {
      status: "cancelled_unpaid",
      paidAmount: { gt: 0 },
    },
    select: { id: true, code: true, paidAmount: true, totalAmount: true, paymentStatus: true },
  });

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      count: targets.length,
      sample: targets.slice(0, 20).map((b) => ({
        id: b.id,
        code: b.code,
        paid: b.paidAmount,
        total: b.totalAmount,
        paymentStatus: b.paymentStatus,
      })),
    });
  }

  let ok = 0;
  let fail = 0;
  const errors: string[] = [];
  for (const b of targets) {
    try {
      await prisma.booking.update({
        where: { id: b.id },
        data: {
          status: "cancelled_by_user",
          cancellationReason: "v305 補正：已付款的取消訂單應為 cancelled_by_user",
        },
      });
      try {
        await prisma.bookingStatusLog.create({
          data: {
            bookingId: b.id,
            fromStatus: "cancelled_unpaid",
            toStatus: "cancelled_by_user",
            actorId: null,
            actorRole: "system",
            note: `v305 補正：訂單已付 NT$${b.paidAmount} 但 status=cancelled_unpaid → 改為 cancelled_by_user`,
          },
        });
      } catch {
        /* log 表不存在或失敗，忽略 */
      }
      ok++;
    } catch (e) {
      fail++;
      errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    fixed: ok,
    failed: fail,
    errors: errors.slice(0, 10),
  });
}
