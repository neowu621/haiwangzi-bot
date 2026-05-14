import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";
import { publicUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/trips/[id]/photos
//   回傳該場次當日照片清單
//   權限：必須是該場次的有效 booking 持有人（非取消狀態），coach/admin 也可看
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const { id: tripId } = await params;

  // 權限檢查
  const isStaff =
    auth.user.role === "admin" || auth.user.role === "coach" ||
    (auth.user.roles ?? []).some((r) => r === "admin" || r === "coach");
  let allowed = isStaff;
  if (!allowed) {
    const hasBooking = await prisma.booking.findFirst({
      where: {
        userId: auth.user.lineUserId,
        type: "daily",
        refId: tripId,
        status: { notIn: ["cancelled_by_user", "cancelled_by_weather"] },
      },
    });
    allowed = !!hasBooking;
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "not allowed (沒有預約這個場次)" },
      { status: 403 },
    );
  }

  // 只回未過期的照片
  const now = new Date();
  const photos = await prisma.tripPhoto.findMany({
    where: { tripId, expiresAt: { gt: now } },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      url: publicUrl(p.r2Key),
      r2Key: p.r2Key,
      caption: p.caption,
      uploadedAt: p.uploadedAt,
      expiresAt: p.expiresAt,
      daysLeft: Math.ceil(
        (p.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      ),
    })),
  });
}
