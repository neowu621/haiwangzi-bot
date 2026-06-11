import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildFlexByKeyAsync, FLEX_TEMPLATES, FLEX_TEMPLATE_LABELS, FLEX_TEMPLATE_META } from "@/lib/flex";
import { getLineClient } from "@/lib/line";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { logMessage } from "@/lib/message-log"; // v474：試送也記入發送紀錄

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.string(),
  channel: z.enum(["line", "email", "inApp"]).default("line"),
});

// v474：LIFF 深連結（動態從 env 讀）
const LIFF_URL = (() => {
  const id = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
  return id ? `https://liff.line.me/${id}` : "https://liff.line.me";
})();
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://haiwangzi.xyz";

// v474：全部 19 個模板都有完整真實樣本參數，讓 LINE / Email / 站內試送都呈現真實內容
const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  booking_confirm: { name: "王小明", date: "2026-06-14", time: "08:30", site: "龍洞灣 體驗潛水", total: 2400, url: `${APP_BASE}/liff/my` },
  d1_reminder: { date: "2026-06-14", time: "08:30", site: "深澳", weather: "晴時多雲", wave: "0.5 m", water: "27°C", vis: "8-12 m", gather: "深澳漁港停車場 07:50" },
  deposit_notice: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", deposit: 8000, deadline: "2026-09-01", bankName: "玉山銀行（808）", bankAccount: "0163-979-251023", holder: "汪○○", refCode: "HW-2409", url: `${APP_BASE}/liff/my` },
  deposit_confirm: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", paid: 8000, remaining: 9000, finalDeadline: "2026-09-15" },
  final_reminder: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", remaining: 9000, deadline: "2026-09-15", daysLeft: 3, bankAccount: "0163-979-251023", url: `${APP_BASE}/liff/my` },
  trip_guide: { tourTitle: "蘭嶼四天三夜潛旅（中秋）", gather: "後壁湖碼頭 07:00", transport: "藍鯨號客輪", hotel: "蘭嶼海景民宿", leader: "汪教練", phone: "0988-346-634" },
  weather_cancel: { date: "2026-06-14", time: "08:30", site: "鶯歌石", reason: "今日東北風 6 級、浪高 1.8 m，海況不適合下水", options: "🅰️ 改期 🅱️ 全額退費 / 轉抵用金 +10%", url: `${APP_BASE}/liff/my` },
  admin_weekly: { weekRange: "2026-06-02 ~ 06-08", revenue: 86400, bookings: 23, newMembers: 6, pending: 3 },
  overcap_alert: { tripDate: "2026-06-14", tripTime: "08:30", site: "鶯歌石", customerName: "王小明", requestedCount: 2, currentBooked: 8, capacity: 8, url: `${APP_BASE}/liff/coach/today` },
  welcome: { liffUrl: LIFF_URL },
  attendance_confirmed: { bookingTitle: "6/14 龍洞灣 體驗潛水", addLogs: 2, totalLogs: 38, vipLevel: "LV2 小丑魚", liffUrl: LIFF_URL },
  first_order_reward_grant: { amount: 100, balance: 100, expiresAt: "2027-06-14", bookingTitle: "6/14 龍洞灣 體驗潛水", liffUrl: LIFF_URL },
  refund_request: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2400, method: "credit", creditBonus: 10, reason: "臨時有事無法參加", liffUrl: LIFF_URL },
  payment_reject: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "轉帳金額與應繳不符（少 200 元），請確認後重新上傳", liffUrl: LIFF_URL },
  booking_cancel: { bookingTitle: "6/14 龍洞灣 體驗潛水", reason: "因人數不足取消，造成不便敬請見諒", liffUrl: LIFF_URL },
  refund_complete: { bookingTitle: "6/14 龍洞灣 體驗潛水", amount: 2640, method: "credit", liffUrl: LIFF_URL },
  vip_upgrade: { tierName: "LV3 海龜", tierEmoji: "🐢", benefits: "每筆訂單 95 折・生日禮金 200・優先候補", liffUrl: LIFF_URL },
  birthday_credit: { amount: 200, expiryDays: 90, liffUrl: LIFF_URL },
  credit_expiry: { amount: 300, expireDate: "2026/06/30", liffUrl: LIFF_URL },
};

