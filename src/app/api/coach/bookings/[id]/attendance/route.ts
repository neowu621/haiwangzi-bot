import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  computeVipLevel,
  normalizeVipTiers,
  VIP_TIERS,
} from "@/lib/vip-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/coach/bookings/[id]/attendance
//   coach / boss / admin 在現場標記到場 / 缺席
//   到場 → status=completed + 累計 logCount += tankCount × participants
//   缺席 → status=no_show + noShowCount + 1
const Body = z.object({
  action: z.enum(["completed", "no_show"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "boss", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!booking)
    return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    if (parsed.data.action === "completed") {
      // 算這筆 booking 加多少 logs
      // daily booking: 每人加 trip.tankCount (一個本人 + 潛伴各自獨立) — 簡化只加本人
      let addLogs = 0;
      if (booking.type === "daily") {
        const trip = await prisma.divingTrip.findUnique({
          where: { id: booking.refId },
        });
        addLogs = trip?.tankCount ?? 1;
      } else {
        addLogs = 1; // 潛水團一筆當 1 次
      }
      await prisma.$transaction([
        prisma.booking.update({
          where: { id },
          data: { status: "completed" },
        }),
        prisma.user.update({
          where: { lineUserId: booking.userId },
          data: { logCount: { increment: addLogs } },
        }),
      ]);

      // 重算 vipLevel
      const user = await prisma.user.findUnique({
        where: { lineUserId: booking.userId },
      });
      if (user) {
        const cfg = await prisma.siteConfig
          .findUnique({ where: { id: "default" } })
          .catch(() => null);
        const tiers = cfg?.vipTiers
          ? normalizeVipTiers(cfg.vipTiers)
          : VIP_TIERS;
        const newLevel = computeVipLevel(
          user.logCount,
          user.totalSpend ?? 0,
          tiers,
        );
        if (newLevel !== user.vipLevel) {
          await prisma.user.update({
            where: { lineUserId: booking.userId },
            data: { vipLevel: newLevel },
          });
        }
      }
      return NextResponse.json({ ok: true, action: "completed", logsAdded: addLogs });
    } else {
      await prisma.$transaction([
        prisma.booking.update({
          where: { id },
          data: { status: "no_show" },
        }),
        prisma.user.update({
          where: { lineUserId: booking.userId },
          data: { noShowCount: { increment: 1 } },
        }),
      ]);
      return NextResponse.json({ ok: true, action: "no_show" });
    }
  } catch (e) {
    console.error("[POST attendance]", e);
    return NextResponse.json(
      {
        error: "attendance update failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
