import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { runAndLogPoll } from "@/lib/gmail-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });
  return null;
}

async function recentLogs() {
  return prisma.emailPollLog.findMany({ orderBy: { ranAt: "desc" }, take: 12 });
}

/** GET /api/admin/email/poll — 取最近收信紀錄（不觸發收信） */
export async function GET(req: NextRequest) {
  const bad = await guard(req);
  if (bad) return bad;
  return NextResponse.json({ logs: await recentLogs() });
}

/** POST /api/admin/email/poll — 手動立即收信（讀 Gmail），回結果 + 最近紀錄 */
export async function POST(req: NextRequest) {
  const bad = await guard(req);
  if (bad) return bad;
  const result = await runAndLogPoll("manual");
  return NextResponse.json({ result, logs: await recentLogs() });
}
