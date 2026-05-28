import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/payment-proofs/[id]/reject
 *   拒絕付款憑證（金額不對 / 圖片看不清 / 詐騙 etc.）
 *   - 刪除這筆 PaymentProof（含 imageKey 也會在 30-day 清理 cron 由 R2 刪掉）
 *   - booking 不變（客戶可重新上傳）
 *   - 寫 AuditLog 留下原因紀錄
 *   - 可選：寄通知給客戶
 *
 *   權限：admin + boss
 */
const Body = z.object({
  reason: z.string().min(1, "請填寫拒絕原因"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const proof = await prisma.paymentProof.findUnique({
    where: { id },
    include: { booking: { select: { code: true, id: true } } },
  });
  if (!proof)
    return NextResponse.json({ error: "proof not found" }, { status: 404 });
  if (proof.verifiedAt) {
    return NextResponse.json(
      { error: "已審核通過的憑證無法拒絕，請改用退款流程" },
      { status: 400 },
    );
  }

  try {
    await prisma.paymentProof.delete({ where: { id } });
    await logAudit({
      actorId: auth.user.lineUserId,
      action: "payment_proof.reject",
      targetType: "payment_proof",
      targetId: id,
      targetLabel: proof.booking.code ?? proof.booking.id.slice(0, 8),
      metadata: {
        bookingId: proof.bookingId,
        amount: proof.amount,
        reason: parsed.data.reason,
      },
    });
    return NextResponse.json({ ok: true, rejected: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST reject payment proof]", e);
    return NextResponse.json(
      { error: `拒絕失敗：${msg}` },
      { status: 500 },
    );
  }
}
