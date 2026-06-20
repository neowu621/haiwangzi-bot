import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { deleteObject, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/cleanup-old-payment-proofs
 *
 * 每天跑（建議 03:00 Asia/Taipei）。
 *
 * v271 規則（取代 v238）：
 *   - 已核可（verifiedAt 不為 null）→ **永久保留**（法律證據 / 退款舉證 / 國稅查帳）
 *   - 未核可（verifiedAt = null）且 uploadedAt > 30 天 → 清圖 + 標 imageKey=null
 *     （這類通常是客戶上傳錯了沒人理、或重複上傳）
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // v271：只清未核可 + 超過 30 天的 zombie proofs
  const candidates = await prisma.paymentProof.findMany({
    where: {
      verifiedAt: null,                        // 未核可
      uploadedAt: { lt: thirtyDaysAgo },       // 上傳超過 30 天
      imageKey: { not: null },
      NOT: { imageKey: "" },
    },
    select: { id: true, imageKey: true, bookingId: true },
    take: 1000,
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      cleaned: 0,
      rule: "v271：未核可且 uploadedAt > 30 天才清；已核可永久保留",
    });
  }

  let cleaned = 0;
  let failed = 0;

  for (const p of candidates) {
    try {
      // 只有 R2 key（非 base64 data URL）才刪 R2 物件
      const isR2Key = p.imageKey && !p.imageKey.startsWith("data:");
      if (isR2Key && r2Configured()) {
        await deleteObject("payments", p.imageKey!);
      }
      await prisma.paymentProof.update({
        where: { id: p.id },
        data: { imageKey: null },
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
    candidates: candidates.length,
    rule: "v271：未核可且 uploadedAt > 30 天；已核可永久保留",
  });
}
