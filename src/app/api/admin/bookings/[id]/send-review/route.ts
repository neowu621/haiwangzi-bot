// v833：單筆訂單「發送/補發 五星評價邀請」— 老闆潛水後手動發。
//   沿用 attendance_confirmed 範本（含 v833 新增的「私訊反映」第二顆按鈕）+ reviewSentAt 蓋章。
//   GET  → 回該筆是否可發（completed）與是否已發（reviewSentAt）。
//   POST { force?: boolean } → 發送；已發過需 force=true 才重發（防誤按重發）。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    select: {
      id: true, userId: true, type: true, refId: true,
      participants: true, tankCount: true, status: true, reviewSentAt: true,
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const b = await loadBooking(id);
  if (!b) return NextResponse.json({ error: "booking not found" }, { status: 404 });
  return NextResponse.json({
    canSend: b.status === "completed",
    alreadySent: !!b.reviewSentAt,
    sentAt: b.reviewSentAt,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  const b = await loadBooking(id);
  if (!b) return NextResponse.json({ error: "booking not found" }, { status: 404 });
  if (b.status !== "completed") {
    return NextResponse.json({ error: "僅能對「已完成」的潛水發送評價邀請" }, { status: 400 });
  }
  if (b.reviewSentAt && !force) {
    // 已發過 → 前端顯示確認後再帶 force:true 重發
    return NextResponse.json({ error: "此訂單已發送過評價邀請", alreadySent: true, sentAt: b.reviewSentAt }, { status: 409 });
  }

  // 客戶需開啟 LINE 通知（沿用 push-line 的判斷語意；notifyCustomer 內也會再 gate）
  const target = await prisma.user.findUnique({
    where: { lineUserId: b.userId },
    select: { lineUserId: true, displayName: true, realName: true, notifyByLine: true, haiwangziLogCount: true, vipLevel: true },
  });
  if (!target) return NextResponse.json({ error: "找不到該客戶" }, { status: 404 });

  // 活動標題 + 本次累積潛數（與 backfill-attendance-review 同邏輯）
  let bookingTitle = "您的潛水行程";
  let addLogs: number = b.participants;
  if (b.type === "daily") {
    const t = await prisma.divingTrip.findUnique({
      where: { id: b.refId },
      select: { date: true, startTime: true, tankCount: true },
    });
    if (t) {
      bookingTitle = `日潛 ${t.date.toISOString().slice(0, 10)} ${t.startTime}`;
      addLogs = (b.tankCount ?? t.tankCount ?? 1) * b.participants;
    }
  } else if (b.type === "tour") {
    const t = await prisma.tourPackage.findUnique({ where: { id: b.refId }, select: { title: true } });
    if (t) bookingTitle = t.title;
  }

  const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  const { notifyCustomer } = await import("@/lib/notify-template");
  notifyCustomer({
    userId: b.userId,
    templateKey: "attendance_confirmed",
    params: {
      bookingTitle,
      addLogs,
      totalLogs: target.haiwangziLogCount ?? 0,
      vipLevel: target.vipLevel ?? 1,
      liffUrl,
    },
  });

  // 蓋章防重複（不論推播成敗都標記）
  const sentAt = new Date();
  await prisma.booking.update({ where: { id: b.id }, data: { reviewSentAt: sentAt } }).catch(() => {});

  await logAudit({
    actorId: auth.user.lineUserId,
    action: "admin.send_review_invite",
    targetType: "booking",
    targetId: b.id,
    targetLabel: target.realName ?? target.displayName,
    metadata: { bookingTitle, resend: !!b.reviewSentAt, notifyByLine: target.notifyByLine },
  });

  return NextResponse.json({ ok: true, sentAt, resent: !!b.reviewSentAt });
}
