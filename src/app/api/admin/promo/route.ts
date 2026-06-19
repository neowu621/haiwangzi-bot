// v590：後台節慶優惠代碼 CRUD。GET 列表（?gen=1 回新代碼）；POST 新增/更新。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { genUniquePromoCode } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function gate(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return { res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return { res: NextResponse.json({ error: role.message }, { status: role.status }) };
  return { ok: true as const };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;

  // ?gen=1 → 回一組不重複代碼（給「自動產生」按鈕）
  if (new URL(req.url).searchParams.get("gen") === "1") {
    return NextResponse.json({ code: await genUniquePromoCode() });
  }
  const items = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

const Schema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(60),
  code: z.string().max(16).optional(),
  discountType: z.enum(["per_tank", "percent"]),
  discountValue: z.number().int().min(1).max(100000),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  isPublic: z.boolean().default(true),
  appliesTo: z.enum(["daily", "tour", "both"]).default("daily"),
  minAmount: z.number().int().min(0).max(1000000).default(0),
  perUserLimit: z.number().int().min(0).max(10000).default(0),
  totalLimit: z.number().int().min(0).max(1000000).default(0),
  audienceTag: z.string().max(24).nullable().optional(),
  enabled: z.boolean().default(true),
  note: z.string().max(500).default(""),
});

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("res" in g) return g.res;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "資料格式錯誤" }, { status: 400 });
  const d = parsed.data;
  if (new Date(d.endAt).getTime() < new Date(d.startAt).getTime())
    return NextResponse.json({ error: "結束日不能早於開始日" }, { status: 400 });

  const data = {
    title: d.title,
    discountType: d.discountType,
    discountValue: d.discountValue,
    startAt: new Date(d.startAt),
    endAt: new Date(d.endAt),
    isPublic: d.isPublic,
    appliesTo: d.appliesTo,
    minAmount: d.minAmount,
    perUserLimit: d.perUserLimit,
    totalLimit: d.totalLimit,
    audienceTag: d.audienceTag ?? null,
    enabled: d.enabled,
    note: d.note,
  };

  if (d.id) {
    const updated = await prisma.promoCode.update({ where: { id: d.id }, data });
    return NextResponse.json({ ok: true, item: updated });
  }
  // 新增：代碼用帶入的（轉大寫）或自動產生；撞碼回 409
  const code = (d.code?.trim().toUpperCase()) || (await genUniquePromoCode());
  try {
    const created = await prisma.promoCode.create({ data: { ...data, code } });
    return NextResponse.json({ ok: true, item: created });
  } catch {
    return NextResponse.json({ error: "代碼重複，請改用自動產生" }, { status: 409 });
  }
}
