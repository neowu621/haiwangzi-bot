import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  computeVipLevel,
  normalizeVipTiers,
  VIP_TIERS,
} from "@/lib/vip-tier";
import { grantVipUpgradeRewards } from "@/lib/vip-upgrade-rewards";

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
      // 算這筆 booking 加多少 logs (海王子累積，不動使用者自填的 logCount)
      // daily booking: 每人加 trip.tankCount × participants
      let addLogs = 0;
      if (booking.type === "daily") {
        const trip = await prisma.divingTrip.findUnique({
          where: { id: booking.refId },
        });
        addLogs = (trip?.tankCount ?? 1) * booking.participants;
      } else {
        // 潛水團：每人算 1 趟（每團平均 N 潛由 trip 包定，這裡先簡化）
        addLogs = booking.participants;
      }
      await prisma.$transaction([
        prisma.booking.update({
          where: { id },
          data: { status: "completed" },
        }),
        prisma.user.update({
          where: { lineUserId: booking.userId },
          // 只加 haiwangziLogCount，不動 logCount (使用者自填的歷史經驗)
          data: { haiwangziLogCount: { increment: addLogs } },
        }),
      ]);

      // 重算 vipLevel — 用 haiwangziLogCount (避免使用者自填灌水)
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
          user.haiwangziLogCount ?? 0,
          user.totalSpend ?? 0,
          tiers,
        );
        const oldLevel = user.vipLevel ?? 1;
        if (newLevel !== oldLevel) {
          await prisma.user.update({
            where: { lineUserId: booking.userId },
            data: { vipLevel: newLevel },
          });
          // 升等 → 發抵用金（每跨一階都發，從新版 VipTier.upgradeCredit 讀）
          if (newLevel > oldLevel) {
            await grantVipUpgradeRewards(
              booking.userId,
              oldLevel,
              newLevel,
              tiers,
            );
          }
        }
      }
      // v270：推 LINE 「已記錄到場」 + 嘗試首單獎勵
      const updatedUser = await prisma.user.findUnique({
        where: { lineUserId: booking.userId },
        select: { displayName: true, realName: true, haiwangziLogCount: true, vipLevel: true, notifyByLine: true },
      });
      void (async () => {
        try {
          if (updatedUser?.notifyByLine ?? true) {
            const { getLineClient } = await import("@/lib/line");
            const { buildFlexByKeyAsync } = await import("@/lib/flex");
            const lineClient = getLineClient();
            if (!lineClient) return;
            // 組 booking title
            let bookingTitle = `預約 #${id.slice(0, 8)}`;
            if (booking.type === "daily") {
              const trip = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
              if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
            } else {
              const tour = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
              if (tour) bookingTitle = tour.title;
            }
            const flex = await buildFlexByKeyAsync(
              "attendance_confirmed",
              {
                bookingTitle,
                addLogs,
                totalLogs: updatedUser?.haiwangziLogCount ?? 0,
                vipLevel: updatedUser?.vipLevel ?? 1,
                liffUrl: process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm",
              },
              `已記錄您今日到場 (+${addLogs} 潛)`,
            );
            await lineClient.pushMessage({ to: booking.userId, messages: [flex] });
          }
        } catch (e) {
          console.error("[attendance LINE]", e);
        }
      })();

      // v270：首單獎勵改在這裡觸發（取代原本 fully_paid 觸發）
      void import("@/lib/first-order-reward")
        .then((m) => m.maybeGrantFirstOrderReward(booking.userId, id))
        .catch((e) => console.error("[first-order-reward attendance]", e));

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
