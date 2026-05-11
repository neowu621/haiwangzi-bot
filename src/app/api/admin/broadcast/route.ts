import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import { getLineClient } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { buildFlexByKey, type FlexTemplateKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  audience: z.enum(["all", "customers", "coaches", "admins"]).default("all"),
  template: z.string(),
  altText: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  text: z.string().optional(), // 純文字模式（template = "text" 時使用）
});

// POST /api/admin/broadcast
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = BodySchema.parse(await req.json());

  // 算 audience userIds
  const where =
    data.audience === "all"
      ? {}
      : { role: data.audience.slice(0, -1) as "customer" | "coach" | "admin" };
  const targets = await prisma.user.findMany({ where, select: { lineUserId: true } });
  const userIds = targets.map((t) => t.lineUserId);

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, delivered: 0 });
  }

  // 組訊息
  let messages;
  if (data.template === "text") {
    messages = [{ type: "text" as const, text: data.text ?? data.altText }];
  } else {
    const flex = buildFlexByKey(
      data.template as FlexTemplateKey,
      data.params as Record<string, unknown>,
      data.altText,
    );
    messages = [flex];
  }

  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      delivered: 0,
      dryRun: true,
      note: "LINE_CHANNEL_ACCESS_TOKEN 未設定，僅 dry-run",
      preview: messages,
    });
  }

  const client = getLineClient();
  // multicast 一次最多 500 個 userId
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 500)
    chunks.push(userIds.slice(i, i + 500));

  let delivered = 0;
  for (const chunk of chunks) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.multicast({ to: chunk, messages: messages as any });
      delivered += chunk.length;
    } catch (e) {
      console.error("multicast chunk error", e);
    }
  }

  return NextResponse.json({ ok: true, delivered });
}