// v468：模板的「實際 Flex 內容」常數 — LINE / Email / 站內通知三通道共用，確保內容一致
const HERO_EMOJI: Record<string, string> = {
  welcome: "🌊", booking_confirm: "✅", deposit_notice: "💰", deposit_confirm: "✅",
  final_reminder: "⏰", trip_guide: "📘", d1_reminder: "🤿", weather_cancel: "🌊",
  overcap_alert: "⚠️", admin_weekly: "📊",
};
const EXTRA_LINES: Record<string, string[]> = {
  welcome: [
    "📅 日潛預約：選日期 → 選場次 → 一鍵搞定",
    "✈️ 旅遊潛水：蘭嶼 / 綠島 / 墾丁 多日團",
    "💳 上傳轉帳截圖，教練即時核對",
    "🔔 行前一天自動提醒，海況即時推播",
  ],
  trip_guide: [
    "🎒 攜帶：證照、防寒衣、防曬",
    "📍 集合地點 / 交通方式：依場次說明",
    "📞 緊急聯絡：教練電話於行前通知",
  ],
  weather_cancel: [
    "🅰️ 退現金 100%",
    "🅱️ 轉抵用金 110%（推薦，多 10% 優惠）",
  ],
};
const EXTRA_FOOTER: Record<string, string> = {
  welcome: "安全．專業．陪你看見海",
};

