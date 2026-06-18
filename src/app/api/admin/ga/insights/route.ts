// v580：GET /api/admin/ga/insights（Bearer admin）→ 回 GA 連線狀態 + 近 30 天數據。
//   未連接 → { connected:false }；連了但沒資源 ID → { connected:true, needProperty:true }。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getGaInsights } from "@/lib/google-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const conn = await prisma.googleOAuth.findUnique({ where: { provider: "ga" } });
  if (!conn) return NextResponse.json({ connected: false });
  if (!conn.propertyId) return NextResponse.json({ connected: true, needProperty: true });

  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const insights = await getGaInsights(conn.refreshToken, conn.propertyId, { force });
    return NextResponse.json({ connected: true, propertyId: conn.propertyId, insights });
  } catch (e) {
    return NextResponse.json(
      { connected: true, error: e instanceof Error ? e.message : "讀取 GA 失敗" },
      { status: 502 },
    );
  }
}
