import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadSignatureFromDataUrl } from "@/lib/signature";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BodySchema = z.object({
  token: z.string().min(1),
  signatureDataUrl: z.string().startsWith("data:image/"),
});

// POST /api/pay/[id]/sign — 客製訂單：客戶閱讀合約後簽署（公開、token 保護，無需 LINE 登入）
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // id + token 同時 match，避免列舉
  const booking = await prisma.booking.findFirst({
    where: { id, payLinkToken: body.token, type: "custom" },
    select: { id: true, signedAt: true, status: true },
  });
  if (!booking) return NextResponse.json({ error: "連結無效或非客製訂單" }, { status: 404 });
  if (booking.signedAt) return NextResponse.json({ ok: true, alreadySigned: true });
  if (booking.status?.startsWith("cancelled")) return NextResponse.json({ error: "訂單已取消" }, { status: 400 });

  const up = await uploadSignatureFromDataUrl(body.signatureDataUrl, booking.id);
  if (!up.ok || !up.key) {
    return NextResponse.json({ error: "簽名上傳失敗，請重試", detail: up.reason }, { status: 500 });
  }
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      signatureImageKey: up.key,
      signedAt: new Date(),
      signedFromUserAgent: req.headers.get("user-agent") ?? null,
      agreedToTermsAt: new Date(),
    },
  });
  void logAudit({
    action: "custom_order.sign",
    targetType: "booking",
    targetId: booking.id,
    targetLabel: "客戶簽署客製訂單合約",
  });
  return NextResponse.json({ ok: true });
}
