import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { makeMultiSheetXlsxBuffer } from "@/lib/email/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/daily-orders-email
 *
 * 每天 21:00 Asia/Taipei 寄今日訂單摘要給所有 admin/boss
 *
 * 內容：
 *   HTML 表格：今日新增訂單、付款核可、退款、待結算清單
 *   Excel 附件：今日所有訂單明細
 *
 * 認證：Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!emailConfigured()) {
    return NextResponse.json({ ok: true, note: "Email 未設定，skip" });
  }

  // 取今日範圍（Asia/Taipei 00:00 ~ 23:59）
  // 用 ISO 字串轉換相對精確
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
  const todayStart = new Date(`${todayStr}T00:00:00+08:00`);
  const todayEnd = new Date(`${todayStr}T23:59:59+08:00`);

  // 撈今天的訂單
  const newBookings = await prisma.booking.findMany({
    where: { createdAt: { gte: todayStart, lte: todayEnd } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { realName: true, displayName: true, phone: true } } },
  });

  // 撈今天 verified 的付款憑證
  const verifiedProofs = await prisma.paymentProof.findMany({
    where: { verifiedAt: { gte: todayStart, lte: todayEnd } },
    include: { booking: { include: { user: true } } },
  });

  // 撈今天的退款
  const refunds = await prisma.booking.findMany({
    where: { refundedAt: { gte: todayStart, lte: todayEnd } },
    include: { user: true },
  });

  // 撈所有「過期未結算」的訂單（pending/confirmed 但場次/團已過）
  const pastTripStart = new Date(`${todayStr}T00:00:00+08:00`);
  const pendingTrips = await prisma.divingTrip.findMany({
    where: { date: { lt: pastTripStart } },
    select: { id: true, date: true, startTime: true },
  });
  const pendingTripIds = pendingTrips.map((t) => t.id);
  const pendingTripMap = new Map(pendingTrips.map((t) => [t.id, t]));
  const pendingBookings = pendingTripIds.length === 0
    ? []
    : await prisma.booking.findMany({
        where: {
          type: "daily",
          refId: { in: pendingTripIds },
          status: { in: ["pending", "confirmed"] },
        },
        include: { user: true },
      });

  // 撈所有 admin/boss
  const admins = await prisma.user.findMany({
    where: {
      OR: [
        { role: { in: ["admin", "boss"] } },
        { roles: { hasSome: ["admin", "boss"] } },
      ],
      deletedAt: null,
      email: { not: null },
      notifyByEmail: true,
    },
  });
  if (admins.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "無 admin/boss 收件人" });
  }

  // 組 HTML 摘要
  const html = buildHtmlSummary({
    todayStr,
    newBookings,
    verifiedProofs,
    refunds,
    pendingBookings: pendingBookings.map((b) => ({
      ...b,
      tripDate: pendingTripMap.get(b.refId)?.date,
      tripTime: pendingTripMap.get(b.refId)?.startTime,
    })),
  });

  // 組 Excel
  const xlsx = await makeMultiSheetXlsxBuffer([
    {
      name: "今日新訂單",
      columns: [
        { header: "訂單編號", key: "code", width: 16 },
        { header: "建立時間", key: "createdAt", width: 18 },
        { header: "客戶", key: "user", width: 14 },
        { header: "電話", key: "phone", width: 14 },
        { header: "類型", key: "type", width: 8 },
        { header: "人數", key: "participants", width: 6 },
        { header: "總額", key: "total", width: 10 },
        { header: "已付", key: "paid", width: 10 },
        { header: "付款狀態", key: "payStatus", width: 12 },
        { header: "訂單狀態", key: "status", width: 12 },
      ],
      rows: newBookings.map((b) => ({
        code: b.code ?? b.id.slice(0, 8),
        createdAt: new Date(b.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
        user: b.user.realName ?? b.user.displayName,
        phone: b.user.phone ?? "",
        type: b.type === "daily" ? "日潛" : "潛水團",
        participants: b.participants,
        total: b.totalAmount,
        paid: b.paidAmount,
        payStatus: b.paymentStatus,
        status: b.status,
      })),
    },
    {
      name: "付款核可",
      columns: [
        { header: "訂單編號", key: "code", width: 16 },
        { header: "客戶", key: "user", width: 14 },
        { header: "金額", key: "amount", width: 10 },
        { header: "類型", key: "type", width: 8 },
        { header: "核可時間", key: "verifiedAt", width: 18 },
      ],
      rows: verifiedProofs.map((p) => ({
        code: p.booking.code ?? p.bookingId.slice(0, 8),
        user: p.booking.user.realName ?? p.booking.user.displayName,
        amount: p.amount,
        type: p.type === "deposit" ? "訂金" : p.type === "final" ? "尾款" : "退款",
        verifiedAt: p.verifiedAt ? new Date(p.verifiedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "",
      })),
    },
    {
      name: "退款",
      columns: [
        { header: "訂單編號", key: "code", width: 16 },
        { header: "客戶", key: "user", width: 14 },
        { header: "退款金額", key: "refundAmount", width: 10 },
        { header: "方式", key: "method", width: 8 },
        { header: "原因", key: "reason", width: 30 },
      ],
      rows: refunds.map((b) => ({
        code: b.code ?? b.id.slice(0, 8),
        user: b.user.realName ?? b.user.displayName,
        refundAmount: b.refundAmount ?? 0,
        method: b.refundMethod === "cash" ? "現金" : "抵用金",
        reason: b.cancellationReason ?? "",
      })),
    },
    {
      name: "待結算",
      columns: [
        { header: "訂單編號", key: "code", width: 16 },
        { header: "客戶", key: "user", width: 14 },
        { header: "場次日期", key: "tripDate", width: 12 },
        { header: "場次時間", key: "tripTime", width: 10 },
        { header: "總額", key: "total", width: 10 },
        { header: "已付", key: "paid", width: 10 },
        { header: "狀態", key: "status", width: 12 },
      ],
      rows: pendingBookings.map((b) => {
        const trip = pendingTripMap.get(b.refId);
        return {
          code: b.code ?? b.id.slice(0, 8),
          user: b.user.realName ?? b.user.displayName,
          tripDate: trip ? trip.date.toISOString().slice(0, 10) : "",
          tripTime: trip?.startTime ?? "",
          total: b.totalAmount,
          paid: b.paidAmount,
          status: b.status,
        };
      }),
    },
  ]);

  const subject = `📊 ${todayStr} 訂單日報｜${process.env.NEXT_PUBLIC_APP_NAME ?? "海王子"}`;
  const xlsxName = `orders-${todayStr.replace(/-/g, "")}.xlsx`;

  // 寄給每位 admin
  let sent = 0;
  let failed = 0;
  for (const a of admins) {
    if (!a.email) continue;
    const r = await sendEmail({
      to: a.email,
      subject,
      html,
      text: `${todayStr} 訂單日報\n新訂單 ${newBookings.length} 筆 / 付款核可 ${verifiedProofs.length} 筆 / 退款 ${refunds.length} 筆 / 待結算 ${pendingBookings.length} 筆\n\n詳細請見 Excel 附件。`,
      attachments: [
        { filename: xlsxName, content: xlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    });
    if (r.ok) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    summary: {
      newBookings: newBookings.length,
      verifiedProofs: verifiedProofs.length,
      refunds: refunds.length,
      pendingBookings: pendingBookings.length,
    },
  });
}

interface OrderRow {
  code: string | null;
  id: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  status: string;
  participants: number;
  user: { realName: string | null; displayName: string; phone?: string | null };
}

function buildHtmlSummary(params: {
  todayStr: string;
  newBookings: OrderRow[];
  verifiedProofs: Array<{ amount: number; type: string; booking: OrderRow }>;
  refunds: Array<{ code: string | null; id: string; refundAmount: number | null; refundMethod: string | null; cancellationReason: string | null; user: { realName: string | null; displayName: string } }>;
  pendingBookings: Array<{ code: string | null; id: string; totalAmount: number; paidAmount: number; status: string; tripDate?: Date; tripTime?: string; user: { realName: string | null; displayName: string } }>;
}): string {
  const newTotal = params.newBookings.reduce((s, b) => s + b.totalAmount, 0);
  const verifiedTotal = params.verifiedProofs.reduce((s, p) => s + p.amount, 0);
  const refundTotal = params.refunds.reduce((s, b) => s + (b.refundAmount ?? 0), 0);

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Helvetica Neue',Arial,'PingFang TC','Microsoft JhengHei',sans-serif;margin:0;padding:24px;background:#f5f5f5;color:#1f2937;">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#0A2342 0%,#1B3A5C 100%);padding:24px 28px;color:#fff;">
      <div style="font-size:11px;letter-spacing:0.3em;color:#00D9CB;">DAILY REPORT</div>
      <div style="font-size:20px;font-weight:bold;margin-top:4px;">📊 ${params.todayStr} 訂單日報</div>
    </div>
    <div style="padding:24px 28px;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:24px;">
        ${statCard("新訂單", params.newBookings.length, `NT$${newTotal.toLocaleString()}`)}
        ${statCard("付款核可", params.verifiedProofs.length, `NT$${verifiedTotal.toLocaleString()}`)}
        ${statCard("退款", params.refunds.length, `NT$${refundTotal.toLocaleString()}`)}
        ${statCard("待結算", params.pendingBookings.length, "請處理")}
      </div>

      ${section("🆕 今日新增訂單", buildTable(
        ["編號", "客戶", "類型", "人數", "總額", "狀態"],
        params.newBookings.slice(0, 20).map((b) => [
          b.code ?? b.id.slice(0,8),
          b.user.realName ?? b.user.displayName,
          "—",
          String(b.participants),
          `NT$${b.totalAmount.toLocaleString()}`,
          b.status,
        ]),
        params.newBookings.length === 0 ? "今日無新訂單" : params.newBookings.length > 20 ? `（僅顯示前 20 筆，共 ${params.newBookings.length} 筆，完整資料請見 Excel）` : "",
      ))}

      ${section("⚠️ 待結算（場次已過但訂單仍 pending/confirmed）", buildTable(
        ["編號", "客戶", "場次", "總額", "已付"],
        params.pendingBookings.slice(0, 20).map((b) => [
          b.code ?? b.id.slice(0,8),
          b.user.realName ?? b.user.displayName,
          b.tripDate ? `${b.tripDate.toISOString().slice(0,10)} ${b.tripTime ?? ""}` : "—",
          `NT$${b.totalAmount.toLocaleString()}`,
          `NT$${b.paidAmount.toLocaleString()}`,
        ]),
        params.pendingBookings.length === 0 ? "✓ 全部結算完畢" : "",
      ))}

      <p style="margin-top:24px;color:#6b7280;font-size:12px;">
        完整訂單明細請見附件 Excel 檔。
        <br>進後台處理：${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/admin/bookings
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;color:#9ca3af;font-size:11px;text-align:center;">
      ${process.env.NEXT_PUBLIC_APP_NAME ?? "海王子潛水團"} · 自動寄送
    </div>
  </div>
</body>
</html>`;
}

function statCard(label: string, count: number, sub: string): string {
  return `<div style="background:#f9fafb;padding:12px;border-radius:6px;text-align:center;">
    <div style="font-size:10px;color:#6b7280;">${label}</div>
    <div style="font-size:20px;font-weight:bold;color:#0A2342;margin:2px 0;">${count}</div>
    <div style="font-size:10px;color:#9ca3af;">${sub}</div>
  </div>`;
}

function section(title: string, body: string): string {
  return `<div style="margin-bottom:20px;">
    <div style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#0A2342;">${title}</div>
    ${body}
  </div>`;
}

function buildTable(headers: string[], rows: string[][], emptyMsg: string): string {
  if (rows.length === 0) {
    return `<div style="padding:14px;background:#f9fafb;border-radius:4px;color:#6b7280;font-size:12px;text-align:center;">${emptyMsg || "無資料"}</div>`;
  }
  const headerHtml = headers
    .map((h) => `<th style="padding:8px;background:#0A2342;color:#fff;font-size:11px;text-align:left;">${h}</th>`)
    .join("");
  const rowHtml = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};">${r
          .map((cell) => `<td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;">${cell}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  let footer = "";
  if (emptyMsg && rows.length > 0) {
    footer = `<div style="margin-top:6px;color:#9ca3af;font-size:11px;text-align:right;">${emptyMsg}</div>`;
  }
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-radius:4px;overflow:hidden;">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${rowHtml}</tbody>
  </table>${footer}`;
}
