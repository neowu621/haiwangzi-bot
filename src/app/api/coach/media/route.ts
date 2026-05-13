import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { publicUrl } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  tripId: z.string().uuid().nullable().optional(),
  date: z.string(), // YYYY-MM-DD
  platform: z.enum(["fb", "ig", "yt", "tiktok", "other"]),
  url: z.string().url(),
  thumbnailKey: z.string().nullable().optional(),
  caption: z.string().max(200).optional(),
});

// GET /api/coach/media - 教練看自己上傳的 (admin 看全部)
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const items = await prisma.tripMedia.findMany({
    where:
      auth.user.role === "admin"
        ? {}
        : { createdBy: auth.user.lineUserId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100,
  });

  return NextResponse.json({
    items: items.map((m) => ({
      ...m,
      thumbnail: m.thumbnailKey ? publicUrl(m.thumbnailKey) : null,
    })),
  });
}

// POST /api/coach/media - 教練新增動態
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = CreateSchema.parse(await req.json());
  const m = await prisma.tripMedia.create({
    data: {
      tripId: data.tripId ?? null,
      date: new Date(data.date),
      platform: data.platform,
      url: data.url,
      thumbnailKey: data.thumbnailKey ?? null,
      caption: data.caption ?? null,
      createdBy: auth.user.lineUserId,
    },
  });
  return NextResponse.json({ ok: true, item: m });
}
