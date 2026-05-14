import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/coach/trip-photos
//   coach/admin 上傳場次當日照片
//   body: { tripId, r2Key, caption? }
//   - r2Key 需先透過 /api/uploads/presign (prefix=trips) 上傳
//   - 自動設 expiresAt = now + 7 天
const BodySchema = z.object({
  tripId: z.string().uuid(),
  r2Key: z.string().min(1).max(255),
  caption: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  const data = parsed.data;

  // 確認 trip 存在
  const trip = await prisma.divingTrip.findUnique({ where: { id: data.tripId } });
  if (!trip)
    return NextResponse.json({ error: "trip not found" }, { status: 404 });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  try {
    const photo = await prisma.tripPhoto.create({
      data: {
        tripId: data.tripId,
        r2Key: data.r2Key,
        caption: data.caption,
        uploadedBy: auth.user.lineUserId,
        expiresAt,
      },
    });
    return NextResponse.json({ ok: true, photo });
  } catch (e) {
    console.error("[POST trip-photos]", e);
    return NextResponse.json(
      { error: "create failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
