/**
 * v268：每日天氣回報 — 共用 lib（被 cron endpoint + admin 測試 endpoint 共用）
 *
 * 抓 CWA 即時測站風速 + 今/明日場次 → 推送 LINE / Email 給 SiteConfig 設定的收件人。
 */
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import { sendEmail } from "./email/send";
import {
  buildMarineSection,
  DEFAULT_MARINE_POINTS,
  DEFAULT_MARINE_FIELDS,
  type MarinePoint,
  type MarineFields,
} from "./marine";

interface CWAStation {
  StationId: string;
  StationName: string;
  WeatherElement?: {
    WindSpeed?: string;
    WindDirection?: string;
    AirTemperature?: string;
  };
}

export interface DailyWeatherResult {
  ok: true;
  skipped?: boolean;
  reason?: string;
  maxWind?: number | null;
  stationReadings?: Array<{ name: string; wind: number | null; temp: number | null }>;
  todayTripsCount?: number;
  tomorrowTripsCount?: number;
  results?: Array<{ to: string; ok: boolean; error?: string }>;
  textPreview?: string;
  tookMs?: number;
}

export async function runDailyWeatherReport(opts?: {
  /** 測試模式：只組訊息，不真的寄出（只回 textPreview）。預設 false。 */
  dryRun?: boolean;
  /** 強制使用這組收件人（覆寫 SiteConfig），用於 admin 測試 */
  overrideRecipients?: string[];
}): Promise<DailyWeatherResult> {
  const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
  if (!cfg) {
    return { ok: true, skipped: true, reason: "site config missing" };
  }

  const enabled =
    (cfg as unknown as { dailyWeatherReportEnabled?: boolean })
      .dailyWeatherReportEnabled ?? false;
  if (!enabled && !opts?.overrideRecipients) {
    return { ok: true, skipped: true, reason: "daily weather report disabled" };
  }

  const recipientsRaw = opts?.overrideRecipients ?? (
    (cfg as unknown as { dailyWeatherReportRecipients?: unknown })
      .dailyWeatherReportRecipients
  );
  const recipients: string[] = Array.isArray(recipientsRaw)
    ? recipientsRaw.filter((x): x is string => typeof x === "string")
    : [];
  if (recipients.length === 0 && !opts?.dryRun) {
    return { ok: true, skipped: true, reason: "no recipients configured" };
  }

  const startedAt = Date.now();
  const threshold = cfg.weatherWindThreshold ?? 10;

  // v389：發送內容開關（缺省全開、wave 預設關）
  const contentRaw = (cfg as unknown as { weatherReportContent?: unknown }).weatherReportContent;
  const content = {
    wind: true,
    temp: true,
    sessions: true,
    wave: false,
    ...(contentRaw && typeof contentRaw === "object" && !Array.isArray(contentRaw)
      ? (contentRaw as Record<string, boolean>)
      : {}),
  };

  // ── 1. 抓 CWA 即時測站 ──────────────────────────────
  const stationIds = (process.env.WEATHER_STATIONS ?? "466940,467080")
    .split(",")
    .map((s) => s.trim());
  let maxWind: number | null = null;
  const stationReadings: Array<{ name: string; wind: number | null; temp: number | null }> = [];

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

  // ── 1b. 抓海象（CWA O-B0075-001 浮標+潮位）v411 ─────────
  const marineEnabled = (cfg as unknown as { weatherMarineEnabled?: boolean }).weatherMarineEnabled ?? false;
  let marineBlock: { text: string; light: "🟢" | "🟡" | "🔴" } | null = null;
  if (marineEnabled) {
    const rawPts = (cfg as unknown as { weatherMarinePoints?: unknown }).weatherMarinePoints;
    const points: MarinePoint[] = Array.isArray(rawPts) && rawPts.length > 0
      ? (rawPts as unknown[])
          .filter((p): p is MarinePoint => !!p && typeof p === "object" && typeof (p as MarinePoint).buoyId === "string")
          .map((p) => ({ label: String(p.label ?? ""), buoyId: String(p.buoyId ?? ""), tideId: String(p.tideId ?? "") }))
      : DEFAULT_MARINE_POINTS;
    const rawFields = (cfg as unknown as { weatherMarineFields?: unknown }).weatherMarineFields;
    const fields: MarineFields = rawFields && typeof rawFields === "object" && !Array.isArray(rawFields)
      ? { ...DEFAULT_MARINE_FIELDS, ...(rawFields as Partial<MarineFields>) }
      : DEFAULT_MARINE_FIELDS;
    marineBlock = await buildMarineSection(points, fields, process.env.CWA_API_KEY);
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

  // v389：測站讀數依「風速 / 氣溫」開關決定顯示哪些欄位
  const stationLines = stationReadings
    .map((s) => {
      const parts: string[] = [];
      if (content.wind) parts.push(`風${s.wind != null ? `${s.wind.toFixed(1)} m/s` : "-"}`);
      if (content.temp) parts.push(`溫${s.temp != null ? `${s.temp.toFixed(1)}°C` : "-"}`);
      return `  ${s.name}：${parts.join("  ") || "-"}`;
    })
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

  // v389：依內容開關組裝各區塊
  const blocks: string[] = [`🌊 海王子潛水 每日營運報告`, dateStr];

  if (content.wind || content.temp) {
    const seaLines: string[] = ["", "【海況】"];
    if (content.wind) seaLines.push(`今日風速：${windStatus}`);
    if (content.wind || content.temp) {
      seaLines.push("測站讀數：", stationLines || "  （無資料）");
    }
    blocks.push(seaLines.join("\n"));
  }

  // v411：海象區塊（龍洞區 / 基隆區，真實浪高/海溫/海流/潮位 + 自動判斷）
  if (marineBlock) {
    const overall =
      marineBlock.light === "🔴" ? "⚠️ 部分海域不建議下水"
        : marineBlock.light === "🟡" ? "尚可，部分海域請留意"
          : "良好，適合下水 🤿";
    blocks.push(["", marineBlock.text, "", `—— 綜合海況：${marineBlock.light} ${overall}`].join("\n"));
  }

  if (content.sessions) {
    blocks.push(["", "【今日場次】", todayLines, "", "【明日場次】", tomorrowLines].join("\n"));
  }

  blocks.push("", "—", `此訊息由系統${opts?.dryRun ? "（測試模式）" : "每日自動"}發送`);

  const textReport = blocks.join("\n");

  const subject = `🌊 海王子日報 ${dateStr}（風速 ${maxWind?.toFixed(1) ?? "-"} m/s）`;

  // ── 4. dry-run 直接回 preview，不發送 ──────────────
  if (opts?.dryRun) {
    return {
      ok: true,
      maxWind,
      stationReadings,
      todayTripsCount: todayTrips.length,
      tomorrowTripsCount: tomorrowTrips.length,
      results: [],
      textPreview: textReport,
      tookMs: Date.now() - startedAt,
    };
  }

  // ── 5. 真的發送 ─────────────────────────────────────
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

  // ── 6. 記錄最後發送時間 ──────────────────────────
  await prisma.siteConfig.update({
    where: { id: "default" },
    data: { dailyWeatherReportLastSentAt: new Date() } as never,
  });

  return {
    ok: true,
    maxWind,
    stationReadings,
    todayTripsCount: todayTrips.length,
    tomorrowTripsCount: tomorrowTrips.length,
    results,
    textPreview: textReport,
    tookMs: Date.now() - startedAt,
  };
}
