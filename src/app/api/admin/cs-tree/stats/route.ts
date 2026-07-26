// v903：客服引導問題樹 —— 統計看板資料（客戶都問什麼、自助解決率、最常轉真人的問題）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { CS_TREE_LABELS } from "@/lib/cs-tree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days") ?? "30")));
  const since = new Date(Date.now() - days * 86400_000);

  const [byAction, answers, escalated, categories] = await Promise.all([
    prisma.csTreeEvent.groupBy({ by: ["action"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.csTreeEvent.groupBy({ by: ["questionKey"], where: { createdAt: { gte: since }, action: "answer" }, _count: { _all: true } }),
    prisma.csTreeEvent.groupBy({ by: ["questionKey"], where: { createdAt: { gte: since }, action: "escalated" }, _count: { _all: true } }),
    prisma.csTreeEvent.groupBy({ by: ["category"], where: { createdAt: { gte: since }, action: "category" }, _count: { _all: true } }),
  ]);

  const actionCount = (a: string) => byAction.find((x) => x.action === a)?._count._all ?? 0;
  const totals = {
    category: actionCount("category"),
    answer: actionCount("answer"),
    resolved: actionCount("resolved"),
    escalated: actionCount("escalated"),
  };
  const resolveDenom = totals.resolved + totals.escalated;
  const resolveRate = resolveDenom > 0 ? Math.round((totals.resolved / resolveDenom) * 100) : null;

  const label = (k: string | null) => (k ? CS_TREE_LABELS[k] ?? k : "（未指定）");
  const toList = (rows: { questionKey: string | null; _count: { _all: number } }[]) =>
    rows
      .map((r) => ({ key: r.questionKey ?? "", label: label(r.questionKey), count: r._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

  const catList = categories
    .map((r) => ({ key: r.category, label: CS_TREE_LABELS[r.category] ?? r.category, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    days,
    totals,
    resolveRate,
    topQuestions: toList(answers),
    topEscalated: toList(escalated),
    categories: catList,
  });
}
