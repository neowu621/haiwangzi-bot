import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { displayName: true, realName: true, phone: true, cert: true },
      },
    },
  });

  const headers = [
    "建立時間",
    "類型",
    "狀態",
    "付款狀態",
    "客戶",
    "電話",
    "證照",
    "人數",
    "總金額",
    "已付",
    "備註",
  ];
  const rows = bookings.map((b) =>
    [
      b.createdAt.toISOString(),
      b.type,
      b.status,
      b.paymentStatus,
      b.user.realName ?? b.user.displayName,
      b.user.phone ?? "",
      b.user.cert ?? "",
      b.participants,
      b.totalAmount,
      b.paidAmount,
      b.notes ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
