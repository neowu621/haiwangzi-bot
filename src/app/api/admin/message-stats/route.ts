// v1039：訊息成效 —— 每個通知模板「發出去多少、有沒有人看、有沒有人點」。
//   資料來源：
//     MessageLog    每一次對外發送（LINE / Email / 站內）的成敗紀錄
//     Notification  站內通知本身（isRead = 有打開、clickedAt = 有按按鈕）
//   已讀率只有站內算得出來（LINE/Email 讀取行為我們看不到），所以分開呈現，不混在一起。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { FLEX_TEMPLATE_LABELS, FLEX_TEMPLATE_META } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const days = Math.min(365, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? "30")));
  const since = new Date(Date.now() - days * 86400_000);

  const [byTemplate, notifs, clickTrackedSince] = await Promise.all([
    prisma.messageLog.groupBy({
      by: ["templateKey", "channel", "status"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.notification.groupBy({
      by: ["templateKey"],
      where: { createdAt: { gte: since } },
      _count: { _all: true, readAt: true, clickedAt: true },
    }),
    // 點擊追蹤是 v1039 才上線的；在那之前的通知一律沒有 clickedAt，
    // 若整段期間都沒有任何點擊資料就在前端標註「尚未累積」，避免把 0% 誤讀成文案失敗。
    prisma.notification.count({ where: { createdAt: { gte: since }, clickedAt: { not: null } } }),
  ]);

  type Cell = { sent: number; failed: number };
  const rows = new Map<string, {
    key: string; label: string; group: string; icon: string;
    line: Cell; email: Cell; inapp: Cell;
    inappTotal: number; read: number; clicked: number;
  }>();
  const blank = (key: string) => ({
    key,
    label: FLEX_TEMPLATE_LABELS[key as keyof typeof FLEX_TEMPLATE_LABELS] ?? key,
    group: FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META]?.group ?? "其他",
    icon: FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META]?.icon ?? "✉️",
    line: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 }, inapp: { sent: 0, failed: 0 },
    inappTotal: 0, read: 0, clicked: 0,
  });
  const get = (key: string) => {
    let r = rows.get(key);
    if (!r) { r = blank(key); rows.set(key, r); }
    return r;
  };

  for (const g of byTemplate) {
    const r = get(g.templateKey);
    const cell = g.channel === "line" ? r.line : g.channel === "email" ? r.email : r.inapp;
    if (g.status === "failed") cell.failed += g._count._all;
    else if (g.status === "sent") cell.sent += g._count._all;
  }
  for (const n of notifs) {
    const r = get(n.templateKey);
    r.inappTotal += n._count._all;
    r.read += n._count.readAt;
    r.clicked += n._count.clickedAt;
  }

  const list = Array.from(rows.values())
    .map((r) => {
      const totalSent = r.line.sent + r.email.sent + r.inapp.sent;
      const totalFailed = r.line.failed + r.email.failed + r.inapp.failed;
      return {
        ...r,
        totalSent,
        totalFailed,
        readRate: r.inappTotal > 0 ? Math.round((r.read / r.inappTotal) * 100) : null,
        clickRate: r.inappTotal > 0 ? Math.round((r.clicked / r.inappTotal) * 100) : null,
      };
    })
    .sort((a, b) => b.totalSent - a.totalSent || b.inappTotal - a.inappTotal);

  const totals = list.reduce(
    (s, r) => ({
      sent: s.sent + r.totalSent,
      failed: s.failed + r.totalFailed,
      inapp: s.inapp + r.inappTotal,
      read: s.read + r.read,
      clicked: s.clicked + r.clicked,
    }),
    { sent: 0, failed: 0, inapp: 0, read: 0, clicked: 0 },
  );

  return NextResponse.json({
    days,
    clickTracking: clickTrackedSince > 0,
    totals: {
      ...totals,
      readRate: totals.inapp > 0 ? Math.round((totals.read / totals.inapp) * 100) : null,
      clickRate: totals.inapp > 0 ? Math.round((totals.clicked / totals.inapp) * 100) : null,
    },
    rows: list,
  });
}
