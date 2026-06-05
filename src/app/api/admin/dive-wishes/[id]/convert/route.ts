// v318：admin 同意願望單 → 開正式場次（DivingTrip 或 TourPackage）
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { genTripCode, genTourCode } from "@/lib/code-gen";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v332：通知設定共用
const NotifyBody = {
  notifyChannels: z.array(z.enum(["line", "email"])).default(["line"]),
  notifyMessage: z.string().max(500).optional(),
};

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
  isScooter: z.boolean().default(false),  // v332
  notes: z.string().max(2000).optional(),
  ...NotifyBody,
});
const TourBody = z.object({
  asType: z.literal("tour"),
  title: z.string().min(2).max(100),
  subtitle: z.string().max(100).optional(),  // v332
  destination: z.enum(["northeast", "green_island", "lanyu", "kenting", "other"]).default("other"),
  dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  diveSiteIds: z.array(z.string()).min(0).default([]),
  basePrice: z.number().int().min(0),
  deposit: z.number().int().min(0),
  capacity: z.number().int().min(1).max(50).default(10),
  description: z.string().max(2000).optional(),
  ...NotifyBody,
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
    include: { user: { select: { lineUserId: true, realName: true, displayName: true, email: true, notifyByLine: true, notifyByEmail: true } } },
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
          isScooter: data.isScooter,  // v332
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
          subtitle: data.subtitle ?? null,  // v332
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

    // v332：依勾選通道通知客戶（同步 await、回給前端結果）
    const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "東北角海王子潛水";
    const opener = data.notifyMessage?.trim() || `🎉 您的願望單已開出正式場次！`;
    const what = data.asType === "daily"
      ? `📍 ${data.diveSiteIds.join("、")}\n📅 ${data.date} ${data.startTime}`
      : `📍 ${data.title}\n📅 ${data.dateStart} → ${data.dateEnd}`;
    const lineText = `${opener}\n\n${what}\n\n👉 點此預約：${bookUrl}`;
    const notifyResults: Record<string, { ok: boolean; error?: string }> = {};

    if (data.notifyChannels.includes("line")) {
      if (!wish.user.notifyByLine) {
        notifyResults.line = { ok: false, error: "客戶關閉了 LINE 通知" };
      } else {
        try {
          const { getLineClient } = await import("@/lib/line");
          const lc = getLineClient();
          if (!lc) {
            notifyResults.line = { ok: false, error: "LINE Channel access token 未設定" };
          } else {
            await lc.pushMessage({ to: wish.user.lineUserId, messages: [{ type: "text", text: lineText }] });
            notifyResults.line = { ok: true };
          }
        } catch (e) {
          notifyResults.line = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    if (data.notifyChannels.includes("email")) {
      if (!wish.user.email) {
        notifyResults.email = { ok: false, error: "客戶未填寫 Email" };
      } else if (!wish.user.notifyByEmail) {
        notifyResults.email = { ok: false, error: "客戶關閉了 Email 通知" };
      } else {
        try {
          const { sendEmail } = await import("@/lib/email/send");
          await sendEmail({
            to: wish.user.email,
            subject: `${appName} — 願望單已開出場次`,
            html: `<div style="font-family: 'PingFang TC','Microsoft JhengHei',sans-serif; max-width:600px; padding:24px">
              <p>${(wish.user.realName ?? wish.user.displayName ?? "客戶")} 您好：</p>
              <p>${(opener).replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>
              <pre style="white-space:pre-wrap; font-family:inherit; background:#f8fafc; padding:14px; border-radius:8px; line-height:1.7">${what.replace(/</g, "&lt;")}</pre>
              <p style="margin-top:20px"><a href="${bookUrl}" style="display:inline-block; background:#00D9CB; color:#0A2342; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:bold">👉 點此預約</a></p>
              <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb" />
              <p style="font-size:12px; color:#6b7280">${appName}</p>
            </div>`,
          });
          notifyResults.email = { ok: true };
        } catch (e) {
          notifyResults.email = { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      }
    }

    return NextResponse.json({ ok: true, wish: updated, bookUrl, notifyResults });
  } catch (e) {
    console.error("[wish convert]", e);
    return NextResponse.json({ error: "convert_failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
