import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reset-data/orphans
 * 清掉「父紀錄已被刪除」的孤兒資料（目前只處理 PaymentProof）。
 * 與完整 reset-data 不同，不會動到任何還有效的訂單/場次。
 *
 * Body: { confirm: "CLEAN ORPHANS" }
 */
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.confirm !== "CLEAN ORPHANS") {
    return NextResponse.json(
      { error: "confirm 字串不符，請傳入 { confirm: 'CLEAN ORPHANS' }" },
      { status: 400 },
    );
  }

  // 用 raw SQL 刪除孤兒 PaymentProof（其 bookingId 不存在於 bookings 表）
  const result = await prisma.$executeRaw`
    DELETE FROM payment_proofs
    WHERE booking_id NOT IN (SELECT id FROM bookings)
  `;

  await logAudit({
    actorId: auth.lineUserId,
    actorName: auth.user.displayName,
    action: "data.clean_orphans",
    targetType: "system",
    targetId: "payment_proofs",
    targetLabel: "清理孤兒付款憑證",
    metadata: { orphansDeleted: result },
  });

  return NextResponse.json({
    ok: true,
    deleted: { orphanPaymentProofs: result },
  });
}
