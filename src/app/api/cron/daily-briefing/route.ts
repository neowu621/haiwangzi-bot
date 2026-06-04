// v315：每日訂單日報 (建議 Cronicle 排程：每天 07:00 Asia/Taipei)
// 兩種版本:
//   - 老闆/admin（含 email）：今日場次 + 客戶 + 應收 + 待審核 + 待結算 + 統計
//   - 教練（lightweight LINE）：今日場次 + 客戶清單（不含金額）
//
// 認證: Authorization: Bearer ${CRON_SECRET}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tw(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
}

export async function POST(req: NextRequest) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!cfg?.dailyBriefingEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  const now = new Date();
  const todayStr = tw(now);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tw(tomorrow);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = tw(yesterday);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  // 1. 今日 daily trips + 訂單
  const todayTrips = await prisma.divingTrip.findMany({
    where: { date: { gte: new Date(todayStr + "T00:00:00+08:00"), lt: new Date(tomorrowStr + "T00:00:00+08:00") } },
    select: { id: true, date: true, startTime: true, diveSiteIds: true },
  });
  const todayTours = await prisma.tourPackage.findMany({
    where: {
      dateStart: { lte: new Date(todayStr + "T23:59:59+08:00") },
      dateEnd: { gte: new Date(todayStr + "T00:00:00+08:00") },
    },
    select: { id: true, title: true, dateStart: true, dateEnd: true },
  });
  const todayTripIds = todayTrips.map((t) => t.id);
  const todayTourIds = todayTours.map((t) => t.id);

  const todayBookings = await prisma.booking.findMany({
    where: {
      OR: [
        { type: "daily", refId: { in: todayTripIds } },
        { type: "tour", refId: { in: todayTourIds } },
      ],
      status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "cancelled_unpaid"] },
    },
    include: { user: { select: { realName: true, displayName: true, phone: true } } },
  });

  // 取 dive sites name
  const allSiteIds = Array.from(new Set(todayTrips.flatMap((t) => t.diveSiteIds)));
  const sites = await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } }, select: { id: true, name: true } });
  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  // 2. 待確認匯款 (status=awaiting_verify)
  const pendingProofs = await prisma.booking.findMany({
    where: { status: "awaiting_verify" },
    include: { user: { select: { realName: true, displayName: true } } },
    take: 20,
  });

  // 3. 昨日待結算 (場次過了還沒勾到場)
  const pastUnsettledTrips = await prisma.divingTrip.findMany({
    where: { date: { gte: new Date(yesterdayStr + "T00:00:00+08:00"), lt: new Date(todayStr + "T00:00:00+08:00") } },
    select: { id: true },
  });
  const pastUnsettledTours = await prisma.tourPackage.findMany({
    where: { dateEnd: { lt: new Date(todayStr + "T00:00:00+08:00") } },
    select: { id: true },
    take: 30,
  });
  const pastUnsettled = await prisma.booking.count({
    where: {
      OR: [
        { type: "daily", refId: { in: pastUnsettledTrips.map((t) => t.id) }, status: { in: ["pending", "confirmed", "awaiting_verify"] } },
        { type: "tour", refId: { in: pastUnsettledTours.map((t) => t.id) }, status: { in: ["pending", "confirmed", "awaiting_verify"] } },
      ],
    },
  });

  // 4. 月統計
  const monthAdded = await prisma.booking.count({ where: { createdAt: { gte: monthStart } } });
  const monthRevenue = await prisma.booking.aggregate({
    where: {
      createdAt: { gte: monthStart },
      paymentStatus: { in: ["fully_paid", "deposit_paid"] },
    },
    _sum: { paidAmount: true },
  });

  // ── 場次分組 ──
  const tripGroups = todayTrips.map((t) => {
    const bookings = todayBookings.filter((b) => b.type === "daily" && b.refId === t.id);
    const totalAmt = bookings.reduce((s, b) => s + b.totalAmount, 0);
    const paidAmt = bookings.reduce((s, b) => s + b.paidAmount, 0);
    const totalPeople = bookings.reduce((s, b) => s + b.participants, 0);
    return {
      label: `🤿 ${t.startTime} ${t.diveSiteIds.map((id) => siteMap.get(id) ?? id).join("/")}`,
      bookings,
      totalAmt,
      paidAmt,
      totalPeople,
      due: totalAmt - paidAmt,
    };
  });
  const tourGroups = todayTours.map((t) => {
    const bookings = todayBookings.filter((b) => b.type === "tour" && b.refId === t.id);
    const totalAmt = bookings.reduce((s, b) => s + b.totalAmount, 0);
    const paidAmt = bookings.reduce((s, b) => s + b.paidAmount, 0);
    const totalPeople = bookings.reduce((s, b) => s + b.participants, 0);
    return {
      label: `✈️ ${t.title}`,
      bookings,
      totalAmt,
      paidAmt,
      totalPeople,
      due: totalAmt - paidAmt,
    };
  });
  const allGroups = [...tripGroups, ...tourGroups];
  const totalBookings = todayBookings.length;
  const totalPeople = todayBookings.reduce((s, b) => s + b.participants, 0);

  // ── 老闆/admin 完整訊息 ──
  function buildBossText(): string {
    const lines: string[] = [];
    lines.push(`🌊 海王子日報｜${fmtDate(now)}`);
    lines.push("━━━━━━━━━━━━━━━");
    lines.push("");
    if (allGroups.length === 0) {
      lines.push("📅 今日無場次");
    } else {
      lines.push(`📅 今日場次（${allGroups.length} 場 / ${totalBookings} 筆 / ${totalPeople} 人）`);
      for (const g of allGroups) {
        lines.push(`  ${g.label}`);
        if (g.bookings.length === 0) {
          lines.push(`    （尚無預約）`);
        } else {
          const names = g.bookings.map((b) => `${b.user.realName ?? b.user.displayName}×${b.participants}`).join("、");
          lines.push(`    👥 ${names}`);
          lines.push(`    💰 已收 NT$ ${g.paidAmt.toLocaleString()} / 應收 NT$ ${g.totalAmt.toLocaleString()}${g.due > 0 ? ` (待繳 ${g.due.toLocaleString()})` : ""}`);
        }
      }
    }
    lines.push("");
    if (pendingProofs.length > 0) {
      lines.push(`💰 待確認匯款（${pendingProofs.length} 筆）`);
      for (const b of pendingProofs.slice(0, 10)) {
        lines.push(`  • ${b.user.realName ?? b.user.displayName} ${b.code ?? b.id.slice(0, 8)} NT$ ${b.totalAmount.toLocaleString()}`);
      }
      if (pendingProofs.length > 10) lines.push(`  ⋯ 還有 ${pendingProofs.length - 10} 筆`);
      lines.push("");
    }
    if (pastUnsettled > 0) {
      lines.push(`⚠ 待結算（昨日場次未勾到場）：${pastUnsettled} 筆`);
      lines.push(`  → 進「今晚結帳」處理`);
      lines.push("");
    }
    lines.push(`📈 本月：${monthAdded} 筆訂單 / 入帳 NT$ ${(monthRevenue._sum.paidAmount ?? 0).toLocaleString()}`);
    lines.push("");
    lines.push(`👉 ${process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app"}/admin`);
    return lines.join("\n");
  }

  // ── 教練 lightweight 訊息 ──
  function buildCoachText(): string {
    const lines: string[] = [];
    lines.push(`🤿 海王子今日場次｜${fmtDate(now)}`);
    lines.push("━━━━━━━━━━━━━━━");
    lines.push("");
    if (allGroups.length === 0) {
      lines.push("今天沒有場次，好好休息 🌴");
      return lines.join("\n");
    }
    for (const g of allGroups) {
      lines.push(g.label);
      if (g.bookings.length === 0) {
        lines.push(`  （無預約）`);
      } else {
        for (const b of g.bookings) {
          const name = b.user.realName ?? b.user.displayName;
          lines.push(`  • ${name} ×${b.participants}${b.user.phone ? ` (${b.user.phone})` : ""}`);
        }
      }
      lines.push("");
    }
    lines.push(`共 ${totalBookings} 筆 / ${totalPeople} 人`);
    return lines.join("\n");
  }

  // ── 發送 ──
  const bossText = buildBossText();
  const coachText = buildCoachText();

  const bossEmailHtml = `
    <h2 style="font-family:sans-serif">🌊 海王子日報｜${fmtDate(now)}</h2>
    <pre style="font-family:'PingFang TC','Microsoft JhengHei',sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:8px">${bossText.replace(/</g, "&lt;")}</pre>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app"}/admin">👉 進入後台</a></p>
  `;

  let lineSent = 0;
  let emailSent = 0;
  const errors: string[] = [];
  const client = getLineClient();

  // 老闆 + admin
  const admins = await prisma.user.findMany({
    where: {
      OR: [
        { role: "admin" }, { role: "boss" },
        { roles: { has: "admin" } }, { roles: { has: "boss" } },
      ],
    },
    select: { lineUserId: true, email: true, notifyByLine: true, notifyByEmail: true, realName: true, displayName: true },
  });
  for (const a of admins) {
    if (a.notifyByLine && client) {
      try {
        await client.pushMessage({ to: a.lineUserId, messages: [{ type: "text", text: bossText }] });
        lineSent++;
      } catch (e) { errors.push(`line admin ${a.lineUserId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (a.notifyByEmail && a.email) {
      try {
        await sendEmail({
          to: a.email,
          subject: `🌊 海王子日報 ${fmtDate(now)}`,
          html: bossEmailHtml,
        });
        emailSent++;
      } catch (e) { errors.push(`email admin ${a.email}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  // 教練版
  if (cfg.dailyBriefingIncludeCoaches && client) {
    const coaches = await prisma.user.findMany({
      where: {
        OR: [{ role: "coach" }, { roles: { has: "coach" } }],
        notifyByLine: true,
      },
      select: { lineUserId: true },
    });
    for (const c of coaches) {
      // 跳過已發過 boss 版的（admin 兼任 coach）
      if (admins.some((a) => a.lineUserId === c.lineUserId)) continue;
      try {
        await client.pushMessage({ to: c.lineUserId, messages: [{ type: "text", text: coachText }] });
        lineSent++;
      } catch (e) { errors.push(`line coach ${c.lineUserId}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  // 記錄發送時間
  await prisma.siteConfig.update({
    where: { id: "default" },
    data: { dailyBriefingLastSentAt: new Date() } as never,
  });

  return NextResponse.json({
    ok: true,
    date: todayStr,
    lineSent,
    emailSent,
    errors: errors.slice(0, 10),
    summary: {
      todayBookings: totalBookings,
      todayPeople: totalPeople,
      pendingProofs: pendingProofs.length,
      pastUnsettled,
      monthRevenue: monthRevenue._sum.paidAmount ?? 0,
    },
  });
}
