// v592：客戶端取「目前公開、生效中」的優惠檔（給下單提示 + 進入彈窗）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const now = new Date();
  const rows = await prisma.promoCode.findMany({
    where: { enabled: true, isPublic: true, startAt: { lte: now }, endAt: { gte: now } },
    orderBy: { endAt: "asc" },
    select: { code: true, title: true, discountType: true, discountValue: true, endAt: true, appliesTo: true, audienceTag: true, minAmount: true },
  });
  const vip = auth.user.vipLevel ?? 0;
  const items = rows
    .filter((r) => !(r.audienceTag === "vip5" && vip < 5)) // 鎖客群的檔不夠資格就不顯示
    .map((r) => ({
      code: r.code,
      title: r.title,
      discountType: r.discountType,
      discountValue: r.discountValue,
      endAt: r.endAt,
      appliesTo: r.appliesTo,
      minAmount: r.minAmount,
      label: r.discountType === "per_tank" ? `每支氣瓶 −$${r.discountValue}` : `訂單 −${r.discountValue}%`,
    }));
  return NextResponse.json({ items });
}
