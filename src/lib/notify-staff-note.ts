// v837：客戶下單填了「備註」→ 即時推 LINE 提醒老闆/admin ＋ 該場次教練。
//   例：客戶備註「蛙鞋想試 US 11」需事前準備 → 老闆不必逐筆點訂單才發現。
//   fire-and-forget：自帶 try/catch，任何失敗只 log，不影響下單主流程。
import { prisma } from "./prisma";
import { getLineClient } from "./line";

export function notifyStaffCustomerNote(bookingId: string): void {
  void (async () => {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, type: true, refId: true, notes: true, code: true,
          user: { select: { realName: true, displayName: true } },
        },
      });
      const note = (booking?.notes ?? "").trim();
      if (!booking || !note) return; // 沒備註就不擾民

      const client = getLineClient();
      if (!client) return;

      // 場次標題 + 該場次教練（daily 有 coachIds；tour 只通知 admin）
      let session = "潛水行程";
      let coachIds: string[] = [];
      if (booking.type === "daily") {
        const t = await prisma.divingTrip.findUnique({
          where: { id: booking.refId },
          select: { date: true, startTime: true, diveSiteIds: true, coachIds: true },
        });
        if (t) {
          const sites = await prisma.diveSite.findMany({ where: { id: { in: t.diveSiteIds } }, select: { id: true, name: true } });
          const siteMap = new Map(sites.map((s) => [s.id, s.name]));
          const siteName = t.diveSiteIds.map((id) => siteMap.get(id) ?? id).join("/") || "東北角";
          session = `日潛 ${t.date.toISOString().slice(0, 10)} ${t.startTime} ${siteName}`;
          coachIds = t.coachIds ?? [];
        }
      } else if (booking.type === "tour") {
        const t = await prisma.tourPackage.findUnique({ where: { id: booking.refId }, select: { title: true } });
        if (t) session = t.title;
      }

      // 收件人：老闆/admin + 該場次教練（去重）
      const admins = await prisma.user.findMany({
        where: {
          OR: [{ role: "admin" }, { role: "boss" }, { roles: { has: "admin" } }, { roles: { has: "boss" } }],
          notifyByLine: true,
        },
        select: { lineUserId: true },
      });
      const targets = new Set(admins.map((a) => a.lineUserId));
      if (coachIds.length) {
        const coaches = await prisma.coach.findMany({ where: { id: { in: coachIds }, lineUserId: { not: null } }, select: { lineUserId: true } });
        for (const c of coaches) if (c.lineUserId) targets.add(c.lineUserId);
      }
      if (targets.size === 0) return;

      const who = booking.user.realName ?? booking.user.displayName ?? "客戶";
      const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz";
      const text =
        `📝 新訂單有客戶備註（需留意）\n` +
        `━━━━━━━━━━━━\n` +
        `👤 ${who}${booking.code ? ` · ${booking.code}` : ""}\n` +
        `📍 ${session}\n\n` +
        `📝 ${note}\n\n` +
        `👉 ${base}/admin/bookings`;

      for (const to of targets) {
        try {
          await client.pushMessage({ to, messages: [{ type: "text", text }] });
        } catch (e) {
          console.error("[notifyStaffCustomerNote push]", to, e);
        }
      }
    } catch (e) {
      console.error("[notifyStaffCustomerNote]", e);
    }
  })();
}
