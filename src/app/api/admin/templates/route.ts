import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  FLEX_TEMPLATES,
  FLEX_TEMPLATE_LABELS,
  FLEX_EDITABLE_FIELDS,
  buildFlexByKeyAsync,
} from "@/lib/flex";
import { getLineClient } from "@/lib/line";

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

  const templates = Object.keys(FLEX_TEMPLATES).map((key) => {
    const o = overrideMap.get(key);
    return {
      key,
      label: FLEX_TEMPLATE_LABELS[key as keyof typeof FLEX_TEMPLATE_LABELS],
      editableFields: FLEX_EDITABLE_FIELDS[
        key as keyof typeof FLEX_EDITABLE_FIELDS
      ],
      override: o
        ? {
            title: o.title,
            subtitle: o.subtitle,
            bodyText: o.bodyText,
            buttonLabel: o.buttonLabel,
            altText: o.altText,
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
  altText: z.string().nullable().optional(),
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

  const patch = {
    title: data.title ?? null,
    subtitle: data.subtitle ?? null,
    bodyText: data.bodyText ?? null,
    buttonLabel: data.buttonLabel ?? null,
    altText: data.altText ?? null,
    updatedBy: auth.user.lineUserId,
  };

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
