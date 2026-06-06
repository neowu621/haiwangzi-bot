// v318：公開取得所有潛點清單（給願望單填表用）
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PUBLIC_STATIC_CACHE_HEADERS } from "@/lib/http-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sites = await prisma.diveSite.findMany({
    select: { id: true, name: true, region: true },
    orderBy: { region: "asc" },
  });
  return NextResponse.json({ sites }, { headers: PUBLIC_STATIC_CACHE_HEADERS });
}
