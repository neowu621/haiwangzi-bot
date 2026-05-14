import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { buildFlexByKey } from "@/lib/flex";
import { sendEmail } from "@/lib/email/send";
import { weatherCancelEmail } from "@/lib/email/templates";

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

  // ── 讀 SiteConfig：weatherAutoCancel 開關 ─────────────
  // false (預設安全)：cron 只推警告給教練 LINE，不動 DB 不通知客戶
  // true：cron 自動 cancel + 通知所有客戶（舊行為）
  const siteConfig = await prisma.siteConfig
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  const autoCancel = siteConfig?.weatherAutoCancel ?? false;

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

  // 教練只看警告模式（autoCancel=false）：推 LINE 給場次教練 + admin，請手動決定
  if (!autoCancel && !dryRun) {
    const coachWarnings: Array<{ tripId: string; coachPushed: number }> = [];
    if (trips.length > 0 && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      const client = getLineClient();
      // 收集所有相關教練 + admin
      const allCoachIds = Array.from(new Set(trips.flatMap((t) => t.coachIds)));
      const coachUsers = await prisma.coach.findMany({
        where: { id: { in: allCoachIds }, lineUserId: { not: null } },
        select: { lineUserId: true, realName: true },
      });
      const admins = await prisma.user.findMany({
        where: { role: "admin" },
        select: { lineUserId: true, displayName: true },
      });
      const recipients = [
        ...coachUsers.map((c) => c.lineUserId).filter(Boolean),
        ...admins.map((a) => a.lineUserId),
      ] as string[];

      for (const trip of trips) {
        const sites = await prisma.diveSite.findMany({
          where: { id: { in: trip.diveSiteIds } },
        });
        const siteName = sites.map((s) => s.name).join(" · ") || "東北角";
        const dateStr = trip.date.toISOString().slice(0, 10);

        const adminUrl = process.env.NEXT_PUBLIC_BASE_URL
          ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/admin/trips`
          : "https://liff.line.me/";

        const text =
          `⚠ 海況警告（自動取消已關閉，需手動處理）\n\n` +
          `場次：${dateStr} ${trip.startTime}\n` +
          `潛點：${siteName}\n` +
          `${maxStation} 風速 ${maxWind} m/s > 安全閾值 ${threshold} m/s\n\n` +
          `若決定取消，請到開團管理頁面手動取消：\n${adminUrl}`;

        let pushed = 0;
        for (const r of recipients) {
          try {
            await client.pushMessage({
              to: r,
              messages: [{ type: "text", text }],
            });
            pushed++;
          } catch (e) {
            console.error("[weather warn]", r, e);
          }
        }
        coachWarnings.push({ tripId: trip.id, coachPushed: pushed });
      }
    }
    return NextResponse.json({
      ok: true,
      action: "warned_coaches_only",
      autoCancel: false,
      maxWind,
      maxStation,
      stationReadings,
      threshold,
      waveSource,
      coachWarnings,
      counts: { warned: coachWarnings.length },
      tookMs: Date.now() - startedAt.getTime(),
    });
  }

  // autoCancel=true (或 dryRun)：執行舊邏輯
  const cancelled: Array<{ tripId: string; pushed: number; emailed?: number }> = [];
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
          include: { user: true },
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

        // 推通知（LINE + Email 雙通道）
        const sites = await prisma.diveSite.findMany({
          where: { id: { in: trip.diveSiteIds } },
        });
        const siteName = sites.map((s) => s.name).join(" · ") || "東北角";
        const dateStr = trip.date.toISOString().slice(0, 10);
        const reasonStr = `今日 ${maxStation} 風速 ${maxWind} m/s，超過下水安全閾值 ${threshold} m/s`;
        const myUrl = process.env.NEXT_PUBLIC_BASE_URL
          ? `${process.env.NEXT_PUBLIC_BASE_URL}/liff/my`
          : "https://line.me/";

        let pushed = 0;
        let emailed = 0;

        // LINE 推 Flex
        if (process.env.LINE_CHANNEL_ACCESS_TOKEN && bookings.length > 0) {
          const client = getLineClient();
          const msg = buildFlexByKey(
            "weather_cancel",
            {
              date: dateStr,
              time: trip.startTime,
              site: siteName,
              reason: reasonStr,
              options: "1. 改期至下次同類型場次\n2. 全額退費",
              url: myUrl,
            },
            `${dateStr} 因海況取消`,
          );
          for (const b of bookings) {
            if (!b.user.notifyByLine) continue;
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
        }

        // Email 通道
        for (const b of bookings) {
          if (!b.user.notifyByEmail || !b.user.email) continue;
          const tpl = weatherCancelEmail({
            name: b.user.realName ?? b.user.displayName,
            date: dateStr,
            time: trip.startTime,
            site: siteName,
            reason: reasonStr,
            url: myUrl,
          });
          const r = await sendEmail({
            to: b.user.email,
            subject: tpl.subject,
            text: tpl.text,
            html: tpl.html,
          });
          if (r.ok) emailed++;
        }

        cancelled.push({ tripId: trip.id, pushed, emailed });
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
    autoCancel,
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
