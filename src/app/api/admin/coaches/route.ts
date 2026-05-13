import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/coaches - 開團選教練 / admin 管理
// 預設只回 active。admin 可加 ?includeInactive=1 看全部
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "coach"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const includeInactive =
    auth.user.role === "admin" &&
    new URL(req.url).searchParams.get("includeInactive") === "1";

  const coaches = await prisma.coach.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { realName: "asc" },
  });
  return NextResponse.json({ coaches });
}

const CreateSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, "id 只能用小寫英數、底線、橫線"),
  realName: z.string().min(1),
  cert: z.enum(["DM", "Instructor", "CourseDirector"]),
  specialty: z.array(z.string()).default([]),
  feePerDive: z.number().int().min(0).default(0),
  note: z.string().optional().or(z.literal("")),
  lineUserId: z.string().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

// POST /api/admin/coaches - 新增教練
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  const data = CreateSchema.parse(await req.json());
  try {
    const coach = await prisma.coach.create({
      data: {
        id: data.id,
        realName: data.realName,
        cert: data.cert,
        specialty: data.specialty,
        feePerDive: data.feePerDive,
        note: data.note || null,
        lineUserId: data.lineUserId || null,
        active: data.active,
      },
    });
    return NextResponse.json({ ok: true, coach });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json(
        { error: `教練 id "${data.id}" 已存在` },
        { status: 409 },
      );
    }
    throw e;
  }
}
