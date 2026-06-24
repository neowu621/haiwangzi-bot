// v650：群發「已儲存訊息模組」CRUD —— 存於 SiteConfig.broadcastPresets (JSON 陣列)，所有管理者共用。
//   不含發送對象（每次發送現場選），只存訊息草稿（管道/模板/LINE/Email/params）。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PRESETS = 50;

export interface BroadcastPreset {
  id: string;
  name: string;
  channel: string;
  template: string;
  altText: string;
  text: string;
  emailSubject: string;
  emailBody: string;
  params: string;
  createdAt: string;
}

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  channel: z.string().max(16).default("line"),
  template: z.string().max(64).default("text"),
  altText: z.string().max(200).default(""),
  text: z.string().max(5000).default(""),
  emailSubject: z.string().max(200).default(""),
  emailBody: z.string().max(8000).default(""),
  params: z.string().max(4000).default("{}"),
});

async function loadPresets(): Promise<BroadcastPreset[]> {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: { broadcastPresets: true },
  }).catch(() => null);
  const raw = (cfg as unknown as { broadcastPresets?: unknown } | null)?.broadcastPresets;
  return Array.isArray(raw) ? (raw as BroadcastPreset[]) : [];
}

async function savePresets(list: BroadcastPreset[], actorId: string) {
  await prisma.siteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", broadcastPresets: list as unknown as object, updatedBy: actorId },
    update: { broadcastPresets: list as unknown as object, updatedBy: actorId },
  });
}

async function guard(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return { ok: false as const, res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return { ok: false as const, res: NextResponse.json({ error: role.message }, { status: role.status }) };
  return { ok: true as const, userId: auth.user.lineUserId };
}

// GET — 列出所有模組
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const presets = await loadPresets();
  return NextResponse.json({ presets });
}

// POST — 新增一個模組（同名則覆蓋）
export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const data = CreateSchema.parse(await req.json());
  const list = await loadPresets();

  // v650：去掉 Date.now/random 之外的唯一 id —— 用時間戳 + 名稱
  const id = `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const preset: BroadcastPreset = {
    id,
    name: data.name,
    channel: data.channel,
    template: data.template,
    altText: data.altText,
    text: data.text,
    emailSubject: data.emailSubject,
    emailBody: data.emailBody,
    params: data.params,
    createdAt: new Date().toISOString(),
  };

  // 同名覆蓋（避免一直累積重複名稱）
  const filtered = list.filter((p) => p.name !== data.name);
  const next = [preset, ...filtered].slice(0, MAX_PRESETS);
  await savePresets(next, g.userId);
  await logAudit({ actorId: g.userId, action: "broadcast.preset_save", targetType: "broadcast", targetLabel: data.name });
  return NextResponse.json({ ok: true, preset, presets: next });
}

// DELETE ?id=xxx — 刪除一個模組
export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const list = await loadPresets();
  const next = list.filter((p) => p.id !== id);
  await savePresets(next, g.userId);
  await logAudit({ actorId: g.userId, action: "broadcast.preset_delete", targetType: "broadcast", targetId: id });
  return NextResponse.json({ ok: true, presets: next });
}
