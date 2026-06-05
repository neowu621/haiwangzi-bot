// v318：客戶建立 / 查詢 自己的願望單
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WeeklyLimit = 10;

const ImageItem = z.object({
  url: z.string().min(1),
  key: z.string().optional(),
  type: z.enum(["r2", "link"]),
  caption: z.string().max(200).optional(),
});

const Body = z.object({
  type: z.enum(["boat", "shore", "night", "tour"]),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  alternativeDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(5).default([]),
  diveSiteIds: z.array(z.string()).max(10).default([]),
  otherSites: z.string().max(500).optional().nullable(),
  participants: z.number().int().min(1).max(20),
  budgetPerPerson: z.number().int().min(0).max(1_000_000).optional().nullable(),
  customerNote: z.string().max(2000).optional().nullable(),
  referenceImages: z.array(ImageItem).max(8).default([]),
}).refine((d) => d.diveSiteIds.length > 0 || (d.otherSites && d.otherSites.trim().length > 0), {
  message: "請至少選一個潛點或填寫其他潛點",
  path: ["diveSiteIds"],
});

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const wishes = await prisma.diveWish.findMany({
    where: { userId: auth.user.lineUserId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ wishes });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  // v313 email 認證強制
  if (!auth.user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "email_not_verified", message: "請先完成 Email 驗證" },
      { status: 403 },
    );
  }
  // 黑名單
  if (auth.user.blacklisted) {
    return NextResponse.json(
      { error: "blacklisted", message: auth.user.blacklistReason ?? "帳號限制中" },
      { status: 403 },
    );
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Rate limit：每人每週最多 10 個
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = await prisma.diveWish.count({
    where: { userId: auth.user.lineUserId, createdAt: { gte: weekAgo } },
  });
  if (weekCount >= WeeklyLimit) {
    return NextResponse.json(
      { error: "weekly_limit", message: `每週最多提出 ${WeeklyLimit} 個願望單，目前已有 ${weekCount} 個` },
      { status: 429 },
    );
  }

  try {
    const wish = await prisma.diveWish.create({
      data: {
        userId: auth.user.lineUserId,
        type: data.type,
        preferredDate: new Date(data.preferredDate + "T00:00:00+08:00"),
        alternativeDates: data.alternativeDates as never,
        diveSiteIds: data.diveSiteIds as never,
        otherSites: data.otherSites ?? null,
        participants: data.participants,
        budgetPerPerson: data.budgetPerPerson ?? null,
        customerNote: data.customerNote ?? null,
        referenceImages: data.referenceImages as never,
        messages: [] as never,
        status: "pending",
      },
    });

    // push LINE 通知 admin
    void (async () => {
      try {
        const { getLineClient } = await import("@/lib/line");
        const lc = getLineClient();
        if (!lc) return;
        const admins = await prisma.user.findMany({
          where: {
            OR: [
              { role: "admin" }, { role: "boss" },
              { roles: { has: "admin" } }, { roles: { has: "boss" } },
            ],
            notifyByLine: true,
          },
          select: { lineUserId: true },
        });
        const typeLabel = { boat: "🚤 船潛", shore: "🏖 岸潛", night: "🌙 夜潛", tour: "✈️ 潛水團" }[data.type];
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app";
        const text = `📝 新願望單\n\n${auth.user.realName ?? auth.user.displayName} 提出：\n${typeLabel} × ${data.participants} 人\n📅 ${data.preferredDate}\n📍 ${[...data.diveSiteIds, data.otherSites ?? ""].filter(Boolean).join("、")}\n\n👉 進後台審核：${baseUrl}/admin/dive-wishes`;
        for (const a of admins) {
          try { await lc.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text }] }); }
          catch (e) { console.error("[dive-wish push admin]", e); }
        }
      } catch (e) { console.error("[notify admin new wish]", e); }
    })();

    return NextResponse.json({ ok: true, wish });
  } catch (e) {
    console.error("[POST /api/dive-wishes]", e);
    return NextResponse.json({ error: "create_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
