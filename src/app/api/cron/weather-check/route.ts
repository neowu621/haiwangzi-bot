import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/weather-check
 *
 * 由 Cronicle 每天早上 06:00 觸發。
 * 抓中央氣象局東北角海域開放資料，若浪高 > 1.5m 自動把當天所有 open 場次標記
 * cancelled_by_weather，並推 Flex 取消通知給所有已預約的客戶。
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  (與 reminders endpoint 同一個 secret)
 *
 * 中央氣象局 開放資料 API (海象):
 *   https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0085-002
 *   ?Authorization=<CWA_API_KEY>
 *
 * Env vars:
 *   CWA_API_KEY (optional, 沒設就 dry-run 不取消)
 *   WEATHER_WAVE_THRESHOLD (預設 1.5)
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  // ── Bearer 驗證 ────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "server_misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const forceWaveHeight = url.searchParams.get("force_wave"); // 測試用：強制指定浪高
  const threshold = Number(process.env.WEATHER_WAVE_THRESHOLD ?? 1.5);

  const startedAt = new Date();

  // ── 抓今天的浪高 ────────────────────────────────────
  let waveHeight: number | null = null;
  let waveSource = "not_fetched";

  if (forceWaveHeight) {
    waveHeight = Number(forceWaveHeight);
    waveSource = "forced_param";
  } else if (process.env.CWA_API_KEY) {
    try {
      const res = await fetch(
        `https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-A0085-002?Authorization=${process.env.CWA_API_KEY}&format=JSON`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          records?: { locations?: Array<{ location?: Array<{ locationName?: string; weatherElement?: Array<{ elementName?: string; time?: Array<{ elementValue?: Array<{ value?: string }> }> }> }> }> };
        };
        // 抓「東北部海域」的浪高（這個 API 結構複雜，盡量抓首筆 wave height）
        const locations = data.records?.locations?.[0]?.location ?? [];
        const northeast = locations.find((l) => l.locationName?.includes("東北")) || locations[0];
        const wh = northeast?.weatherElement?.find((e) => e.elementName === "WaveHt");
        const v = wh?.time?.[0]?.elementValue?.[0]?.value;
        if (v) {
          waveHeight = Number(v);
          waveSource = "cwa";
        }
      }
    } catch (e) {
      console.error("[weather-check] CWA fetch failed", e);
    }
  }

  // ── 沒拿到資料就 no-op ──────────────────────────────
  if (waveHeight == null) {
    return NextResponse.json({
      ok: true,
      note: "no wave data available; skip",
      threshold,
      waveSource,
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  // ── 浪高沒超就 no-op ──────────────────────────────
  if (waveHeight <= threshold) {
    return NextResponse.json({
      ok: true,
      action: "no_cancel",
      waveHeight,
      threshold,
      cancelled: 0,
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  // ── 浪高超過 → 取消今天的所有 open 場次 ──────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const trips = await prisma.divingTrip.findMany({
    where: {
      date: { gte: todayStart, lt: todayEnd },
      status: "open",
    },
  });

  const cancelled: Array<{ tripId: string; pushed: number }> = [];
  const errors: Array<{ tripId: string; error: string }> = [];

  for (const trip of trips) {
    try {
      await prisma.divingTrip.update({
        where: { id: trip.id },
        data: {
          status: "cancelled",
          cancelReason: "weather",
          weatherNote: `浪高 ${waveHeight}m > 安全閾值 ${threshold}m`,
        },
      });

      // 把該場次的 bookings 也標記 cancelled_by_weather
      const bookings = await prisma.booking.findMany({
        where: { refId: trip.id, type: "daily", status: "confirmed" },
        include: { user: true },
      });
      for (const b of bookings) {
        await prisma.booking.update({
          where: { id: b.id },
          data: {
            status: "cancelled_by_weather",
            cancellationReason: `浪高 ${waveHeight}m > 安全閾值`,
          },
        });
      }

      // 推 Flex 通知客戶
      if (process.env.LINE_CHANNEL_ACCESS_TOKEN && bookings.length > 0) {
        const client = getLineClient();
        const sites = await prisma.diveSite.findMany({
          where: { id: { in: trip.diveSiteIds } },
        });
        const siteName = sites.map((s) => s.name).join(" · ") || "東北角";

        const msg = buildFlexByKey(
          "weather_cancel",
          {
            date: trip.date.toISOString().slice(0, 10),
            time: trip.startTime,
            site: siteName,
            reason: `今日浪高 ${waveHeight}m，超過安全閾值 ${threshold}m`,
            options: "1. 改期至下次同類型場次\n2. 全額退費",
            url: process.env.NEXT_PUBLIC_BASE_URL
              ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/my`
              : "https://line.me/",
          },
          `${trip.date.toISOString().slice(0, 10)} 因海況取消`,
        );

        let pushed = 0;
        for (const b of bookings) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await client.pushMessage({ to: b.userId, messages: [msg as any] });
            pushed++;
          } catch (e) {
            console.error("[weather push]", b.userId, e);
          }
        }
        cancelled.push({ tripId: trip.id, pushed });
      } else {
        cancelled.push({ tripId: trip.id, pushed: 0 });
      }
    } catch (e) {
      errors.push({
        tripId: trip.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    action: "weather_cancel",
    waveHeight,
    threshold,
    waveSource,
    cancelled,
    errors,
    counts: { cancelled: cancelled.length, errors: errors.length },
    tookMs: Date.now() - startedAt.getTime(),
  });
}
