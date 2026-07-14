// v837：客戶下單填了「備註」→ 即時推 LINE 提醒老闆/admin ＋ 該場次教練。
//   例：客戶備註「蛙鞋想試 US 11」需事前準備 → 老闆不必逐筆點訂單才發現。
//   fire-and-forget：自帶 try/catch，任何失敗只 log，不影響下單主流程。
import { prisma } from "./prisma";
import { getLineClient } from "./line";

export function notifyStaffCustomerNote(bookingId: string, opts?: { updated?: boolean }): void {
  void (async () => {
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: {
          id: true, type: true, refId: true, notes: true, code: true,
          user: { select: { realName: true, displayName: true, notes: true } }, // v839：客戶個人備註
        },
      });
      const note = (booking?.notes ?? "").trim();
      if (!booking || !note) return; // 沒備註就不擾民

      const client = getLineClient(); // 可能為 null（沒設 LINE token）→ 仍發站內通知

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

      // 收件人：老闆/admin + 該場次教練（去重）。canLine = 是否推 LINE（站內通知一律發）
      const admins = await prisma.user.findMany({
        where: {
          OR: [{ role: "admin" }, { role: "boss" }, { roles: { has: "admin" } }, { roles: { has: "boss" } }],
        },
        select: { lineUserId: true, notifyByLine: true },
      });
      const recip = new Map<string, boolean>(); // lineUserId -> canLine
      for (const a of admins) recip.set(a.lineUserId, a.notifyByLine ?? true);
      if (coachIds.length) {
        const coaches = await prisma.coach.findMany({ where: { id: { in: coachIds }, lineUserId: { not: null } }, select: { lineUserId: true } });
        for (const c of coaches) if (c.lineUserId) recip.set(c.lineUserId, true);
      }
      if (recip.size === 0) return;

      const who = booking.user.realName ?? booking.user.displayName ?? "客戶";
      const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz";
      const adminUrl = `${base}/admin/bookings`;
      // v839：訂單備註（本筆）+ 客戶個人備註（長期・跟著人）兩種都帶
      const personalNote = (booking.user.notes ?? "").trim();
      const noteBlock =
        `📝 訂單備註：${note}` +
        (personalNote ? `\n🙋 個人備註：${personalNote}` : "");
      const head = `👤 ${who}${booking.code ? ` · ${booking.code}` : ""}\n📍 ${session}`;
      const headline = opts?.updated ? "📝 客戶更新了訂單備註（需留意）" : "📝 新訂單有客戶備註（需留意）";
      const text =
        `${headline}\n` +
        `━━━━━━━━━━━━\n` +
        `${head}\n\n` +
        `${noteBlock}\n\n` +
        `👉 ${adminUrl}`;
      // 站內通知（通知中心）內容
      const inAppTitle = opts?.updated ? "📝 客戶更新了訂單備註" : "📝 新訂單有客戶備註";
      const inAppBody = `${head}\n\n${noteBlock}`;

      for (const [to, canLine] of recip) {
        // 1) LINE 推播（會員關掉 LINE 通知、或未設 LINE token 則跳過）
        if (canLine && client) {
          try {
            await client.pushMessage({ to, messages: [{ type: "text", text }] });
          } catch (e) {
            console.error("[notifyStaffCustomerNote push]", to, e);
          }
        }
        // 2) 站內通知（一律寫入內部通知中心；FK 失敗只 log 不中斷）
        try {
          await prisma.notification.create({
            data: { userId: to, templateKey: "staff_customer_note", title: inAppTitle, body: inAppBody, linkUrl: adminUrl, icon: "📝" },
          });
        } catch (e) {
          console.error("[notifyStaffCustomerNote inApp]", to, e);
        }
      }
    } catch (e) {
      console.error("[notifyStaffCustomerNote]", e);
    }
  })();
}
