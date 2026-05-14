import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { deleteObject } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/coach/trip-photos/[id]
//   coach/admin 可刪除自己/任何 trip photo
//   會把 R2 物件也刪掉
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const photo = await prisma.tripPhoto.findUnique({ where: { id } });
  if (!photo)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    // 嘗試刪 R2 物件（失敗不擋 DB 刪除）
    await deleteObject("trips", photo.r2Key).catch((e) =>
      console.warn("[DELETE trip-photo R2]", e),
    );
    await prisma.tripPhoto.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE trip-photo]", e);
    return NextResponse.json(
      { error: "delete failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
