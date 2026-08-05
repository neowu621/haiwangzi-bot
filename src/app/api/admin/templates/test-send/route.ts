import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { buildFlexByKeyAsync, FLEX_TEMPLATES, FLEX_TEMPLATE_LABELS, FLEX_TEMPLATE_META } from "@/lib/flex";
import { getLineClient } from "@/lib/line";
import { sendEmail, emailConfigured } from "@/lib/email/send";
import { logMessage } from "@/lib/message-log"; // v474：試送也記入發送紀錄
import { normalizeVipTiers, vipUpgradeSampleParams } from "@/lib/vip-tier"; // v1027：升等範例抓系統級距
import {
  MSG_SAMPLE_PARAMS,
  MSG_EDITABLE_FIELDS,
  composeFullBody,
  composeEmail,
  msgField,
  resolveLinkUrl,
} from "@/lib/message-content"; // v480：與正式發送同一份組稿（單一來源）

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  key: z.string(),
  channel: z.enum(["line", "email", "inApp"]).default("line"),
  vipLevel: z.number().int().min(1).max(10).optional(), // v1028：VIP 升等試送指定等級
});

// POST /api/admin/templates/test-send - 預覽（推給 admin 自己）
// v480：LINE / Email / 站內 三通道都走與正式發送相同的組稿函式（composeFullBody / composeEmail），
//       只差「樣本參數 MSG_SAMPLE_PARAMS」與標題前綴（測試）。保證試送＝正式。
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const { key, channel, vipLevel } = BodySchema.parse(await req.json());
  if (!(key in FLEX_TEMPLATES)) {
    return NextResponse.json({ error: "unknown template key" }, { status: 400 });
  }

  // v1027：VIP 升等的範例參數改抓「系統設定的 VIP 級距」，讓試送＝客戶實際收到的內容
  let params = MSG_SAMPLE_PARAMS[key] ?? {};
  if (key === "vip_upgrade") {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" }, select: { vipTiers: true } }).catch(() => null);
    params = { ...params, ...vipUpgradeSampleParams(cfg?.vipTiers ? normalizeVipTiers(cfg.vipTiers) : undefined, vipLevel) };
  }
  const label = FLEX_TEMPLATE_LABELS[key as keyof typeof FLEX_TEMPLATE_LABELS] ?? key;
  const override = await prisma.messageTemplate.findUnique({ where: { key } });

  // ─── LINE ────────────────────────────────────────────────────────
  if (channel === "line") {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: "LINE_CHANNEL_ACCESS_TOKEN 未設定" }, { status: 503 });
    }
    const altText = msgField(key, "altText", override) || label;
    const msg = await buildFlexByKeyAsync(
      key as keyof typeof FLEX_TEMPLATES,
      params,
      altText,
    );
    try {
      const client = getLineClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.pushMessage({ to: auth.user.lineUserId, messages: [msg as any] });
      logMessage({ channel: "line", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${altText}`, status: "sent", source: "test" });
      return NextResponse.json({ ok: true, channel: "line", sentTo: auth.user.lineUserId });
    } catch (e) {
      logMessage({ channel: "line", templateKey: key, recipientId: auth.user.lineUserId, recipient: "（試送到我）", title: `（測試）${altText}`, status: "failed", error: e instanceof Error ? e.message : String(e), source: "test" });
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      );
    }
  }

  // ─── 站內通知 ───────────────────────────────────────────────────
  // 內容與正式發送 100% 同一條程式路徑（composeFullBody），僅標題加（測試）前綴
  if (channel === "inApp") {
    const title = msgField(key, "title", override) || label;
    const body =
      composeFullBody(key, params, override) ||
      "正式寄送時動態欄位（客戶名、日期、金額等）會自動帶入。";
    // v835：試送＝正式 — 掛上與正式發送相同的連結（後台按鈕連結 > 到場確認 Google 預設 > resolveLinkUrl），
    //   讓詳情視窗底部顯示「前往查看 →」，能忠實預覽站內通知的導頁。
    const savedBtnUrl = override?.buttonUrl && override.buttonUrl.length > 0 ? override.buttonUrl : null;
    const linkUrl =
      savedBtnUrl ??
      (key === "attendance_confirmed"
        ? (typeof params.reviewUrl === "string" && params.reviewUrl ? params.reviewUrl : "https://maps.app.goo.gl/L58ukZuJroo5vbjv5")
        : resolveLinkUrl(params));
    const icon = FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META]?.icon ?? null;
    // v994：與正式發送一致 —— 按鈕文字用模板「按鈕文字」+ 第二顆按鈕（到場確認「有需要改善?告訴我們」）
    const hasBtnField = (MSG_EDITABLE_FIELDS[key] ?? []).some((f) => f.key === "buttonLabel");
    const rawBtn = hasBtnField ? msgField(key, "buttonLabel", override).trim() : "";
    const suppressBtn = hasBtnField && rawBtn === "";
    const inAppLink = suppressBtn ? null : linkUrl;
    let link2: string | null = null;
    let btn2: string | null = null;
    const rawBtn2 = msgField(key, "button2Label", override).trim();
    if (key === "attendance_confirmed" && rawBtn2) {
      const sess = typeof params.bookingTitle === "string" ? params.bookingTitle : "";
      link2 = `/liff/messages?fb=1&s=${encodeURIComponent(sess)}`;
      btn2 = rawBtn2;
    }
    try {
      await prisma.notification.create({
        data: {
          userId: auth.user.lineUserId, templateKey: key, title: `（測試）${title}`, body,
          linkUrl: inAppLink, buttonLabel: inAppLink ? rawBtn || null : null,
          linkUrl2: link2, buttonLabel2: btn2, icon,
        },
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
  // 內容與正式發送 100% 同一條程式路徑（composeEmail），僅主旨加（測試）前綴
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
  const content = composeEmail(key, params, override, {
    subjectPrefix: "（測試）",
    footnote: "系統自動通知信 · 此為試送，正式寄送時動態欄位會自動帶入",
  });
  try {
    const r = await sendEmail({ to: me.email, subject: content.subject, text: content.text, html: content.html });
    logMessage({ channel: "email", templateKey: key, recipientId: auth.user.lineUserId, recipient: me.email, title: content.subject, status: r.ok ? "sent" : r.skipped ? "skipped" : "failed", error: r.error ?? null, source: "test" });
    if (!r.ok && !r.skipped) {
      return NextResponse.json({ ok: false, error: r.error ?? "send failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, channel: "email", sentTo: me.email });
  } catch (e) {
    logMessage({ channel: "email", templateKey: key, recipientId: auth.user.lineUserId, recipient: me.email, title: `（測試）${msgField(key, "title", override) || label}`, status: "failed", error: e instanceof Error ? e.message : String(e), source: "test" });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
