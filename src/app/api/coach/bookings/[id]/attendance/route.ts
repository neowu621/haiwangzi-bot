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
  const role = requireRole(auth.user, ["coach", "assistant", "boss", "admin"]);
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
        // v719：累積潛數用「該筆訂單實際潛次」(booking.tankCount)，舊單為 null 才退回場次預設。
        //   原本一律用 trip.tankCount，會讓選少潛次的客人(如 2 潛)被多算成場次預設(3)。
        const perPersonTanks = booking.tankCount ?? trip?.tankCount ?? 1;
        addLogs = perPersonTanks * booking.participants;
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

      // v278：log
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "completed",
          actorId: auth.user.lineUserId,
          actorRole: "admin",
          note: `勾選到場（+${addLogs} 潛數）`,
        }),
      );

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
            // v420：升等通知（vip_upgrade 模板）— 只在客戶實際潛水升等時發
            const tier = tiers.find((t) => t.level === newLevel);
            if (tier) {
              const { notifyCustomer } = await import("@/lib/notify-template");
              const liffUrl = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
              const benefits = (tier.benefits ?? []).join("\n");
              // v480：LINE/Email/站內 內容全由模板組稿（後台填什麼發什麼）
              notifyCustomer({
                userId: booking.userId,
                templateKey: "vip_upgrade",
                params: { tierName: tier.name, tierEmoji: tier.emoji, benefits, liffUrl },
              });
            }
          }
        }

        // v388：VIP 滿級（最高階）後，每超過 N 潛回饋 M 元抵用金。
        //   N=SiteConfig.vipOverflowDives、M=SiteConfig.vipOverflowCredit（後台可調）。
        //   去重：以已發的 vip_overflow CreditTx 筆數對應已達里程碑數，補齊差額。
        try {
          const maxLevel = Math.max(...tiers.map((t) => t.level));
          const overflowDives =
            (cfg as unknown as { vipOverflowDives?: number } | null)
              ?.vipOverflowDives ?? 50;
          const overflowCredit =
            (cfg as unknown as { vipOverflowCredit?: number } | null)
              ?.vipOverflowCredit ?? 1000;
          const baseLogs =
            tiers.find((t) => t.level === maxLevel)?.minLogs ?? 0;
          const logs = user.haiwangziLogCount ?? 0;
          if (
            newLevel >= maxLevel &&
            overflowDives > 0 &&
            overflowCredit > 0 &&
            logs >= baseLogs
          ) {
            const milestones = Math.floor((logs - baseLogs) / overflowDives);
            if (milestones > 0) {
              const alreadyGranted = await prisma.creditTx.count({
                where: { userId: booking.userId, reason: "vip_overflow" },
              });
              for (let m = alreadyGranted + 1; m <= milestones; m++) {
                const { grantCredit } = await import("@/lib/credit");
                await grantCredit({
                  userId: booking.userId,
                  amount: overflowCredit,
                  reason: "vip_overflow",
                  refType: "vip_overflow",
                  refId: String(m),
                  note: `VIP 滿級回饋（累計 ${baseLogs + m * overflowDives} 潛）`,
                });
              }
            }
          }
        } catch (e) {
          console.error("[vip_overflow reward]", e);
        }
      }
      // v270：推 LINE 「已記錄到場」 + 嘗試首單獎勵
      const updatedUser = await prisma.user.findUnique({
        where: { lineUserId: booking.userId },
        select: { displayName: true, realName: true, haiwangziLogCount: true, vipLevel: true, notifyByLine: true },
      });
      void (async () => {
        try {
          // 組 booking title
          let bookingTitle = `預約 #${id.slice(0, 8)}`;
          if (booking.type === "daily") {
            const trip = await prisma.divingTrip.findUnique({ where: { id: booking.refId } });
            if (trip) bookingTitle = `日潛 ${trip.date.toISOString().slice(0, 10)} ${trip.startTime}`;
          } else {
            const tour = await prisma.tourPackage.findUnique({ where: { id: booking.refId } });
            if (tour) bookingTitle = tour.title;
          }
          // v480：改走 notifyCustomer — LINE/Email/站內 全由模板組稿 + 記入發送紀錄
          const { notifyCustomer } = await import("@/lib/notify-template");
          notifyCustomer({
            userId: booking.userId,
            templateKey: "attendance_confirmed",
            params: {
              bookingTitle,
              addLogs,
              totalLogs: updatedUser?.haiwangziLogCount ?? 0,
              vipLevel: updatedUser?.vipLevel ?? 1,
              liffUrl: process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm",
            },
          });
        } catch (e) {
          console.error("[attendance notify]", e);
        }
      })();

      // v270：首單獎勵改在這裡觸發（取代原本 fully_paid 觸發）
      void import("@/lib/first-order-reward")
        .then((m) => m.maybeGrantFirstOrderReward(booking.userId, id))
        .catch((e) => console.error("[first-order-reward attendance]", e));

      // v592：日潛早鳥回饋（結案後發,30 天到期）
      void import("@/lib/early-bird")
        .then((m) => m.maybeGrantEarlyBird(id))
        .catch((e) => console.error("[early-bird grant]", e));

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
      // v278：log
      void import("@/lib/booking-status-log").then((m) =>
        m.logBookingStatusChange({
          bookingId: id,
          fromStatus: booking.status,
          toStatus: "no_show",
          actorId: auth.user.lineUserId,
          actorRole: "admin",
          note: "勾選未到場",
        }),
      );
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
