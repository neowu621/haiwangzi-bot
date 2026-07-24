// v897：日潛場次「快速範本」CRUD —— 存於 SiteConfig.tripTemplates (JSON 陣列)，所有管理者共用。
//   範本只存「跟著潛點固定」的欄位（潛點/岸船/氣瓶/費用/集合點…），不含日期/教練（每場現場填）。
//   store 為空時回傳程式起始範本（DEFAULT_TRIP_TEMPLATES），存/刪以現有清單為基礎。
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEMPLATES = 30;

const PricingSchema = z.object({
  baseTrip: z.number().default(0),
  extraTank: z.number().default(600),
  nightDive: z.number().default(300),
  scooterRental: z.number().default(500),
  otherFee: z.number().default(0),
  otherFeeNote: z.string().default(""),
});

export interface TripTemplate {
  id: string;
  name: string;
  emoji: string;
  isBoat: boolean;
  isNightDive: boolean;
  isScooter: boolean;
  diveSiteIds: string[];
  tankCount: number;
  capacity: number;
  startTime: string;
  pricing: z.infer<typeof PricingSchema>;
  meetingPoint: string;
  meetingPointUrl: string;
  referenceVideoUrl: string;
  activityNote: string;
  notes: string;
  createdAt: string;
}

// 起始範本（store 為空時回傳；老闆可自行編修/刪除/新增）。數值為合理預設，後台可改。
const DEFAULT_PRICING = { baseTrip: 0, extraTank: 600, nightDive: 300, scooterRental: 500, otherFee: 0, otherFeeNote: "" };
function seed(emoji: string, name: string): TripTemplate {
  return {
    id: `tt_seed_${name}`, name, emoji,
    isBoat: false, isNightDive: false, isScooter: false,
    diveSiteIds: [name], tankCount: 2, capacity: 8, startTime: "08:00",
    pricing: { ...DEFAULT_PRICING }, meetingPoint: "", meetingPointUrl: "",
    referenceVideoUrl: "", activityNote: "", notes: "", createdAt: "2026-07-01T00:00:00.000Z",
  };
}
const DEFAULT_TRIP_TEMPLATES: TripTemplate[] = [
  seed("🪸", "鶯歌石"),
  seed("🐟", "深澳"),
  seed("🌊", "龍洞 82.8"),
];

const CreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(24),
  emoji: z.string().max(8).default("🤿"),
  isBoat: z.boolean().default(false),
  isNightDive: z.boolean().default(false),
  isScooter: z.boolean().default(false),
  diveSiteIds: z.array(z.string().max(40)).max(10).default([]),
  tankCount: z.number().int().min(1).max(10).default(2),
  capacity: z.number().int().min(0).max(999).default(8),
  startTime: z.string().max(5).default("08:00"),
  pricing: PricingSchema.default({}),
  meetingPoint: z.string().max(200).default(""),
  meetingPointUrl: z.string().max(500).default(""),
  referenceVideoUrl: z.string().max(500).default(""),
  activityNote: z.string().max(1000).default(""),
  notes: z.string().max(1000).default(""),
});

async function loadTemplates(): Promise<TripTemplate[]> {
  const cfg = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: { tripTemplates: true },
  }).catch(() => null);
  const raw = (cfg as unknown as { tripTemplates?: unknown } | null)?.tripTemplates;
  if (Array.isArray(raw) && raw.length > 0) return raw as TripTemplate[];
  return DEFAULT_TRIP_TEMPLATES; // 空 → 給起始範本（一經存/刪即成為真實清單）
}

async function saveTemplates(list: TripTemplate[], actorId: string) {
  await prisma.siteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", tripTemplates: list as unknown as object, updatedBy: actorId },
    update: { tripTemplates: list as unknown as object, updatedBy: actorId },
  });
}

async function guard(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return { ok: false as const, res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return { ok: false as const, res: NextResponse.json({ error: role.message }, { status: role.status }) };
  return { ok: true as const, userId: auth.user.lineUserId };
}

// GET — 列出範本
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const templates = await loadTemplates();
  return NextResponse.json({ templates });
}

// POST — 新增/覆蓋一個範本（同名覆蓋）
export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const data = CreateSchema.parse(await req.json());
  const list = await loadTemplates();
  const id = data.id && data.id.trim() ? data.id : `tt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const template: TripTemplate = {
    id, name: data.name, emoji: data.emoji,
    isBoat: data.isBoat, isNightDive: data.isNightDive, isScooter: data.isScooter,
    diveSiteIds: data.diveSiteIds, tankCount: data.tankCount, capacity: data.capacity,
    startTime: data.startTime, pricing: data.pricing,
    meetingPoint: data.meetingPoint, meetingPointUrl: data.meetingPointUrl,
    referenceVideoUrl: data.referenceVideoUrl, activityNote: data.activityNote, notes: data.notes,
    createdAt: new Date().toISOString(),
  };
  // 同名覆蓋（避免重複累積）
  const filtered = list.filter((p) => p.name !== data.name && p.id !== id);
  const next = [template, ...filtered].slice(0, MAX_TEMPLATES);
  await saveTemplates(next, g.userId);
  await logAudit({ actorId: g.userId, action: "trip_template.save", targetType: "trip_template", targetLabel: data.name });
  return NextResponse.json({ ok: true, template, templates: next });
}

// DELETE ?id=xxx — 刪除一個範本
export async function DELETE(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const list = await loadTemplates();
  const next = list.filter((p) => p.id !== id);
  await saveTemplates(next, g.userId);
  await logAudit({ actorId: g.userId, action: "trip_template.delete", targetType: "trip_template", targetId: id });
  return NextResponse.json({ ok: true, templates: next });
}
