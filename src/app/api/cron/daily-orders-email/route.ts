import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/safe-compare";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { makeMultiSheetXlsxBuffer } from "@/lib/email/excel";
import { BUSINESS } from "@/lib/business-info"; // v856：Email logo
import { deriveBookingDisplay } from "@/lib/booking-status"; // v861：狀態顯示中文（與後台同一套）

// v861：日報原本直接印資料庫 enum（pending / awaiting_verify …）→ 老闆看不懂。
//   訂單狀態一律走全站共用的 deriveBookingDisplay（與後台顯示完全一致）。
function statusLabel(b: { status: string; paymentStatus: string; createdAt: Date | string }): string {
  return deriveBookingDisplay({ status: b.status, paymentStatus: b.paymentStatus, createdAt: b.createdAt }).label;
}

// 付款狀態（Excel 另有獨立欄位；deriveBookingDisplay 是合併後的單一標籤，故這裡另外對照）
const PAY_STATUS_ZH: Record<string, string> = {
  pending: "未付款",
  deposit_paid: "已付訂金",
  fully_paid: "已付清",
  refunding: "退款處理中",
  refunded: "已退款",
};
const payStatusLabel = (s: string) => PAY_STATUS_ZH[s] ?? s;

const typeLabel = (t: string) => (t === "daily" ? "日潛" : t === "tour" ? "潛水團" : "—");

// v865：老闆帳務調整（例：共乘 +300 / 補上次沒潛水 −600）存在 booking.priceBreakdown.bossAdjustments。
//   日報的「客戶備註」欄自動附上，讓老闆看日報就知道這筆有特別收費/折讓，不用再點進訂單。
function adjustmentsText(priceBreakdown: unknown): string {
  const pb = priceBreakdown as { bossAdjustments?: Array<{ label?: unknown; amount?: unknown }> } | null;
  const list = Array.isArray(pb?.bossAdjustments) ? pb.bossAdjustments : [];
  return list
    .filter((a) => typeof a?.label === "string" && typeof a?.amount === "number")
    .map((a) => {
      const amt = a.amount as number;
      return `${a.label as string} ${amt > 0 ? "+" : "−"}NT$${Math.abs(amt).toLocaleString()}`;
    })
    .join("、");
}

