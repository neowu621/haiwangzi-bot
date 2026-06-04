import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authAdminOrCron } from "@/lib/admin-or-cron-auth";
import { generatePayLinkToken } from "@/lib/pay-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/backfill-pay-link-tokens
 *   一次性：給 v296 之前建立、payLinkToken 為 null 的訂單補上 token。
 *   不處理已 fully_paid / refunded / cancelled 的訂單（沒人會用了）。
 */
export async function POST(req: NextRequest) {
  const a = await authAdminOrCron(req);
  if (!a.ok) return a.res;

  const targets = await prisma.booking.findMany({
    where: {
      payLinkToken: null,
      status: { notIn: ["completed", "cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid", "no_show"] },
      paymentStatus: { notIn: ["fully_paid", "refunded"] },
    },
    select: { id: true },
  });

  let ok = 0;
  const errors: string[] = [];
  for (const b of targets) {
    try {
      await prisma.booking.update({
        where: { id: b.id },
        data: { payLinkToken: generatePayLinkToken() },
      });
      ok++;
    } catch (e) {
      errors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: targets.length,
    backfilled: ok,
    failed: errors.length,
    errors: errors.slice(0, 10),
  });
}
