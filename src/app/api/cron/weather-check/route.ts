import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/cron/weather-check
 *
 * 由 Cronicle 每天早上 06:00 觸發 (cron: `0 22 * * *` UTC)。
 * 抓中央氣象署即時測站資料 (O-A0001-001)，看 NE 海域風速。
 * 風速 > WEATHER_WIND_THRESHOLD (預設 10 m/s ≈ Beaufort 5「強風」) 即視為不適合下水：
 *   - 把當天 status=open 的場次標為 cancelled_by_weather
 *   - 推 Flex `weather_cancel` 給所有相關客戶
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Env vars:
 *   CWA_API_KEY                  — 中央氣象署 API key (https://opendata.cwa.gov.tw/user/authkey)
 *   WEATHER_WIND_THRESHOLD       — 風速閾值 m/s (預設 10)
 *   WEATHER_STATIONS             — 監測站 ID, 逗號分隔 (預設 "466940,467080" = 基隆+宜蘭)
 *
 * 測試:
 *   - 強制觸發取消邏輯: ?force_wind=15
 *   - 強制跳過 LINE push: ?dry_run=1
 */
export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

interface CWAStation {
  StationId: string;
  StationName: string;
  ObsTime?: { DateTime?: string };
  WeatherElement?: {
    WindSpeed?: string;
    WindDirection?: string;
    GustInfo?: { PeakGustSpeed?: string };
  };
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
  const forceWind = url.searchParams.get("force_wind");
  const dryRun = url.searchParams.get("dry_run") === "1";

  const threshold = Number(process.env.WEATHER_WIND_THRESHOLD ?? 10);
  const stationIds = (process.env.WEATHER_STATIONS ?? "466940,467080")
    .split(",")
    .map((s) => s.trim());

  const startedAt = new Date();

  // ── 抓今天的風速 ────────────────────────────────────
  let maxWind: number | null = null;
  let maxStation = "";
  const stationReadings: Array<{
    id: string;
    name: string;
    windSpeed: number | null;
  }> = [];
  let waveSource = "not_fetched";

  if (forceWind) {
    maxWind = Number(forceWind);
    maxStation = "force_param";
    waveSource = "forced";
  } else if (process.env.CWA_API_KEY) {
    try {
      const res = await fetch(
        `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${process.env.CWA_API_KEY}&format=JSON`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          error: `CWA fetch HTTP ${res.status}`,
        });
      }
      const data = (await res.json()) as {
        records?: { Station?: CWAStation[] };
      };
      const stations = data.records?.Station ?? [];
      for (const sid of stationIds) {
        const s = stations.find((x) => x.StationId === sid);
        if (!s) {
          stationReadings.push({ id: sid, name: "(not found)", windSpeed: null });
          continue;
        }
        const ws = s.WeatherElement?.WindSpeed;
        const num =
          ws && ws !== "-99" && ws !== "" ? Number(ws) : null;
        stationReadings.push({
          id: sid,
          name: s.StationName,
          windSpeed: num,
        });
        if (num != null && (maxWind == null || num > maxWind)) {
          maxWind = num;
          maxStation = `${s.StationName} (${sid})`;
        }
      }
      waveSource = "cwa";
    } catch (e) {
      console.error("[weather-check] CWA fetch failed", e);
      return NextResponse.json({
        ok: false,
        error: `CWA fetch error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // ── 沒拿到資料 (沒 API key 或 CWA fail) → no-op ──────
  if (maxWind == null) {
    return NextResponse.json({
      ok: true,
      note: "no wind data available; skip",
      threshold,
      stationIds,
      stationReadings,
      waveSource,
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  // ── 風速沒超過閾值 → no-op ──────────────────────────
  if (maxWind <= threshold) {
    return NextResponse.json({
      ok: true,
      action: "no_cancel",
      maxWind,
      maxStation,
      stationReadings,
      threshold,
      waveSource,
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  // ── 風速超過閾值 → 取消今天的 open 場次 ─────────────
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
      if (!dryRun) {
        await prisma.divingTrip.update({
          where: { id: trip.id },
          data: {
            status: "cancelled",
            cancelReason: "weather",
            weatherNote: `風速 ${maxWind} m/s @${maxStation} > 安全閾值 ${threshold} m/s`,
          },
        });

        const bookings = await prisma.booking.findMany({
          where: { refId: trip.id, type: "daily", status: "confirmed" },
        });
        for (const b of bookings) {
          await prisma.booking.update({
            where: { id: b.id },
            data: {
              status: "cancelled_by_weather",
              cancellationReason: `風速 ${maxWind} m/s 超過安全閾值`,
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
              reason: `今日 ${maxStation} 風速 ${maxWind} m/s，超過下水安全閾值 ${threshold} m/s`,
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
              await client.pushMessage({
                to: b.userId,
                messages: [msg as any],
              });
              pushed++;
            } catch (e) {
              console.error("[weather push]", b.userId, e);
            }
          }
          cancelled.push({ tripId: trip.id, pushed });
        } else {
          cancelled.push({ tripId: trip.id, pushed: 0 });
        }
      } else {
        cancelled.push({ tripId: trip.id, pushed: 0 }); // dry run
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
    action: dryRun ? "dry_run_would_cancel" : "weather_cancel",
    maxWind,
    maxStation,
    stationReadings,
    threshold,
    waveSource,
    cancelled,
    errors,
    counts: { cancelled: cancelled.length, errors: errors.length },
    tookMs: Date.now() - startedAt.getTime(),
  });
}
