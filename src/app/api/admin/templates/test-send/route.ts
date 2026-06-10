import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildFlexByKeyAsync, FLEX_TEMPLATES, FLEX_TEMPLATE_LABELS, FLEX_TEMPLATE_META } from "@/lib/flex";
import { getLineClient } from "@/lib/line";
import { sendEmail, emailConfigured } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.string(),
  channel: z.enum(["line", "email", "inApp"]).default("line"),
});

const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  booking_confirm: {
    name: "（測試）吳俊謀",
    date: "2026-05-13",
    time: "08:00",
    site: "鶯歌石",
    total: 2700,
    url: "https://haiwangzi.xyz/liff/my",
  },
  d1_reminder: {
    date: "2026-05-14",
    time: "08:00",
    site: "深奧",
    weather: "晴",
    wave: "1m",
    water: "24°C",
    vis: "8-12m",
    gather: "深奧漁港停車場 07:30",
  },
  deposit_notice: {
    tourTitle: "蘭嶼四天三夜潛旅 (中秋)",
    deposit: 8000,
    deadline: "2026-09-01",
    bankAccount: "484540139251",
    holder: "汪教練",
    url: "https://haiwangzi.xyz/liff/my",
  },
  deposit_confirm: {
    tourTitle: "蘭嶼四天三夜",
    paid: 8000,
    remaining: 9000,
    finalDeadline: "2026-09-15",
  },
  final_reminder: {
    tourTitle: "蘭嶼四天三夜",
    remaining: 9000,
    deadline: "2026-09-15",
    daysLeft: 3,
    bankAccount: "484540139251",
    url: "https://haiwangzi.xyz/liff/my",
  },
  trip_guide: {
    tourTitle: "蘭嶼四天三夜",
    gather: "高雄港 07:00",
    transport: "中興2號",
    hotel: "蘭嶼背包客棧",
    leader: "汪教練",
    phone: "0988346634",
  },
  weather_cancel: {
    date: "2026-05-13",
    time: "08:00",
    site: "鶯歌石",
    reason: "（測試）今日北風 6 級",
    options: "1. 改期 2. 全額退費",
    url: "https://haiwangzi.xyz/liff/my",
  },
  admin_weekly: {
    weekRange: "2026-05-06 ~ 2026-05-12",
    bookings: 12,
    revenue: 38000,
    cancellations: 1,
    completed: 8,
    topSite: "鶯歌石",
  },
  overcap_alert: {
    tripDate: "2026-05-13",
    tripTime: "08:00",
    site: "鶯歌石",
    customerName: "（測試）王小明",
    requestedCount: 2,
    currentBooked: 8,
    capacity: 8,
    url: "https://haiwangzi.xyz/liff/coach/today",
  },
  welcome: {
    // v233：動態從 env 讀，避免寫死舊 LIFF ID
    liffUrl: (() => {
      const id = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
      return id ? `https://liff.line.me/${id}` : "https://liff.line.me";
    })(),
  },
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

// v467：把模板的動態樣本資料組成可讀內文，讓「模擬發送」呈現實際內容
//   （特別是內部通訊：超賣警示、Admin 週報，內容主要是數字）
function buildSampleBody(key: string, p: Record<string, string>): string {
  switch (key) {
    case "overcap_alert":
      return [
        `⚠️ 場次超賣提醒`,
        `場次：${p.tripDate ?? ""} ${p.tripTime ?? ""}・${p.site ?? ""}`,
        `客戶：${p.customerName ?? ""} 想預約 ${p.requestedCount ?? ""} 人`,
        `目前：已訂 ${p.currentBooked ?? ""} / 上限 ${p.capacity ?? ""} 人`,
      ].join("\n");
    case "admin_weekly":
      return [
        `📊 本週營運摘要（${p.weekRange ?? ""}）`,
        `・新增預約：${p.bookings ?? ""} 筆`,
        `・完成出團：${p.completed ?? ""} 筆`,
        `・取消：${p.cancellations ?? ""} 筆`,
        `・營收：NT$ ${p.revenue ?? ""}`,
        `・最熱門潛點：${p.topSite ?? ""}`,
      ].join("\n");
    case "booking_confirm":
      return `預約場次：${p.site ?? ""}\n出發時間：${p.date ?? ""} ${p.time ?? ""}\n金額：NT$ ${p.total ?? ""}`;
    case "weather_cancel":
      return `取消場次：${p.date ?? ""} ${p.time ?? ""}・${p.site ?? ""}\n原因：${p.reason ?? ""}`;
    case "d1_reminder":
      return `明日場次：${p.date ?? ""} ${p.time ?? ""}・${p.site ?? ""}\n天氣 ${p.weather ?? ""}・浪 ${p.wave ?? ""}・水溫 ${p.water ?? ""}`;
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
      return NextResponse.json({ ok: true, channel: "line", sentTo: auth.user.lineUserId });
    } catch (e) {
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
    const linkUrl = p.liffUrl ?? p.url ?? null;
    const icon = FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META]?.icon ?? null;
    try {
      await prisma.notification.create({
        data: {
          userId: auth.user.lineUserId,
          templateKey: key,
          title: `（測試）${title}`,
          body,
          linkUrl,
          icon,
        },
      });
      return NextResponse.json({ ok: true, channel: "inApp", sentTo: auth.user.lineUserId });
    } catch (e) {
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
    await sendEmail({
      to: me.email,
      subject,
      text: `${subject}\n\n${bodyText}`,
      html,
    });
    return NextResponse.json({ ok: true, channel: "email", sentTo: me.email });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
