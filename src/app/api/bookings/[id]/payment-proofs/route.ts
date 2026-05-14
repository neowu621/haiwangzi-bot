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

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // 防止 client 上傳金額超過 booking 應付金額（避免「假裝多付」干擾 admin）
  const remaining = booking.totalAmount - booking.paidAmount;
  if (data.amount > remaining + 100) {
    // 給 100 NT$ 容差（避免四捨五入問題）
    return NextResponse.json(
      {
        error: `上傳金額 ${data.amount} 超過應付餘額 ${remaining}`,
        hint: "若實際多付，請聯絡客服處理",
      },
      { status: 400 },
    );
  }

  // 寫入 imageKey 欄位。優先用 r2Key，fallback 用 base64 data URL。
  const imageKey = data.r2Key ?? data.imageDataUrl!;

  let proof;
  try {
    proof = await prisma.paymentProof.create({
      data: {
        bookingId: id,
        type: data.type,
        amount: data.amount,
        imageKey,
      },
    });
  } catch (e) {
    console.error("[POST payment-proofs]", e);
    return NextResponse.json(
      { error: "create failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

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
