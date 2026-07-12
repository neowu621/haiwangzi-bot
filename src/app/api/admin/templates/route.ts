import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  FLEX_TEMPLATES,
  FLEX_TEMPLATE_LABELS,
  FLEX_TEMPLATE_META,
  FLEX_EDITABLE_FIELDS,
} from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/templates - 列出所有 template 的 metadata + 目前 override
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const all = await prisma.messageTemplate.findMany();
  const overrideMap = new Map(all.map((t) => [t.key, t]));

  // v794/v795：所有有按鈕的模板，在「按鈕文字」後自動補一個「按鈕連結」欄位。
  //   v795：欄位預設值 = 該模板的系統預設連結（顯示出來，讓老闆看得到、可直接改）。
  //   維持既有行為：值＝預設就存 null → 實際仍走各模板原本的連結邏輯。
  //   已內建 buttonUrl 的模板（到場確認，預設 Google 評論）維持不動。
  type EF = { key: string; label: string; defaultValue: string };
  // v796：對齊各模板實際連結（call site 送出的 liffUrl/url）。動態的(付款/退款帶訂單ID)顯示代表頁。
  const LIFF_BASE = "https://liff.line.me/2010219428-E5frY7tm";
  const OA_LINE = "https://line.me/R/ti/p/%40894bpmew"; // 小編 LINE OA
  const DEFAULT_BTN_URL: Record<string, string> = {
    welcome: LIFF_BASE,
    booking_confirm: `${LIFF_BASE}/my`,
    deposit_notice: `${LIFF_BASE}/my`,
    deposit_confirm: `${LIFF_BASE}/my`,
    final_reminder: `${LIFF_BASE}/my`,
    trip_guide: `${LIFF_BASE}/my`,
    d1_reminder: `${LIFF_BASE}/my`,
    weather_cancel: OA_LINE,
    birthday_credit: `${LIFF_BASE}/booking`,
    credit_expiry: `${LIFF_BASE}/booking`,
    booking_cancel: `${LIFF_BASE}/my`,
    first_order_reward_grant: `${LIFF_BASE}/profile`,
    payment_reject: `${LIFF_BASE}/my`, // 實際帶訂單ID → /payment/{id}
    refund_request: `${LIFF_BASE}/my`, // 實際帶退款ID → /refund/{id}
    vip_upgrade: `${LIFF_BASE}/profile`,
    deposit_pending: "https://haiwangzi.xyz/admin/bookings?status=awaiting_verify",
    overcap_alert: "https://haiwangzi.xyz/liff/coach/today",
  };
  const withButtonUrl = (key: string, fields: readonly EF[] | undefined): EF[] | undefined => {
    if (!fields) return fields as undefined;
    if (fields.some((f) => f.key === "buttonUrl")) return [...fields];
    const idx = fields.findIndex((f) => f.key === "buttonLabel");
    if (idx < 0) return [...fields];
    const injected: EF = {
      key: "buttonUrl",
      label: "按鈕連結（系統預設如下，可改；三管道通用）",
      defaultValue: DEFAULT_BTN_URL[key] ?? `${LIFF_BASE}/my`,
    };
    return [...fields.slice(0, idx + 1), injected, ...fields.slice(idx + 1)];
  };

  const templates = Object.keys(FLEX_TEMPLATES).map((key) => {
    const o = overrideMap.get(key);
    const meta = FLEX_TEMPLATE_META[key as keyof typeof FLEX_TEMPLATE_META];
    return {
      key,
      label: FLEX_TEMPLATE_LABELS[key as keyof typeof FLEX_TEMPLATE_LABELS],
      group: meta.group,
      icon: meta.icon,
      // null override 時 fallback 到預設
      lineEnabled: o?.lineEnabled ?? meta.defaultLine,
      emailEnabled: o?.emailEnabled ?? meta.defaultEmail,
      inAppEnabled: o?.inAppEnabled ?? meta.defaultInApp,
      editableFields: withButtonUrl(
        key,
        FLEX_EDITABLE_FIELDS[key as keyof typeof FLEX_EDITABLE_FIELDS] as readonly EF[] | undefined,
      ),
      override: o
        ? {
            title: o.title,
            subtitle: o.subtitle,
            bodyText: o.bodyText,
            buttonLabel: o.buttonLabel,
            buttonUrl: o.buttonUrl, // v792
            button2Label: o.button2Label, // v834
            altText: o.altText,
            footerHint: o.footerHint, // v480
            updatedAt: o.updatedAt,
            updatedBy: o.updatedBy,
          }
        : null,
    };
  });

  return NextResponse.json({ templates });
}

const PatchSchema = z.object({
  key: z.string(),
  title: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  bodyText: z.string().nullable().optional(),
  buttonLabel: z.string().nullable().optional(),
  buttonUrl: z.string().nullable().optional(), // v792：按鈕點擊連結
  button2Label: z.string().nullable().optional(), // v834：第二顆按鈕文字
  altText: z.string().nullable().optional(),
  footerHint: z.string().nullable().optional(), // v480：first_order_reward_grant 底部提示
  lineEnabled: z.boolean().nullable().optional(),
  emailEnabled: z.boolean().nullable().optional(),
  inAppEnabled: z.boolean().nullable().optional(),
});

// POST /api/admin/templates - upsert override
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = PatchSchema.parse(await req.json());

  if (!(data.key in FLEX_TEMPLATES)) {
    return NextResponse.json({ error: "unknown template key" }, { status: 400 });
  }

  const patch: {
    title: string | null;
    subtitle: string | null;
    bodyText: string | null;
    buttonLabel: string | null;
    buttonUrl: string | null;
    button2Label: string | null;
    altText: string | null;
    footerHint: string | null;
    lineEnabled?: boolean | null;
    emailEnabled?: boolean | null;
    inAppEnabled?: boolean | null;
    updatedBy: string;
  } = {
    title: data.title ?? null,
    subtitle: data.subtitle ?? null,
    bodyText: data.bodyText ?? null,
    buttonLabel: data.buttonLabel ?? null,
    buttonUrl: data.buttonUrl ?? null, // v792
    button2Label: data.button2Label ?? null, // v834
    altText: data.altText ?? null,
    footerHint: data.footerHint ?? null, // v480
    updatedBy: auth.user.lineUserId,
  };
  if (data.lineEnabled !== undefined) patch.lineEnabled = data.lineEnabled;
  if (data.emailEnabled !== undefined) patch.emailEnabled = data.emailEnabled;
  if (data.inAppEnabled !== undefined) patch.inAppEnabled = data.inAppEnabled;

  const t = await prisma.messageTemplate.upsert({
    where: { key: data.key },
    create: { key: data.key, ...patch },
    update: patch,
  });

  return NextResponse.json({ ok: true, template: t });
}

// DELETE /api/admin/templates?key=... - 移除 override (回到預設)
export async function DELETE(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const key = new URL(req.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "missing key" }, { status: 400 });
  await prisma.messageTemplate.delete({ where: { key } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
