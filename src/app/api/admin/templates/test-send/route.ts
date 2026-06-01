import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildFlexByKeyAsync, FLEX_TEMPLATES, FLEX_TEMPLATE_LABELS } from "@/lib/flex";
import { getLineClient } from "@/lib/line";
import { sendEmail, emailConfigured } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.string(),
  channel: z.enum(["line", "email"]).default("line"),
});

const SAMPLE_PARAMS: Record<string, Record<string, unknown>> = {
  booking_confirm: {
    name: "（測試）吳俊謀",
    date: "2026-05-13",
    time: "08:00",
    site: "鶯歌石",
    total: 2700,
    url: "https://haiwangzi.zeabur.app/liff/my",
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
    url: "https://haiwangzi.zeabur.app/liff/my",
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
    url: "https://haiwangzi.zeabur.app/liff/my",
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
    url: "https://haiwangzi.zeabur.app/liff/my",
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
    url: "https://haiwangzi.zeabur.app/liff/coach/today",
  },
  welcome: {
    // v233：動態從 env 讀，避免寫死舊 LIFF ID
    liffUrl: (() => {
      const id = process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "";
      return id ? `https://liff.line.me/${id}` : "https://liff.line.me";
    })(),
  },
};

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
  const subject = `（測試）${override?.title ?? label}`;
  const bodyText =
    override?.bodyText ??
    override?.subtitle ??
    `這是 ${label} 的試送 Email。動態欄位會在正式寄送時自動帶入。\n\n動態欄位範例：${JSON.stringify(params, null, 2)}`;
  const buttonLabel = override?.buttonLabel;

  const html = `<!DOCTYPE html><html><body style="font-family:'Noto Sans TC',sans-serif;background:#f5f8f8;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.06)">
      <div style="background:linear-gradient(120deg,#06262e,#0e4c5a);padding:20px 24px;color:#eafffb">
        <div style="font-size:20px;font-weight:800">東北角海王子潛水</div>
        <div style="font-size:11px;opacity:.7;letter-spacing:2px">SEA PRINCE DIVING</div>
      </div>
      <div style="padding:24px">
        <h1 style="font-size:18px;color:#0a2027;margin:0 0 12px">${subject}</h1>
        <p style="font-size:13px;color:#516268;line-height:1.7;white-space:pre-wrap">${bodyText}</p>
        ${buttonLabel ? `<a style="display:inline-block;background:#13b5a6;color:#fff;padding:10px 24px;border-radius:8px;font-weight:700;text-decoration:none;margin-top:12px">${buttonLabel} →</a>` : ""}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #eef2f2;font-size:11px;color:#9aabae;text-align:center">
        系統自動通知信 · 此為試送，正式寄送時動態欄位會自動帶入
      </div>
    </div>
  </body></html>`;

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
