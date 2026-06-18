// v577：公開訪客計數 beacon 端點（無需登入）。
//   設計：永遠回 204、永不丟錯給前端；只 upsert 當天 daily_stats 聚合，不存任何訪客身分。
//   body: { u?: boolean }  u=true 代表「同一瀏覽器當天第一次開」(由前端 localStorage 旗標判斷)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 台北當天日期字串 YYYY-MM-DD
function taipeiToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}

export async function POST(req: NextRequest) {
  try {
    let isNew = false;
    try {
      const body = (await req.json()) as { u?: unknown };
      isNew = body?.u === true;
    } catch {
      /* 無 body / 壞 body 都當一般 view */
    }
    const date = taipeiToday();
    await prisma.dailyStat.upsert({
      where: { date },
      create: { date, views: 1, visitors: isNew ? 1 : 0 },
      update: {
        views: { increment: 1 },
        ...(isNew ? { visitors: { increment: 1 } } : {}),
      },
    });
  } catch (e) {
    // 計數失敗絕不影響使用者；只記 log
    console.error("[track/visit]", e);
  }
  return new NextResponse(null, { status: 204 });
}