/** v865：客戶備註欄 = 客戶自填備註 ＋ 老闆帳務調整（任一有就顯示，都沒有回「—」） */
function noteCell(b: { notes?: string | null; priceBreakdown?: unknown }, esc: (s: string) => string): string {
  const parts: string[] = [];
  const note = (b.notes ?? "").trim();
  if (note) parts.push(`📝 ${esc(note)}`);
  const adj = adjustmentsText(b.priceBreakdown);
  if (adj) parts.push(`🧮 ${esc(adj)}`);
  return parts.length ? parts.join("<br>") : "—";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  if (!process.env.CRON_SECRET || !safeEqual(authHeader, `Bearer ${process.env.CRON_SECRET}`)) {
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

  // v865：新訂單要顯示「日期時間 / 場次名稱」→ 撈對應的場次(日潛)與潛旅(tour)。
  //   日潛 diveSiteIds 可能存 DiveSite.id 或直接存中文名(v153 起)，查得到用站名、查不到用原字串。
  const newTripIds = newBookings.filter((b) => b.type === "daily").map((b) => b.refId);
  const newTourIds = newBookings.filter((b) => b.type === "tour").map((b) => b.refId);
  const [newTrips, newTours] = await Promise.all([
    newTripIds.length
      ? prisma.divingTrip.findMany({
          where: { id: { in: newTripIds } },
          select: { id: true, date: true, startTime: true, diveSiteIds: true, isNightDive: true, isScooter: true },
        })
      : Promise.resolve([]),
    newTourIds.length
      ? prisma.tourPackage.findMany({
          where: { id: { in: newTourIds } },
          select: { id: true, title: true, dateStart: true },
        })
      : Promise.resolve([]),
  ]);
  const newSiteIds = [...new Set(newTrips.flatMap((t) => t.diveSiteIds))];
  const newSites = newSiteIds.length
    ? await prisma.diveSite.findMany({ where: { id: { in: newSiteIds } }, select: { id: true, name: true } })
    : [];
  const siteNameMap = new Map(newSites.map((s) => [s.id, s.name]));
  const newTripMap = new Map(newTrips.map((t) => [t.id, t]));
  const newTourMap = new Map(newTours.map((t) => [t.id, t]));

  /** 場次日期時間（台灣時間）。日潛＝日期＋開始時間；潛旅＝出發日 */
  function sessionWhen(b: { type: string; refId: string }): string {
    if (b.type === "daily") {
      const t = newTripMap.get(b.refId);
      if (!t) return "—";
      return `${t.date.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })} ${t.startTime}`;
    }
    const t = newTourMap.get(b.refId);
    return t ? t.dateStart.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }) : "—";
  }
  /** 場次名稱。日潛＝潛點(＋夜潛/水推標記)；潛旅＝團名 */
  function sessionName(b: { type: string; refId: string }): string {
    if (b.type === "daily") {
      const t = newTripMap.get(b.refId);
      if (!t) return "—";
      const site = t.diveSiteIds.map((id) => siteNameMap.get(id) ?? id).join("／") || "東北角";
      const extra = `${t.isNightDive ? " 夜潛" : ""}${t.isScooter ? " 水推" : ""}`;
      return site + extra;
    }
    return newTourMap.get(b.refId)?.title ?? "—";
  }

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
        { role: { in: ["admin", "boss", "it"] } },
        { roles: { hasSome: ["admin", "boss", "it"] } },
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
    sessionWhen, // v865
    sessionName, // v865
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
        // v865：與 Email 表格一致 —— 場次資訊 + 扣抵/實付分開
        { header: "日期時間", key: "when", width: 18 },
        { header: "場次名稱", key: "session", width: 20 },
        { header: "人數", key: "participants", width: 6 },
        { header: "總額", key: "total", width: 10 },
        { header: "扣抵金額", key: "credit", width: 10 },
        { header: "實際付款金額", key: "cashPaid", width: 13 },
        { header: "付款狀態", key: "payStatus", width: 12 },
        { header: "訂單狀態", key: "status", width: 12 },
        { header: "客戶備註", key: "notes", width: 32 }, // v837；v865 併老闆帳務調整
      ],
      rows: newBookings.map((b) => {
        const adj = adjustmentsText(b.priceBreakdown);
        return {
          code: b.code ?? b.id.slice(0, 8),
          createdAt: new Date(b.createdAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
          user: b.user.realName ?? b.user.displayName,
          phone: b.user.phone ?? "",
          type: typeLabel(b.type),
          when: sessionWhen(b),
          session: sessionName(b),
          participants: b.participants,
          total: b.totalAmount,
          credit: b.creditUsed,
          // v865：實際付款金額＝已付總額 − 抵用金折抵（原本的「已付」含抵用金，
          //   與「扣抵金額」並列會重複計算，看起來像收了兩次錢）
          cashPaid: Math.max(0, b.paidAmount - b.creditUsed),
          payStatus: payStatusLabel(b.paymentStatus), // v861
          status: statusLabel(b),                     // v861
          notes: [b.notes?.trim(), adj ? `【帳務調整】${adj}` : ""].filter(Boolean).join(" / "),
        };
      }),
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
          status: statusLabel(b), // v861
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
  type: string;              // v861：daily / tour（查詢用 include，資料本來就有）
  refId: string;             // v865：對應場次/潛旅 id（查日期時間與場次名稱）
  createdAt: Date | string;  // v861：deriveBookingDisplay 需要（分辨 建立訂單 / 等待付款）
  totalAmount: number;
  paidAmount: number;
  creditUsed: number;        // v865：扣抵金額
  priceBreakdown?: unknown;  // v865：老闆帳務調整（共乘等）在這裡
  paymentStatus: string;
  status: string;
  participants: number;
  notes?: string | null; // v837：客戶下單備註
  user: { realName: string | null; displayName: string; phone?: string | null };
}

