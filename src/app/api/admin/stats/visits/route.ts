// v577：後台訪客統計 — 回「今日 / 本週(近 7 天) 訪客 + 瀏覽」與每日明細(畫迷你長條)。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  // 近 7 天台北日期字串（含今天）
  const tw = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const now = Date.now();
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) dates.push(tw(new Date(now - i * 86400000)));
  const todayStr = dates[dates.length - 1];

  const rows = await prisma.dailyStat.findMany({
    where: { date: { in: dates } },
    select: { date: true, views: true, visitors: true },
  });
  const map = new Map(rows.map((r) => [r.date, r]));

  const days = dates.map((d) => {
    const r = map.get(d);
    return { date: d, views: r?.views ?? 0, visitors: r?.visitors ?? 0 };
  });
  const today = days[days.length - 1];
  const week = days.reduce(
    (a, d) => ({ views: a.views + d.views, visitors: a.visitors + d.visitors }),
    { views: 0, visitors: 0 },
  );

  return NextResponse.json({ today, week, days, todayStr });
}
