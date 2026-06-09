import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { makeMultiSheetXlsxBuffer } from "@/lib/email/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/weekly-report-email
 *
 * 每週一 09:00 Asia/Taipei 寄上週統計報表給所有 admin/boss
 *
 * 內容：
 *   HTML 摘要：上週營收、訂單數、出席率、新會員
 *   Excel 附件：上週訂單明細 + 教練績效 + 潛點熱度
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!emailConfigured()) {
    return NextResponse.json({ ok: true, note: "Email 未設定，skip" });
  }

  // 本週範圍：本週一 00:00 ~ 本週日 23:59（週日晚上 18:00 寄出時包含週日當日數據）
  // 推算：若週日寄送（dayOfWeek=0），週一 = -6 天
  const todayTW = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const now = new Date(`${todayTW}T00:00:00+08:00`);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  // 距離本週一的天數（週日寄送 → 6 天前）
  const daysBackToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMon = new Date(now);
  thisMon.setDate(now.getDate() - daysBackToMon);
  const thisSun = new Date(thisMon);
  thisSun.setDate(thisMon.getDate() + 6);
  thisSun.setHours(23, 59, 59, 999);

  // 變數名沿用 lastMon/lastSun 避免大改下面邏輯
  const lastMon = thisMon;
  const lastSun = thisSun;
  const weekStr = `${lastMon.toISOString().slice(0, 10)} ~ ${lastSun.toISOString().slice(0, 10)}`;

  // 撈上週訂單
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: lastMon, lte: lastSun } },
    include: { user: { select: { realName: true, displayName: true } } },
  });

  // 撈上週付款核可
  const verifiedProofs = await prisma.paymentProof.findMany({
    where: { verifiedAt: { gte: lastMon, lte: lastSun } },
  });

  // 撈上週新會員
  const newUsers = await prisma.user.findMany({
    where: { createdAt: { gte: lastMon, lte: lastSun } },
    select: { lineUserId: true, realName: true, displayName: true, createdAt: true, email: true, phone: true },
  });

  // 撈上週完成的場次（依場次日期）
  const trips = await prisma.divingTrip.findMany({
    where: { date: { gte: lastMon, lte: lastSun } },
  });
  const tripIds = trips.map((t) => t.id);

  // 撈這些場次的訂單統計
  const tripBookings = tripIds.length === 0
    ? []
    : await prisma.booking.findMany({
        where: { type: "daily", refId: { in: tripIds } },
      });

  // 教練績效（依 coachIds 多對多陣列）
  const coachStats = new Map<string, { trips: number; bookings: number }>();
  for (const t of trips) {
    for (const cid of t.coachIds) {
      const s = coachStats.get(cid) ?? { trips: 0, bookings: 0 };
      s.trips += 1;
      coachStats.set(cid, s);
    }
  }
  for (const b of tripBookings) {
    const t = trips.find((x) => x.id === b.refId);
    if (!t) continue;
    for (const cid of t.coachIds) {
      const s = coachStats.get(cid) ?? { trips: 0, bookings: 0 };
      s.bookings += b.participants;
      coachStats.set(cid, s);
    }
  }
  const coaches = await prisma.coach.findMany({
    where: { id: { in: Array.from(coachStats.keys()) } },
  });

  // 潛點熱度（依 diveSiteIds 多對多陣列）
  const siteStats = new Map<string, { trips: number; bookings: number }>();
  for (const t of trips) {
    for (const sid of t.diveSiteIds) {
      const s = siteStats.get(sid) ?? { trips: 0, bookings: 0 };
      s.trips += 1;
      siteStats.set(sid, s);
    }
  }
  for (const b of tripBookings) {
    const t = trips.find((x) => x.id === b.refId);
    if (!t) continue;
    for (const sid of t.diveSiteIds) {
      const s = siteStats.get(sid) ?? { trips: 0, bookings: 0 };
      s.bookings += b.participants;
      siteStats.set(sid, s);
    }
  }
  const sites = await prisma.diveSite.findMany({
    where: { id: { in: Array.from(siteStats.keys()) } },
  });

  // 完成 vs no_show 計算出席率
  const completed = tripBookings.filter((b) => b.status === "completed").length;
  const noShow = tripBookings.filter((b) => b.status === "no_show").length;
  const attendanceRate = completed + noShow > 0 ? Math.round((completed / (completed + noShow)) * 100) : 0;

  // 收件人
  const admins = await prisma.user.findMany({
    where: {
      OR: [{ role: { in: ["admin", "boss"] } }, { roles: { hasSome: ["admin", "boss"] } }],
      deletedAt: null,
      email: { not: null },
      notifyByEmail: true,
    },
  });

  if (admins.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "無 admin/boss 收件人" });
  }

  // 營收：付款核可金額（實收）
  const revenue = verifiedProofs.reduce((s, p) => s + p.amount, 0);

  const html = buildWeeklyHtml({
    weekStr,
    newOrders: bookings.length,
    revenue,
    completed,
    noShow,
    attendanceRate,
    newUsers: newUsers.length,
    topCoaches: Array.from(coachStats.entries())
      .map(([id, s]) => ({
        name: coaches.find((c) => c.id === id)?.realName ?? id.slice(0, 8),
        ...s,
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5),
    topSites: Array.from(siteStats.entries())
      .map(([id, s]) => ({
        name: sites.find((x) => x.id === id)?.name ?? id,
        ...s,
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5),
  });

  const xlsx = await makeMultiSheetXlsxBuffer([
    {
      name: "訂單明細",
      columns: [
        { header: "編號", key: "code", width: 16 },
        { header: "建立日", key: "createdAt", width: 12 },
        { header: "客戶", key: "user", width: 14 },
        { header: "類型", key: "type", width: 8 },
        { header: "人數", key: "participants", width: 6 },
        { header: "總額", key: "total", width: 10 },
        { header: "已付", key: "paid", width: 10 },
        { header: "狀態", key: "status", width: 12 },
      ],
      rows: bookings.map((b) => ({
        code: b.code ?? b.id.slice(0, 8),
        createdAt: new Date(b.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }),
        user: b.user.realName ?? b.user.displayName,
        type: b.type === "daily" ? "日潛" : "潛水團",
        participants: b.participants,
        total: b.totalAmount,
        paid: b.paidAmount,
        status: b.status,
      })),
    },
    {
      name: "教練績效",
      columns: [
        { header: "教練", key: "name", width: 14 },
        { header: "帶團場次", key: "trips", width: 10 },
        { header: "總人次", key: "bookings", width: 10 },
      ],
      rows: Array.from(coachStats.entries())
        .map(([id, s]) => ({
          name: coaches.find((c) => c.id === id)?.realName ?? id.slice(0, 8),
          trips: s.trips,
          bookings: s.bookings,
        }))
        .sort((a, b) => b.bookings - a.bookings),
    },
    {
      name: "潛點熱度",
      columns: [
        { header: "潛點", key: "name", width: 14 },
        { header: "場次數", key: "trips", width: 10 },
        { header: "總人次", key: "bookings", width: 10 },
      ],
      rows: Array.from(siteStats.entries())
        .map(([id, s]) => ({
          name: sites.find((x) => x.id === id)?.name ?? id,
          trips: s.trips,
          bookings: s.bookings,
        }))
        .sort((a, b) => b.bookings - a.bookings),
    },
    {
      name: "新會員",
      columns: [
        { header: "註冊日", key: "createdAt", width: 12 },
        { header: "姓名", key: "name", width: 14 },
        { header: "電話", key: "phone", width: 14 },
        { header: "Email", key: "email", width: 24 },
      ],
      rows: newUsers.map((u) => ({
        createdAt: new Date(u.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }),
        name: u.realName ?? u.displayName,
        phone: u.phone ?? "",
        email: u.email ?? "",
      })),
    },
  ]);

  const subject = `📈 上週週報｜${weekStr}｜${process.env.NEXT_PUBLIC_APP_NAME ?? "海王子"}`;
  const xlsxName = `weekly-${lastMon.toISOString().slice(0, 10)}.xlsx`;

  let sent = 0, failed = 0;
  for (const a of admins) {
    if (!a.email) continue;
    const r = await sendEmail({
      to: a.email,
      subject,
      html,
      text: `上週 (${weekStr}) 統計：\n訂單 ${bookings.length} 筆 · 營收 NT$${revenue.toLocaleString()} · 出席率 ${attendanceRate}% · 新會員 ${newUsers.length} 位\n\n完整資料請見 Excel 附件。`,
      attachments: [
        { filename: xlsxName, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    });
    if (r.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({ ok: true, sent, failed, weekStr });
}

function buildWeeklyHtml(p: {
  weekStr: string;
  newOrders: number;
  revenue: number;
  completed: number;
  noShow: number;
  attendanceRate: number;
  newUsers: number;
  topCoaches: Array<{ name: string; trips: number; bookings: number }>;
  topSites: Array<{ name: string; trips: number; bookings: number }>;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-TW"><head><meta charset="UTF-8"></head>
<body style="font-family:'Helvetica Neue',Arial,'PingFang TC',sans-serif;margin:0;padding:24px;background:#f5f5f5;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0A2342 0%,#1B3A5C 100%);padding:24px 28px;color:#fff;">
      <div style="font-size:11px;letter-spacing:0.3em;color:#00D9CB;">WEEKLY REPORT</div>
      <div style="font-size:20px;font-weight:bold;margin-top:4px;">📈 上週週報</div>
      <div style="font-size:13px;margin-top:4px;opacity:0.8;">${p.weekStr}</div>
    </div>
    <div style="padding:24px 28px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px;">
        ${weeklyCard("營收", `NT$${p.revenue.toLocaleString()}`, `${p.newOrders} 筆訂單`)}
        ${weeklyCard("出席率", `${p.attendanceRate}%`, `${p.completed}/${p.completed + p.noShow}`)}
        ${weeklyCard("新會員", `+${p.newUsers}`, "位")}
        ${weeklyCard("未到場", `${p.noShow}`, "筆")}
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#0A2342;">🏆 教練績效 Top 5</div>
        ${rankTable(p.topCoaches, "教練", "場次", "人次")}
      </div>

      <div style="margin-bottom:20px;">
        <div style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#0A2342;">🔥 熱門潛點 Top 5</div>
        ${rankTable(p.topSites, "潛點", "場次", "人次")}
      </div>

      <p style="margin-top:24px;color:#6b7280;font-size:12px;">
        完整資料請見附件 Excel（訂單明細 / 教練績效 / 潛點熱度 / 新會員）。
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;">
      ${process.env.NEXT_PUBLIC_APP_NAME ?? "海王子"} · 每週日 18:00 自動寄送（規劃下週用）
    </div>
  </div>
</body></html>`;
}

function weeklyCard(label: string, val: string, sub: string): string {
  return `<div style="background:#f9fafb;padding:12px;border-radius:6px;text-align:center;">
    <div style="font-size:10px;color:#6b7280;">${label}</div>
    <div style="font-size:18px;font-weight:bold;color:#0A2342;margin:2px 0;">${val}</div>
    <div style="font-size:10px;color:#9ca3af;">${sub}</div>
  </div>`;
}

function rankTable(items: Array<{ name: string; trips: number; bookings: number }>, h1: string, h2: string, h3: string): string {
  if (items.length === 0) {
    return `<div style="padding:14px;background:#f9fafb;border-radius:4px;color:#6b7280;font-size:12px;text-align:center;">尚無資料</div>`;
  }
  const rows = items
    .map(
      (item, i) =>
        `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};">
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${i + 1}.</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${item.name}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;">${item.trips}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:bold;color:#00D9CB;">${item.bookings}</td>
        </tr>`,
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-radius:4px;overflow:hidden;">
    <thead><tr>
      <th style="padding:8px;background:#0A2342;color:#fff;font-size:11px;text-align:left;width:30px;">#</th>
      <th style="padding:8px;background:#0A2342;color:#fff;font-size:11px;text-align:left;">${h1}</th>
      <th style="padding:8px;background:#0A2342;color:#fff;font-size:11px;text-align:right;width:60px;">${h2}</th>
      <th style="padding:8px;background:#0A2342;color:#fff;font-size:11px;text-align:right;width:60px;">${h3}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
