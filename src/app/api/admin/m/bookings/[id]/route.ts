import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { deriveBookingDisplay } from "@/lib/booking-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/m/bookings/[id]
//   手機後台「訂單詳細」專用。回單筆訂單明細 + 金額(含應付) + 付款證明清單(只回 hasImage 旗標)。
//   完整大圖走既有 /api/admin/payment-proofs/[proofId]；核可/退回走既有 verify/reject endpoint。
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  try {
    const b = await prisma.booking.findUnique({
      where: { id },
      select: {
        id: true, code: true, type: true, refId: true, participants: true,
        totalAmount: true, paidAmount: true, creditUsed: true, depositAmount: true,
        paymentStatus: true, paymentMethod: true, status: true,
        notes: true, adminNotes: true, createdAt: true,
        user: { select: { displayName: true, realName: true, phone: true } },
        paymentProofs: {
          select: {
            id: true, type: true, amount: true, last5: true, note: true,
            imageKey: true, uploadedAt: true, verifiedAt: true, rejectedAt: true,
          },
          orderBy: { uploadedAt: "desc" },
        },
      },
    });
    if (!b) return NextResponse.json({ error: "not found" }, { status: 404 });

    let date: string | null = null;
    let startTime: string | null = null;
    let title = "";
    if (b.type === "daily") {
      const t = await prisma.divingTrip.findUnique({
        where: { id: b.refId },
        select: { date: true, startTime: true, diveSiteIds: true },
      });
      if (t) {
        date = t.date.toISOString().slice(0, 10);
        startTime = t.startTime;
        const sites = await prisma.diveSite.findMany({
          where: { id: { in: t.diveSiteIds } },
          select: { id: true, name: true },
        });
        const m = new Map(sites.map((s) => [s.id, s.name]));
        title = t.diveSiteIds.map((x) => m.get(x) ?? x).join("、") || "日潛";
      } else title = "日潛";
    } else {
      const t = await prisma.tourPackage.findUnique({
        where: { id: b.refId },
        select: { title: true, dateStart: true },
      });
      if (t) { date = t.dateStart.toISOString().slice(0, 10); title = t.title; } else title = "潛水團";
    }

    const display = deriveBookingDisplay({
      status: b.status,
      paymentStatus: b.paymentStatus,
      createdAt: b.createdAt,
      activityDate: date,
    });
    const payable = Math.max(0, b.totalAmount - b.paidAmount);

    return NextResponse.json({
      booking: {
        id: b.id,
        code: b.code,
        type: b.type,
        participants: b.participants,
        customerName: b.user.realName ?? b.user.displayName,
        phone: b.user.phone,
        date,
        startTime,
        title,
        totalAmount: b.totalAmount,
        paidAmount: b.paidAmount,
        creditUsed: b.creditUsed,
        depositAmount: b.depositAmount,
        payable,
        paymentStatus: b.paymentStatus,
        paymentMethod: b.paymentMethod,
        status: b.status,
        statusLabel: display.label,
        notes: b.notes,
        adminNotes: b.adminNotes,
      },
      proofs: b.paymentProofs.map((p) => ({
        id: p.id,
        type: p.type,
        amount: p.amount,
        last5: p.last5,
        note: p.note,
        hasImage: Boolean(p.imageKey),
        uploadedAt: p.uploadedAt,
        state: p.verifiedAt ? "verified" : p.rejectedAt ? "rejected" : "pending",
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `訂單載入失敗：${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
