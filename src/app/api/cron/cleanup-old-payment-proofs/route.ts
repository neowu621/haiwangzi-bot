import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/cleanup-old-payment-proofs
 *
 * 每天跑（建議 03:00 Asia/Taipei）。
 *
 * 清理 30 天前已審核通過的付款憑證 R2 物件，DB 紀錄保留以便查帳。
 * 規則：
 *   - uploadedAt < now - 30 days
 *   - verifiedAt IS NOT NULL（拒絕的會在拒絕時就刪掉，這裡只處理已核的）
 *   - imageKey 存在
 * 動作：
 *   - 從 R2 payments/ bucket 刪除實體檔
 *   - 更新 PaymentProof.imageKey 設為空字串（標示已清理）
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!r2Configured()) {
    return NextResponse.json({
      ok: true,
      cleaned: 0,
      note: "R2 not configured, skipping cleanup",
    });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const oldProofs = await prisma.paymentProof.findMany({
    where: {
      uploadedAt: { lt: cutoff },
      verifiedAt: { not: null },
      imageKey: { not: "" },
    },
    select: { id: true, imageKey: true },
    take: 500,
  });

  if (oldProofs.length === 0) {
    return NextResponse.json({ ok: true, cleaned: 0 });
  }

  let cleaned = 0;
  let failed = 0;

  for (const p of oldProofs) {
    try {
      await deleteObject("payments", p.imageKey);
      await prisma.paymentProof.update({
        where: { id: p.id },
        data: { imageKey: "" },
      });
      cleaned += 1;
    } catch (e) {
      console.error(`[cleanup-proofs] failed ${p.id}`, e);
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    cleaned,
    failed,
    candidates: oldProofs.length,
    cutoff: cutoff.toISOString(),
  });
}
