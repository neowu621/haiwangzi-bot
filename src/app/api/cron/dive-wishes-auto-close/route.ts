// v318：7 天無互動的願望單自動關閉
// 建議 Cronicle 排程: 每天 03:00 Asia/Taipei
import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || !safeEqual(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const targets = await prisma.diveWish.findMany({
    where: {
      status: { in: ["pending", "discussing"] },
      lastActivityAt: { lt: sevenDaysAgo },
    },
    include: { user: { select: { lineUserId: true } } },
    take: 100,
  });

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, closed: 0 });
  }

  let ok = 0;
  for (const w of targets) {
    try {
      await prisma.diveWish.update({
        where: { id: w.id },
        data: {
          status: "cancelled",
          cancelledBy: "system",
          cancellationReason: "7 天無互動，系統自動關閉",
          cancelledAt: new Date(),
        },
      });
      // 推 LINE 給客戶
      try {
        const { getLineClient } = await import("@/lib/line");
        const lc = getLineClient();
        if (lc) {
          await lc.pushMessage({
            to: w.user.lineUserId,
            messages: [{
              type: "text",
              text: `📝 您的願望單因 7 天無互動已自動關閉\n\n如還想潛水，請重新提出新願望單，或瀏覽既有場次。`,
            }],
          });
        }
      } catch (e) { console.error("[auto-close notify]", e); }
      ok++;
    } catch (e) {
      console.error("[auto-close]", w.id, e);
    }
  }

  return NextResponse.json({ ok: true, closed: ok, scanned: targets.length });
}
