import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/media-posts
 *   公開端點（無需登入），給 LIFF /liff/community 取「最新動態」列表
 *   只回 visible=true，按 pinned + publishedAt 倒序，取前 20 筆
 */
export async function GET() {
  try {
    const posts = await prisma.mediaPost.findMany({
      where: { visible: true },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        source: true,
        title: true,
        description: true,
        imageUrl: true,
        linkUrl: true,
        publishedAt: true,
        pinned: true,
      },
    });
    return NextResponse.json({ posts });
  } catch {
    // table 不存在等狀況靜默回空陣列（不影響 LIFF 主流程）
    return NextResponse.json({ posts: [] });
  }
}
