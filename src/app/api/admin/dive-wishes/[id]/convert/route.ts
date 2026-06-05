// v318：admin 同意願望單 → 開正式場次（DivingTrip 或 TourPackage）
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { genTripCode, genTourCode } from "@/lib/code-gen";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DailyBody = z.object({
  asType: z.literal("daily"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  diveSiteIds: z.array(z.string()).min(1),
  tankCount: z.number().int().min(1).max(5).default(2),
  capacity: z.number().int().min(1).max(50).default(10),
  pricing: z.object({
    baseTrip: z.number().int().min(0),
    extraTank: z.number().int().min(0).default(500),
    nightDive: z.number().int().min(0).default(300),
    scooterRental: z.number().int().min(0).default(500),
  }),
  isNightDive: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});
const TourBody = z.object({
  asType: z.literal("tour"),
  title: z.string().min(2).max(100),
  destination: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]).default("other"),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diveSiteIds: z.array(z.string()).min(0).default([]),
  basePrice: z.number().int().min(0),
  deposit: z.number().int().min(0),
  capacity: z.number().int().min(1).max(50).default(10),
  description: z.string().max(2000).optional(),
});

const Body = z.discriminatedUnion("asType", [DailyBody, TourBody]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  const { id } = await ctx.params;
  const wish = await prisma.diveWish.findUnique({
    where: { id },
    include: { user: { select: { lineUserId: true, realName: true, displayName: true } } },
  });
  if (!wish) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (wish.status === "converted") return NextResponse.json({ error: "already_converted" }, { status: 400 });
  if (wish.status === "cancelled") return NextResponse.json({ error: "already_cancelled" }, { status: 400 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  try {
    let convertedTripId: string | undefined;
    let convertedTourId: string | undefined;
    let bookUrl: string;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://haiwangzi.zeabur.app";

    if (data.asType === "daily") {
      const code = await genTripCode();
      const trip = await prisma.divingTrip.create({
        data: {
          code,
          date: new Date(data.date + "T00:00:00+08:00"),
          startTime: data.startTime,
          diveSiteIds: data.diveSiteIds,
          tankCount: data.tankCount,
          capacity: data.capacity,
          pricing: data.pricing as never,
          isNightDive: data.isNightDive,
          notes: data.notes ?? null,
          status: "open",
        },
      });
      convertedTripId = trip.id;
      bookUrl = `${baseUrl}/liff/dive/trip/${trip.id}`;
    } else {
      const code = await genTourCode();
      const tour = await prisma.tourPackage.create({
        data: {
          code,
          title: data.title,
          destination: data.destination,
          dateStart: new Date(data.dateStart + "T00:00:00+08:00"),
          dateEnd: new Date(data.dateEnd + "T00:00:00+08:00"),
          diveSiteIds: data.diveSiteIds,
          basePrice: data.basePrice,
          deposit: data.deposit,
          capacity: data.capacity,
          extraNote: data.description ?? null,
          status: "open",
        },
      });
      convertedTourId = tour.id;
      bookUrl = `${baseUrl}/liff/tour/${tour.id}`;
    }

    const updated = await prisma.diveWish.update({
      where: { id },
      data: {
        status: "converted",
        convertedTripId: convertedTripId ?? null,
        convertedTourId: convertedTourId ?? null,
        convertedAt: new Date(),
        lastActivityAt: new Date(),
        messages: [
          ...((wish.messages as unknown as Array<{ from: string; text: string; at: string }>) ?? []),
          {
            from: "boss",
            text: `✅ 場次已開！請點下方連結預約：\n${bookUrl}`,
            at: new Date().toISOString(),
            actorId: auth.user.lineUserId,
          },
        ] as never,
      },
    });

    await logAudit({
      actorId: auth.user.lineUserId,
      action: "dive_wish.convert",
      targetType: "dive_wish",
      targetId: id,
      metadata: { asType: data.asType, convertedTripId, convertedTourId },
    });

    // push LINE 給客戶
    void (async () => {
      try {
        const { getLineClient } = await import("@/lib/line");
        const lc = getLineClient();
        if (!lc) return;
        const text = `🎉 您的願望單已開出正式場次！\n\n📍 ${data.asType === "daily" ? data.diveSiteIds.join("、") : data.title}\n📅 ${data.asType === "daily" ? data.date : `${data.dateStart} → ${data.dateEnd}`}\n\n👉 點此預約：${bookUrl}`;
        await lc.pushMessage({ to: wish.user.lineUserId, messages: [{ type: "text", text }] });
      } catch (e) { console.error("[wish convert notify customer]", e); }
    })();

    return NextResponse.json({ ok: true, wish: updated });
  } catch (e) {
    console.error("[wish convert]", e);
    return NextResponse.json({ error: "convert_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
