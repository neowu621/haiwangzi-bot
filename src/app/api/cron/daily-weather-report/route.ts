import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLineClient } from "@/lib/line";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v264: /api/cron/daily-weather-report
 *
 * 由 Cronicle 每天 06:00（建議）觸發。抓 CWA 風速資料 + 今日/明日場次數 →
 * 發送日報給老闆（LINE + Email）。
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * 收件人從 SiteConfig.dailyWeatherReportRecipients 讀取，格式：
 *   ["line:Uxxx", "email:xxx@yy.com", ...]
 *
 * 若 SiteConfig.dailyWeatherReportEnabled = false → no-op
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
  WeatherElement?: {
    WindSpeed?: string;
    WindDirection?: string;
    Now?: { Precipitation?: string };
    AirTemperature?: string;
  };
}

async function handle(req: NextRequest) {
  // Bearer auth
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "site config missing" });
  }

  const enabled =
    (cfg as unknown as { dailyWeatherReportEnabled?: boolean })
      .dailyWeatherReportEnabled ?? false;
  if (!enabled) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "daily weather report disabled in admin settings",
    });
  }

  const recipientsRaw =
    (cfg as unknown as { dailyWeatherReportRecipients?: unknown })
      .dailyWeatherReportRecipients;
  const recipients: string[] = Array.isArray(recipientsRaw)
    ? recipientsRaw.filter((x): x is string => typeof x === "string")
    : [];
  if (recipients.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no recipients configured",
    });
  }

  const startedAt = new Date();
  const threshold = cfg.weatherWindThreshold ?? 10;

  // ── 1. 抓 CWA 即時測站 ──────────────────────────────
  const stationIds = (process.env.WEATHER_STATIONS ?? "466940,467080")
    .split(",")
    .map((s) => s.trim());
  let maxWind: number | null = null;
  let stationReadings: Array<{ name: string; wind: number | null; temp: number | null }> = [];

  if (process.env.CWA_API_KEY) {
    try {
      const res = await fetch(
        `https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${process.env.CWA_API_KEY}&format=JSON`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          records?: { Station?: CWAStation[] };
        };
        const stations = data.records?.Station ?? [];
        for (const sid of stationIds) {
          const s = stations.find((x) => x.StationId === sid);
          if (!s) continue;
          const ws = s.WeatherElement?.WindSpeed;
          const wind = ws && ws !== "-99" && ws !== "" ? Number(ws) : null;
          const t = s.WeatherElement?.AirTemperature;
          const temp = t && t !== "-99" && t !== "" ? Number(t) : null;
          stationReadings.push({ name: s.StationName, wind, temp });
          if (wind != null && (maxWind == null || wind > maxWind)) maxWind = wind;
        }
      }
    } catch (e) {
      console.error("[daily-weather-report] CWA fetch failed", e);
    }
  }

  // ── 2. 抓今日 / 明日場次 ────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);

  const [todayTrips, tomorrowTrips] = await Promise.all([
    prisma.divingTrip.findMany({
      where: { date: { gte: today, lt: tomorrow }, status: "open" },
      orderBy: { startTime: "asc" },
    }),
    prisma.divingTrip.findMany({
      where: { date: { gte: tomorrow, lt: dayAfter }, status: "open" },
      orderBy: { startTime: "asc" },
    }),
  ]);

  // 拿訂單人數
  const allTripIds = [...todayTrips, ...tomorrowTrips].map((t) => t.id);
  const bookings = allTripIds.length
    ? await prisma.booking.groupBy({
        by: ["refId"],
        where: {
          refId: { in: allTripIds },
          type: "daily",
          status: { in: ["pending", "confirmed"] },
        },
        _sum: { participants: true },
      })
    : [];
  const bookedMap = new Map(
    bookings.map((b) => [b.refId, b._sum.participants ?? 0]),
  );

  // ── 3. 組訊息 ──────────────────────────────────────
  const dateStr = today.toLocaleDateString("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const windStatus =
    maxWind == null
      ? "（無資料）"
      : maxWind > threshold
        ? `🔴 ${maxWind.toFixed(1)} m/s（超過 ${threshold} m/s 門檻，建議考慮取消）`
        : `🟢 ${maxWind.toFixed(1)} m/s（低於 ${threshold} m/s 門檻，可正常下水）`;

  const stationLines = stationReadings
    .map(
      (s) =>
        `  ${s.name}：風${s.wind != null ? `${s.wind.toFixed(1)} m/s` : "-"}  溫${s.temp != null ? `${s.temp.toFixed(1)}°C` : "-"}`,
    )
    .join("\n");

  const todayLines = todayTrips.length
    ? todayTrips
        .map((t) => {
          const booked = bookedMap.get(t.id) ?? 0;
          const cap = t.capacity ?? "∞";
          return `  ${t.startTime}（${booked}/${cap}人${t.isNightDive ? " 夜潛" : ""}${t.isScooter ? " 水推" : ""}）`;
        })
        .join("\n")
    : "  （無）";

  const tomorrowLines = tomorrowTrips.length
    ? tomorrowTrips
        .map((t) => {
          const booked = bookedMap.get(t.id) ?? 0;
          const cap = t.capacity ?? "∞";
          return `  ${t.startTime}（${booked}/${cap}人）`;
        })
        .join("\n")
    : "  （無）";

  const textReport = `🌊 海王子潛水 每日營運報告
${dateStr}

【海況】
今日風速：${windStatus}
測站讀數：
${stationLines || "  （無資料）"}

【今日場次】
${todayLines}

【明日場次】
${tomorrowLines}

—
此訊息由系統每日自動發送`;

  const subject = `🌊 海王子日報 ${dateStr}（風速 ${maxWind?.toFixed(1) ?? "-"} m/s）`;

  // ── 4. 發送 ──────────────────────────────────────
  const lineClient = getLineClient();
  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (const r of recipients) {
    try {
      if (r.startsWith("line:")) {
        const userId = r.slice(5);
        if (!lineClient) {
          results.push({ to: r, ok: false, error: "LINE client not configured" });
          continue;
        }
        await lineClient.pushMessage({
          to: userId,
          messages: [{ type: "text", text: textReport }],
        });
        results.push({ to: r, ok: true });
      } else if (r.startsWith("email:")) {
        const to = r.slice(6);
        const html = `<pre style="font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;font-size:14px;line-height:1.7;white-space:pre-wrap;">${textReport.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
        const er = await sendEmail({ to, subject, text: textReport, html });
        results.push({ to: r, ok: er.ok, error: er.error });
      } else {
        results.push({ to: r, ok: false, error: "unrecognized recipient prefix (use line: or email:)" });
      }
    } catch (e) {
      results.push({
        to: r,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── 5. 記錄最後發送時間 ──────────────────────────
  await prisma.siteConfig.update({
    where: { id: "default" },
    data: { dailyWeatherReportLastSentAt: new Date() } as never,
  });

  return NextResponse.json({
    ok: true,
    maxWind,
    stationReadings,
    todayTripsCount: todayTrips.length,
    tomorrowTripsCount: tomorrowTrips.length,
    results,
    tookMs: Date.now() - startedAt.getTime(),
  });
}
