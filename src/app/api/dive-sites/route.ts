// v318：公開取得所有潛點清單（給願望單填表用）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sites = await prisma.diveSite.findMany({
    select: { id: true, name: true, region: true },
    orderBy: { region: "asc" },
  });
  return NextResponse.json({ sites });
}
