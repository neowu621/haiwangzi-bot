// v623：特權角色設定端點（等同「資料庫直接設定」）。
//   用途：設定 老闆(boss)/IT(it) 這種高權角色，以及多重身分 —— 一般 admin UI 不開放。
//   認證：Authorization: Bearer <CRON_SECRET>（只有開發者/系統持有）。
//   body: { assignments: [{ lineUserId, roles: ["customer","it",...] }] }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/safe-compare";
import type { UserRole } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: UserRole[] = ["customer", "coach", "boss", "admin", "assistant", "it"];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!safeEqual(token, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { assignments?: Array<{ lineUserId: string; roles: string[] }> };
  if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
    return NextResponse.json({ error: "需要 assignments: [{lineUserId, roles}]" }, { status: 400 });
  }

  const done: Array<{ lineUserId: string; roles?: string[]; error?: string }> = [];
  for (const a of body.assignments) {
    try {
      const roles = Array.from(new Set(a.roles)).filter((r): r is UserRole => (VALID as string[]).includes(r));
      if (roles.length === 0) { done.push({ lineUserId: a.lineUserId, error: "無有效角色" }); continue; }
      const user = await prisma.user.update({
        where: { lineUserId: a.lineUserId },
        data: { role: roles[0], roles }, // role = 主角色（向後相容）；roles = 完整身分
        select: { lineUserId: true, role: true, roles: true },
      });
      done.push({ lineUserId: user.lineUserId, roles: user.roles });
    } catch (e) {
      done.push({ lineUserId: a.lineUserId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, done });
}