// v474：把模板動態樣本資料組成可讀內文，讓「模擬發送」每個模板都呈現真實內容
const methodZh = (m?: string) => (m === "credit" ? "轉抵用金" : m === "cash" ? "退現金" : m ?? "");
function buildSampleBody(key: string, p: Record<string, string>): string {
  switch (key) {
    // ── 一日潛水（一次付清）/ 預約 ──
    case "booking_confirm":
      return `預約場次：${p.site ?? ""}\n出發時間：${p.date ?? ""} ${p.time ?? ""}\n應付金額：NT$ ${p.total ?? ""}（一次付清）`;
    case "d1_reminder":
      return `明日場次：${p.date ?? ""} ${p.time ?? ""}・${p.site ?? ""}\n天氣 ${p.weather ?? ""}・浪高 ${p.wave ?? ""}・水溫 ${p.water ?? ""}・能見度 ${p.vis ?? ""}\n集合：${p.gather ?? ""}`;
    case "attendance_confirmed":
      return `${p.bookingTitle ?? ""}\n本次 +${p.addLogs ?? ""} 潛・海王子累積 ${p.totalLogs ?? ""} 潛\n會員等級：${p.vipLevel ?? ""}`;
    // ── 旅遊潛水（訂金 + 尾款）──
    case "deposit_notice":
      return `旅遊團：${p.tourTitle ?? ""}\n應繳訂金：NT$ ${p.deposit ?? ""}\n繳費截止：${p.deadline ?? ""}\n匯款：${p.bankName ?? ""} ${p.bankAccount ?? ""}（戶名 ${p.holder ?? ""}）\n備註碼：${p.refCode ?? ""}`;
    case "deposit_confirm":
      return `旅遊團：${p.tourTitle ?? ""}\n已收訂金：NT$ ${p.paid ?? ""}\n尾款餘額：NT$ ${p.remaining ?? ""}\n尾款截止：${p.finalDeadline ?? ""}`;
    case "final_reminder":
      return `旅遊團：${p.tourTitle ?? ""}\n應繳尾款：NT$ ${p.remaining ?? ""}\n繳清截止：${p.deadline ?? ""}（剩 ${p.daysLeft ?? ""} 天）\n匯款帳號：${p.bankAccount ?? ""}`;
    case "trip_guide":
      return `旅遊團：${p.tourTitle ?? ""}\n集合：${p.gather ?? ""}\n交通：${p.transport ?? ""}・住宿：${p.hotel ?? ""}\n領隊：${p.leader ?? ""}（${p.phone ?? ""}）`;
    // ── 異常 / 退款 ──
    case "weather_cancel":
      return `取消場次：${p.date ?? ""} ${p.time ?? ""}・${p.site ?? ""}\n原因：${p.reason ?? ""}\n選項：${p.options ?? ""}`;
    case "payment_reject":
      return `訂單：${p.bookingTitle ?? ""}\n駁回原因：${p.reason ?? ""}\n請依正確金額重新上傳付款證明。`;
    case "booking_cancel":
      return `訂單：${p.bookingTitle ?? ""}\n取消原因：${p.reason ?? ""}`;
    case "refund_request":
      return `訂單：${p.bookingTitle ?? ""}\n退款方式：${methodZh(p.method)}${p.creditBonus ? `（加成 +${p.creditBonus}%）` : ""}\n退款金額：NT$ ${p.amount ?? ""}\n原因：${p.reason ?? ""}\n請進 App 確認此退款。`;
    case "refund_complete":
      return `訂單：${p.bookingTitle ?? ""}\n退款方式：${methodZh(p.method)}\n退款金額：NT$ ${p.amount ?? ""}（已完成）`;
    // ── 會員權益 ──
    case "first_order_reward_grant":
      return `恭喜完成首次潛水：${p.bookingTitle ?? ""}\n獲得抵用金 NT$ ${p.amount ?? ""}\n目前餘額：NT$ ${p.balance ?? ""}\n有效期限：${p.expiresAt ?? ""}`;
    case "vip_upgrade":
      return `恭喜升等為 ${p.tierEmoji ?? ""} ${p.tierName ?? ""}！\n專屬權益：${p.benefits ?? ""}`;
    case "birthday_credit":
      return `生日快樂！🎂\n送你生日禮金 NT$ ${p.amount ?? ""}\n${p.expiryDays && p.expiryDays !== "0" ? `有效 ${p.expiryDays} 天` : "永久有效"}`;
    case "credit_expiry":
      return `提醒：你有抵用金 NT$ ${p.amount ?? ""} 即將到期\n到期日：${p.expireDate ?? ""}\n記得在到期前預約使用喔！`;
    // ── 內部 ──
    case "overcap_alert":
      return `⚠️ 場次超賣提醒\n場次：${p.tripDate ?? ""} ${p.tripTime ?? ""}・${p.site ?? ""}\n客戶：${p.customerName ?? ""} 想預約 ${p.requestedCount ?? ""} 人\n目前：已訂 ${p.currentBooked ?? ""} / 上限 ${p.capacity ?? ""} 人`;
    case "admin_weekly":
      return `📊 本週營運摘要（${p.weekRange ?? ""}）\n・營收：NT$ ${p.revenue ?? ""}\n・新增預約：${p.bookings ?? ""} 筆\n・新會員：${p.newMembers ?? ""} 位\n・待處理：${p.pending ?? ""} 筆`;
    default:
      return "";
  }
}