function buildHtmlSummary(params: {
  todayStr: string;
  sessionWhen: (b: { type: string; refId: string }) => string; // v865
  sessionName: (b: { type: string; refId: string }) => string; // v865
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
    <!-- v856：頁首改用專屬 logo（PNG；Outlook 不吃 WebP、不支援 flex → 用 table） -->
    <div style="background:linear-gradient(135deg,#0A2342 0%,#1B3A5C 100%);padding:22px 28px;color:#fff;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="38" style="padding-right:12px;vertical-align:middle;">
          <img src="${BUSINESS.logoPng}" alt="東北角海王子潛水" width="38" height="38" style="width:38px;height:38px;border-radius:9px;display:block;">
        </td>
        <td style="vertical-align:middle;">
          <div style="font-size:11px;letter-spacing:0.3em;color:#00D9CB;">DAILY REPORT</div>
          <div style="font-size:20px;font-weight:bold;margin-top:2px;">${params.todayStr} 訂單日報</div>
        </td>
      </tr></table>
    </div>
    <div style="padding:24px 28px;">
      <!-- v854：改 table 橫排（Outlook 不支援 grid，避免逐張直排把版面拉高）；每張卡壓成「標題一行＋數字一行」 -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;table-layout:fixed;"><tr>
        ${statCard("新訂單", params.newBookings.length, `NT$${newTotal.toLocaleString()}`)}
        ${statCard("付款核可", params.verifiedProofs.length, `NT$${verifiedTotal.toLocaleString()}`)}
        ${statCard("退款", params.refunds.length, `NT$${refundTotal.toLocaleString()}`)}
        ${statCard("待結算", params.pendingBookings.length, "請處理")}
      </tr></table>

      ${section("🆕 今日新增訂單", buildTable(
        // v865：加「日期時間 / 場次名稱」(老闆一眼看出是哪一場) + 「扣抵金額 / 實際付款金額」
        ["編號", "客戶", "類型", "日期時間", "場次名稱", "人數", "總額", "扣抵金額", "實際付款金額", "狀態", "客戶備註"],
        params.newBookings.slice(0, 20).map((b) => [
          b.code ?? b.id.slice(0,8),
          b.user.realName ?? b.user.displayName,
          typeLabel(b.type),  // v861：原本寫死 "—"
          params.sessionWhen(b),
          params.sessionName(b),
          String(b.participants),
          `NT$${b.totalAmount.toLocaleString()}`,
          b.creditUsed > 0 ? `− NT$${b.creditUsed.toLocaleString()}` : "—",
          `NT$${Math.max(0, b.paidAmount - b.creditUsed).toLocaleString()}`, // 實收的錢(不含抵用金)
          statusLabel(b),     // v861：原本直接印英文 enum
          noteCell(b, (s) => s.replace(/</g, "&lt;")), // v837 客戶備註；v865 併老闆帳務調整
        ]),
        params.newBookings.length === 0 ? "今日無新訂單" : params.newBookings.length > 20 ? `（僅顯示前 20 筆，共 ${params.newBookings.length} 筆，完整資料請見 Excel）` : "",
      ))}

      ${section("⚠️ 待結算（場次已過，訂單還沒結案）", buildTable(
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
  // v854：email 相容橫排卡 —— 一律回 <td>，內部只兩行：標題一行、數字(含金額)一行
  return `<td width="25%" valign="top" style="padding:0 3px;">
    <div style="background:#f9fafb;padding:8px 6px;border-radius:6px;text-align:center;">
      <div style="font-size:10px;color:#6b7280;line-height:1.2;">${label}</div>
      <div style="line-height:1.15;margin-top:2px;"><span style="font-size:18px;font-weight:bold;color:#0A2342;">${count}</span><span style="font-size:10px;color:#9ca3af;font-weight:normal;">　${sub}</span></div>
    </div>
  </td>`;
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
