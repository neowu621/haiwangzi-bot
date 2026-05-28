import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { presignGetUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payment-proofs?bookingId=xxx
 *   列出該訂單的所有付款憑證 + 每張的 presigned GET URL (10 分鐘有效)
 *
 * GET /api/admin/payment-proofs?status=pending
 *   列出全系統「未審核」的憑證（dashboard / 提醒用）
 */
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId");
  const filterStatus = url.searchParams.get("status"); // "pending" | "verified" | undefined

  try {
    const proofs = await prisma.paymentProof.findMany({
      where: {
        ...(bookingId ? { bookingId } : {}),
        ...(filterStatus === "pending" ? { verifiedAt: null } : {}),
        ...(filterStatus === "verified" ? { verifiedAt: { not: null } } : {}),
      },
      orderBy: { uploadedAt: "desc" },
      take: 200,
      include: {
        booking: {
          select: {
            id: true,
            code: true,
            userId: true,
            totalAmount: true,
            paidAmount: true,
            paymentStatus: true,
            user: { select: { displayName: true, realName: true, phone: true } },
          },
        },
      },
    });

    // 為每張憑證生 presigned URL
    const withUrls = await Promise.all(
      proofs.map(async (p) => {
        let previewUrl: string | null = null;
        try {
          previewUrl = await presignGetUrl("payments", p.imageKey, 600);
        } catch (e) {
          console.error("[presign payment proof]", e);
        }
        return {
          id: p.id,
          bookingId: p.bookingId,
          type: p.type,
          amount: p.amount,
          imageKey: p.imageKey,
          previewUrl,
          uploadedAt: p.uploadedAt,
          verifiedAt: p.verifiedAt,
          verifiedBy: p.verifiedBy,
          booking: p.booking,
        };
      }),
    );

    return NextResponse.json({ proofs: withUrls });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[GET /admin/payment-proofs]", e);
    return NextResponse.json(
      { error: `付款憑證查詢失敗：${msg}` },
      { status: 500 },
    );
  }
}
