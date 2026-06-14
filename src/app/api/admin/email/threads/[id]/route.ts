import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { purgeEmailThreads } from "@/lib/email-inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function guard(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return { res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return { res: NextResponse.json({ error: role.message }, { status: role.status }) };
  return { res: null };
}

/**
 * GET /api/admin/email/threads/:id — 對話串詳情（含 messages）
 * 來源：bundle admin.email.ts 的 GET /threads/:id。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { id } = await params;

  const thread = await prisma.emailThread.findUnique({
    where: { id },
    include: { booking: true, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ thread });
}

/**
 * PATCH /api/admin/email/threads/:id — 改狀態 / 標籤 / 指派 / 連動訂位
 * 來源：bundle admin.email.ts 的 PATCH /threads/:id。
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { id } = await params;

  const body = (await req.json()) as {
    status?: "WAITING" | "PROCESSING" | "CLOSED";
    tags?: string[];
    assignee?: string;
    bookingId?: string | null;
  };

  // 只挑允許的欄位，避免客戶端塞任意欄位
  const data: Prisma.EmailThreadUpdateInput = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.assignee !== undefined) data.assignee = body.assignee;
  if (body.bookingId !== undefined) {
    data.booking = body.bookingId
      ? { connect: { id: body.bookingId } }
      : { disconnect: true };
  }

  const thread = await prisma.emailThread.update({ where: { id }, data });
  return NextResponse.json({ thread });
}

/**
 * DELETE /api/admin/email/threads/:id — 永久刪除整條對話（含所有信件 + R2 附件，不可復原）
 * v529：手動刪除。
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req);
  if (g.res) return g.res;
  const { id } = await params;
  const r = await purgeEmailThreads([id]);
  return NextResponse.json({ ok: true, ...r });
}