// POST /api/admin/templates/test-send - 預覽（推給 admin 自己）
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { key, channel } = BodySchema.parse(await req.json());
  if (!(key in FLEX_TEMPLATES)) {
    return NextResponse.json({ error: "unknown template key" }, { status: 400 });
  }

  const params = SAMPLE_PARAMS[key] ?? {};
  const label = FLEX_TEMPLATE_LABELS[key as keyof typeof FLEX_TEMPLATE_LABELS] ?? key;

  // ─── LINE ────────────────────────────────────────────────────────
  if (channel === "line") {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" }, { status: 503 });
    }
    const msg = await buildFlexByKeyAsync(
      key as keyof typeof FLEX_TEMPLATES,
      params,
      "（測試）" + label,
    );
    try {
      const client = getLineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.pushMessage({ to: auth.user.lineUserId, messages: [msg as any] });
      logMessage({ channel: "line", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${label}`, status: "sent", source: "test" });
      return NextResponse.json({ ok: true, channel: "line", sentTo: auth.user.lineUserId });
    } catch (e) {
      logMessage({ channel: "line", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${label}`, status: "failed", error: e instanceof Error ? e.message : String(e), source: "test" });
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // ─── 站內通知（第三通道）─────────────────────────────────────────
  if (channel === "inApp") {
    const override = await prisma.messageTemplate.findUnique({ where: { key } });
    const title = override?.title ?? label;
    const p = params as Record<string, string>;
    // v468：站內通知內容 = 與 LINE / Email 同一份完整內容（副標 + 內文 + 功能清單 + 樣本動態資料 + footer）
    const parts: string[] = [];
    if (override?.subtitle) parts.push(override.subtitle);
    if (override?.bodyText) parts.push(override.bodyText);
    const extraLines = EXTRA_LINES[key] ?? [];
    if (extraLines.length) parts.push(extraLines.join("\n"));
    const sampleBody = buildSampleBody(key, p); // 動態樣本（超賣/週報數字、場次金額等）
    if (sampleBody) parts.push(sampleBody);
    const footer = EXTRA_FOOTER[key] ?? "";
    if (footer) parts.push(footer);
    const body = parts.join("\n\n")
      || "正式寄送時動態欄位（客戶名、日期、金額等）會自動帶入。";
    // v474：試送不掛連結（測試到自己、無需導頁）→ 客戶端詳情視窗底部顯示「關閉通知」而非「前往查看」
    const icon = FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META]?.icon ?? null;
    try {
      await prisma.notification.create({
        data: { userId: auth.user.lineUserId, templateKey: key, title: `（測試）${title}`, body, linkUrl: null, icon },
      });
      logMessage({ channel: "inapp", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${title}`, status: "sent", source: "test" });
      return NextResponse.json({ ok: true, channel: "inApp", sentTo: auth.user.lineUserId });
    } catch (e) {
      logMessage({ channel: "inapp", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${title}`, status: "failed", error: e instanceof Error ? e.message : String(e), source: "test" });
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // ─── Email ───────────────────────────────────────────────────────
  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email 系統未設定（SENDGRID_API_KEY 缺）" }, { status: 503 });
  }
  const me = await prisma.user.findUnique({
    where: { lineUserId: auth.user.lineUserId },
    select: { email: true, realName: true, displayName: true },
  });
  if (!me?.email) {
    return NextResponse.json(
      { error: "您的帳號沒設 Email，無法試送（請至會員管理補設）" },
      { status: 400 },
    );
  }
  const override = await prisma.messageTemplate.findUnique({ where: { key } });
  const title = override?.title ?? label;
  const subject = `（測試）${title}`;
  const subtitle = override?.subtitle ?? "";
  const bodyText =
    override?.bodyText ??
    "正式寄送時動態欄位（客戶名、日期、金額等）會自動帶入。";
  const buttonLabel = override?.buttonLabel ?? "開啟預約 App";
  const buttonUrl = (() => {
    const p = params as Record<string, string>;
    if (p.liffUrl) return p.liffUrl;
    if (p.url) return p.url;
    const id = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
    return id ? `https://liff.line.me/${id}` : "https://haiwangzi.xyz";
  })();

  // v235：與 /admin/templates 預覽一致的內容

  const heroEmoji = HERO_EMOJI[key] ?? "📩";
  const extraLines = EXTRA_LINES[key] ?? [];
  const extraFooter = EXTRA_FOOTER[key] ?? "";

  // 動態資料區（SHOW_DATA 模板才顯示）
  const showData = ["booking_confirm", "d1_reminder", "deposit_notice", "deposit_confirm", "final_reminder", "trip_guide", "weather_cancel", "overcap_alert"].includes(key);
  const showAmount = ["deposit_notice", "final_reminder"].includes(key);
  const dataHtml = showData ? `
    <div style="background:#f4f9f8;border:1px solid #e2efed;border-radius:9px;padding:12px 14px;margin:16px 0;font-size:13px;color:#516268">
      <div style="margin:4px 0"><b style="color:#0a2342;display:inline-block;width:72px">客戶姓名</b>${params.name ?? params.customerName ?? "王小明"}</div>
      <div style="margin:4px 0"><b style="color:#0a2342;display:inline-block;width:72px">預約場次</b>${params.site ?? params.tourTitle ?? "鶯歌石"}</div>
      <div style="margin:4px 0"><b style="color:#0a2342;display:inline-block;width:72px">出發時間</b>${params.date ?? params.tripDate ?? "—"} ${params.time ?? params.tripTime ?? ""}</div>
      ${showAmount ? `<div style="margin:4px 0"><b style="color:#0a2342;display:inline-block;width:72px">應繳金額</b>NT$ ${params.total ?? params.deposit ?? params.remaining ?? "—"}</div>` : ""}
    </div>
  ` : "";

  const listHtml = extraLines.length > 0 ? `
    <div style="margin:14px 0">
      ${key === "welcome" ? '<div style="font-size:13px;font-weight:700;color:#0A2342;margin-bottom:8px">我們在 LINE / Email 為您提供：</div>' : ""}
      ${extraLines.map((line) => `<div style="font-size:13px;line-height:1.6;color:#1A2330;margin:4px 0">${line}</div>`).join("")}
    </div>
  ` : "";

  const footerLineHtml = extraFooter ? `
    <div style="margin-top:18px;text-align:center;font-size:12px;color:#6B7682;font-style:italic">
      ${extraFooter}
    </div>
  ` : "";

  // v363：email 重新設計 —— 純色背景（不用漸層，Outlook/深色模式都正常）、
  //   移除 48px emoji 大帶、加 color-scheme meta、table 版型高對比
  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#1A2330;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef2f7" style="background-color:#eef2f7;">
    <tr><td align="center" style="padding:20px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background-color:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e9f0;">
        <tr><td bgcolor="#0A2342" style="background-color:#0A2342;padding:20px 26px;">
          <div style="font-size:18px;font-weight:800;color:#ffffff;line-height:1.3;">🌊 東北角海王子潛水團</div>
          <div style="font-size:11px;letter-spacing:3px;color:#00D9CB;margin-top:3px;">SEA PRINCE DIVING</div>
        </td></tr>
        <tr><td style="background-color:#eef9f8;padding:18px 26px;border-bottom:1px solid #e3e9f0;">
          <div style="font-size:20px;font-weight:800;color:#0A2342;line-height:1.35;">${heroEmoji} ${title}</div>
          ${subtitle ? `<div style="font-size:13.5px;color:#0a8f86;font-weight:600;margin-top:4px;">${subtitle}</div>` : ""}
        </td></tr>
        <tr><td style="padding:22px 26px;color:#1A2330;font-size:14px;line-height:1.75;">
          ${bodyText ? `<p style="margin:0 0 8px;color:#374151;white-space:pre-wrap;">${bodyText}</p>` : ""}
          ${listHtml}
          ${dataHtml}
          ${footerLineHtml}
          <div style="text-align:center;margin-top:20px;">
            <a href="${buttonUrl}" style="display:inline-block;background-color:#00D9CB;color:#0A2342;padding:13px 34px;border-radius:10px;font-weight:800;text-decoration:none;font-size:14px;">${buttonLabel} →</a>
          </div>
        </td></tr>
        <tr><td bgcolor="#f5f7fa" style="background-color:#f5f7fa;padding:14px 26px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center;">
          系統自動通知信 · 此為試送，正式寄送時動態欄位會自動帶入<br>
          東北角海王子潛水 · 安全．專業，陪你看見海
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const r = await sendEmail({ to: me.email, subject, text: `${subject}\n\n${bodyText}`, html });
    logMessage({ channel: "email", templateKey: key, recipientId: auth.user.lineUserId, recipient: me.email, title: subject, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error ?? null, source: "test" });
    if (!r.ok && !r.skipped) {
      return NextResponse.json({ ok: false, error: r.error ?? "send failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, channel: "email", sentTo: me.email });
  } catch (e) {
    logMessage({ channel: "email", templateKey: key, recipientId: auth.user.lineUserId, recipient: me.email, title: subject, status: "failed", error: e instanceof Error ? e.message : String(e), source: "test" });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
