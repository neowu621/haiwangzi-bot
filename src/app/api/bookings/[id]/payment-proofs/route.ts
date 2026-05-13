import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { publicUrl, isPrivate, type R2Prefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 兩種輸入皆受支援：
//  - r2Key   (推薦：client 透過 /api/uploads/presign 拿 URL 直傳 R2)
//  - imageDataUrl (legacy fallback：base64 data URL，本機 dev 沒 R2 也能跑)
const BodySchema = z.object({
  type: z.enum(["deposit", "final", "refund"]),
  amount: z.number().int().min(1),
  r2Key: z.string().min(1).optional(),
  imageDataUrl: z.string().min(20).optional(),
  last5: z.string().max(8).optional(),
}).refine((d) => d.r2Key || d.imageDataUrl, {
  message: "需提供 r2Key 或 imageDataUrl",
});

// POST /api/bookings/:id/payment-proofs
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { id } = await ctx.params;

  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking)
    return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (booking.userId !== auth.user.lineUserId) {
    return NextResponse.json({ error: "not your booking" }, { status: 403 });
  }

  const data = BodySchema.parse(await req.json());

  // 寫入 imageKey 欄位。優先用 r2Key，fallback 用 base64 data URL。
  const imageKey = data.r2Key ?? data.imageDataUrl!;

  const proof = await prisma.paymentProof.create({
    data: {
      bookingId: id,
      type: data.type,
      amount: data.amount,
      imageKey,
    },
  });

  // 若 booking 是 tour 類型，重新計算 paidAmount = sum(deposit/final 驗證過的)
  // 此處先不在客戶上傳時自動標 paid，等教練「滑動確認」才更新

  // 只在 R2 key 屬於公開 bucket prefix 才回 publicUrl；
  // private prefix (payments/...) 的應該走 /api/uploads/preview presigned GET
  let pubUrl: string | null = null;
  if (data.r2Key) {
    const prefix = data.r2Key.split("/")[0] as R2Prefix;
    pubUrl = isPrivate(prefix) ? null : publicUrl(data.r2Key);
  }

  return NextResponse.json({
    ok: true,
    proof: {
      id: proof.id,
      type: proof.type,
      amount: proof.amount,
      publicUrl: pubUrl,
      uploadedAt: proof.uploadedAt,
    },
  });
}
