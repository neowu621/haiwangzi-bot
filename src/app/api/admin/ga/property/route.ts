// v580：GA 資源 ID 手動設定 + 中斷連線（Bearer admin）。
//   POST { propertyId }  → 存數字資源 ID（Admin API 未啟用、自動探測失敗時用）。
//   DELETE                → 移除 GA 連線（刪 refresh token）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { clearGaCache } from "@/lib/google-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return { res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return { res: NextResponse.json({ error: role.message }, { status: role.status }) };
  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;

  const body = (await req.json().catch(() => ({}))) as { propertyId?: unknown };
  const raw = String(body.propertyId ?? "").trim();
  const propertyId = raw.replace(/[^\d]/g, ""); // 只留數字（容忍貼到 "properties/123"）
  if (!propertyId) return NextResponse.json({ error: "請輸入有效的 GA4 數字資源 ID" }, { status: 400 });

  const conn = await prisma.googleOAuth.findUnique({ where: { provider: "ga" } });
  if (!conn) return NextResponse.json({ error: "尚未連接 GA，請先連接" }, { status: 400 });

  await prisma.googleOAuth.update({ where: { provider: "ga" }, data: { propertyId } });
  clearGaCache();
  return NextResponse.json({ ok: true, propertyId });
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;
  await prisma.googleOAuth.deleteMany({ where: { provider: "ga" } });
  clearGaCache();
  return NextResponse.json({ ok: true });
}
