// v592：客戶端驗證優惠代碼 + 回折扣預覽。POST { code, type, orderAmount, totalTanks }。
import { NextRequest, NextResponse } from "next/server";
import { authFromRequest } from "@/lib/auth";
import { validatePromoCode, computeCodeDiscount } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    code?: string; type?: "daily" | "tour"; orderAmount?: number; totalTanks?: number;
  };
  const vr = await validatePromoCode(String(body.code ?? ""), {
    type: body.type ?? "daily",
    orderAmount: Number(body.orderAmount ?? 0),
    userId: auth.user.lineUserId,
    userVipLevel: auth.user.vipLevel ?? 0,
  });
  if (!vr.ok || !vr.promo) return NextResponse.json({ ok: false, reason: vr.reason ?? "優惠代碼無效" });

  const discount = computeCodeDiscount(
    { discountType: vr.promo.discountType, discountValue: vr.promo.discountValue, minAmount: vr.promo.minAmount },
    { orderAmount: Number(body.orderAmount ?? 0), totalTanks: Number(body.totalTanks ?? 0) },
  );
  const label = vr.promo.discountType === "per_tank"
    ? `每支氣瓶 −$${vr.promo.discountValue}`
    : `訂單 −${vr.promo.discountValue}%`;
  return NextResponse.json({ ok: true, code: vr.promo.code, title: vr.promo.title, discountType: vr.promo.discountType, discountValue: vr.promo.discountValue, discount, label });
}
