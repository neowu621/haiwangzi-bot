/**
 * v268：每日天氣回報 — 共用 lib（被 cron endpoint + admin 測試 endpoint 共用）
 *
 * 抓 CWA 即時測站風速 + 今/明日場次 → 推送 LINE / Email 給 SiteConfig 設定的收件人。
 */
import { prisma } from "./prisma";
import { getLineClient } from "./line";
import { sendEmail } from "./email/send";
import { BUSINESS } from "./business-info"; // v856：品牌 logo（Email/LINE 用 PNG、站內用 WebP）
import type { messagingApi } from "@line/bot-sdk";
import {
  buildMarineSection,
  DEFAULT_MARINE_POINTS,
  DEFAULT_MARINE_FIELDS,
  judgeWave,        // v1031：Email 表格用
  judgeCurrent,
  recommendWetsuit,
  type MarinePoint,
  type MarineFields,
  type MarineReading,
} from "./marine";
import { buildForecastDays } from "./forecast";

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

// v856：LINE 訊息 —— Flex（頁首帶專屬 logo）。LINE 純文字訊息放不了自訂圖，故改 Flex。
//   altText 保留純文字，通知列/舊版客戶端仍可讀。
function buildReportMessage(dateStr: string, bodyReport: string, textReport: string): messagingApi.Message {
  return {
    type: "flex",
    altText: textReport.slice(0, 400),
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "horizontal",
        backgroundColor: "#0A2342",
        paddingAll: "12px",
        spacing: "md",
        contents: [
          { type: "image", url: BUSINESS.logoPng, size: "28px", aspectMode: "fit", aspectRatio: "1:1", flex: 0 },
          {
            type: "box",
            layout: "vertical",
            contents: [
              { type: "text", text: "DAILY REPORT", size: "xxs", color: "#8fd8ff", weight: "bold" },
              { type: "text", text: `每日營運報告 ${dateStr}`, size: "sm", color: "#ffffff", weight: "bold", wrap: true },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "13px",
        contents: [{ type: "text", text: bodyReport || "（無內容）", size: "sm", color: "#1a2330", wrap: true }],
      },
    },
  };
}

// v1031：Email 改「表格化」呈現（比純文字好讀）。用 table 排版相容 Outlook / Gmail。
const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TH = "padding:7px 9px;font-size:12px;font-weight:700;color:#5b6b7a;background:#eef3f8;border-bottom:1px solid #dbe3ec;text-align:left;white-space:nowrap;";
const TD = "padding:7px 9px;font-size:13px;color:#1A2330;border-bottom:1px solid #eef2f7;vertical-align:top;";
const SEC = "margin:18px 0 7px;font-size:14px;font-weight:800;color:#0A2342;";

export interface ReportTripRow { day: string; time: string; place: string; booked: number; cap: string; extras: string }
export interface ReportStationRow { name: string; wind: string; temp: string }
export interface ReportMarineRow {
  label: string; wave: string; waveJudge: string; waveDir: string; period: string;
  seaTemp: string; wetsuit: string; current: string; currentJudge: string; tide: string;
}
export interface ReportData {
  trips: ReportTripRow[];
  forecast: string[];
  overall: string | null;
  windStatus: string;
  stations: ReportStationRow[];
  marine: ReportMarineRow[];
  footNote: string;
}

function emailHtml(dateStr: string, d: ReportData): string {
  const tbl = (inner: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;border:1px solid #dbe3ec;border-radius:8px;overflow:hidden;">${inner}</table>`;

  // 場次
  const tripsHtml = d.trips.length
    ? tbl(
        `<tr><th style="${TH}">日期</th><th style="${TH}">時間</th><th style="${TH}">潛點</th><th style="${TH}">人數</th></tr>` +
        d.trips.map((t) => `<tr>
          <td style="${TD}white-space:nowrap;font-weight:700;">${esc(t.day)}</td>
          <td style="${TD}white-space:nowrap;font-family:ui-monospace,monospace;">${esc(t.time)}</td>
          <td style="${TD}">${esc(t.place || "—")}${t.extras ? `<span style="color:#6b7280;font-size:12px;">${esc(t.extras)}</span>` : ""}</td>
          <td style="${TD}white-space:nowrap;font-family:ui-monospace,monospace;">${esc(t.booked)}/${esc(t.cap)}</td>
        </tr>`).join(""),
      )
    : `<div style="font-size:13px;color:#6b7280;">（今明無場次）</div>`;

  // 測站
  const stationsHtml = d.stations.length
    ? tbl(
        `<tr><th style="${TH}">測站</th><th style="${TH}">風速</th><th style="${TH}">氣溫</th></tr>` +
        d.stations.map((s) => `<tr>
          <td style="${TD}white-space:nowrap;font-weight:700;">${esc(s.name)}</td>
          <td style="${TD}white-space:nowrap;">${esc(s.wind)}</td>
          <td style="${TD}white-space:nowrap;">${esc(s.temp)}</td>
        </tr>`).join(""),
      )
    : "";

  // 海象（每區一列）
  const marineHtml = d.marine.length
    ? tbl(
        `<tr><th style="${TH}">海域</th><th style="${TH}">浪高</th><th style="${TH}">海溫 / 防寒衣</th><th style="${TH}">海流</th><th style="${TH}">潮位</th></tr>` +
        d.marine.map((m) => `<tr>
          <td style="${TD}white-space:nowrap;font-weight:700;">${esc(m.label)}</td>
          <td style="${TD}white-space:nowrap;">${esc(m.wave)}${m.waveJudge ? `<br><span style="font-size:12px;color:#6b7280;">${esc(m.waveJudge)}</span>` : ""}${m.waveDir || m.period ? `<br><span style="font-size:11.5px;color:#8a97a6;">${esc([m.waveDir, m.period].filter(Boolean).join(" / "))}</span>` : ""}</td>
          <td style="${TD}white-space:nowrap;">${esc(m.seaTemp)}${m.wetsuit ? `<br><span style="font-size:12px;color:#6b7280;">${esc(m.wetsuit)}</span>` : ""}</td>
          <td style="${TD}white-space:nowrap;">${esc(m.current)}${m.currentJudge ? `<br><span style="font-size:12px;color:#6b7280;">${esc(m.currentJudge)}</span>` : ""}</td>
          <td style="${TD}white-space:nowrap;">${esc(m.tide)}</td>
        </tr>`).join(""),
      )
    : "";

  return `<div style="font-family:'Noto Sans TC','Microsoft JhengHei',sans-serif;color:#1A2330;max-width:680px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr>
    <td width="34" style="padding-right:10px;vertical-align:middle;">
      <img src="${BUSINESS.logoPng}" alt="東北角海王子潛水" width="34" height="34" style="width:34px;height:34px;border-radius:8px;display:block;">
    </td>
    <td style="vertical-align:middle;">
      <h2 style="margin:0;font-size:18px;color:#0A2342;">海王子潛水 每日營運報告</h2>
      <div style="font-size:12px;color:#6b7280;">${esc(dateStr)}</div>
    </td>
  </tr></table>

  ${d.overall ? `<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:#f4f9f8;border:1px solid #dbe9e6;font-size:14px;font-weight:700;">${esc(d.overall)}</div>` : ""}

  <div style="${SEC}">🔱 今明場次</div>
  ${tripsHtml}

  ${d.forecast.length ? `<div style="${SEC}">🌤 天氣預報</div>
  <div style="font-size:13px;line-height:1.8;color:#33464e;white-space:pre-wrap;">${esc(d.forecast.join("\n"))}</div>` : ""}

  ${d.windStatus ? `<div style="${SEC}">💨 海況</div>
  <div style="font-size:13px;margin-bottom:7px;">今日風速：${esc(d.windStatus)}</div>` : ""}
  ${stationsHtml}

  ${marineHtml ? `<div style="${SEC}">🌊 海象明細</div>${marineHtml}` : ""}

  <div style="margin-top:16px;padding-top:10px;border-top:1px solid #eef2f7;font-size:11.5px;color:#8a97a6;">${esc(d.footNote)}</div>
</div>`;
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

  // v389：發送內容開關（缺省全開、wave 預設關；v456 加 forecast 預設開）
  const contentRaw = (cfg as unknown as { weatherReportContent?: unknown }).weatherReportContent;
  const content = {
    wind: true,
    temp: true,
    sessions: true,
    wave: false,
    forecast: true,
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
  let marineBlock: { text: string; light: "🟢" | "🟡" | "🔴"; rows: MarineReading[] } | null = null;
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

  // ── 1c. 天氣預報（F-D0047 鄉鎮 3 天，潛水時段 06–12）v456/v457 ──
  // 今日/明日分開回傳，直接接在各日場次摘要後面。循序抓避免對 CWA 併發（marine 限流教訓）。
  let forecast: { today: string | null; tomorrow: string | null } = { today: null, tomorrow: null };
  if (content.forecast) {
    forecast = await buildForecastDays(process.env.CWA_API_KEY);
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
          // v857 修正：原本只算 pending/confirmed，會漏掉「待確認匯款(awaiting_verify)」
          //   與「已完成(completed)」的客人 → 報告顯示 0 人（實際有人報名）。
          //   改用與 /api/trips、/api/admin/trips 完全相同的規則，讓報告人數與後台/前台一致。
          status: { notIn: ["cancelled_by_user", "cancelled_by_weather", "no_show"] },
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

  // v457：場次行帶潛點地點。diveSiteIds 可能存 DiveSite.id 或直接存中文名（v153 起），
  // 查得到就用站名、查不到直接顯示原字串。
  const allSiteIds = [...new Set([...todayTrips, ...tomorrowTrips].flatMap((t) => t.diveSiteIds))];
  const foundSites = allSiteIds.length
    ? await prisma.diveSite.findMany({ where: { id: { in: allSiteIds } }, select: { id: true, name: true } })
    : [];
  const siteNameMap = new Map(foundSites.map((s) => [s.id, s.name]));
  const tripPlace = (t: { diveSiteIds: string[] }) =>
    t.diveSiteIds.map((id) => siteNameMap.get(id) ?? id).join("/");

  // v459：場次改一行式「【今日 龍洞】 08:00（0/∞人）」，每場一行
  const fmtTripLines = (dayLabel: string, trips: typeof todayTrips): string[] =>
    trips.length
      ? trips.map((t) => {
          const booked = bookedMap.get(t.id) ?? 0;
          const cap = t.capacity ?? "∞";
          const place = tripPlace(t);
          const extras = `${t.isNightDive ? " 夜潛" : ""}${t.isScooter ? " 水推" : ""}`;
          return `【${dayLabel}${place ? ` ${place}` : ""}】 ${t.startTime}（${booked}/${cap}人${extras}）`;
        })
      : [`【${dayLabel}】 （無場次）`];

  // v1031：Email 表格用的結構化場次列
  const tripRows = (dayLabel: string, trips: typeof todayTrips): ReportTripRow[] =>
    trips.map((t) => ({
      day: dayLabel,
      time: t.startTime,
      place: tripPlace(t),
      booked: bookedMap.get(t.id) ?? 0,
      cap: String(t.capacity ?? "∞"),
      extras: `${t.isNightDive ? " 夜潛" : ""}${t.isScooter ? " 水推" : ""}`,
    }));

  // v459：依老闆指定編排——標題日期一行 → 場次一行式 → 天氣預報 → 綜合海況 → 海況 → 海象明細
  // v856：🌊 emoji 改 🔱（三叉戟＝logo 本體符號）；LINE/Email 有 logo 圖的地方則直接用圖。
  const reportTitle = `🔱 海王子潛水 每日營運報告 ${dateStr}`;
  const blocks: string[] = [reportTitle];

  if (content.sessions) {
    blocks.push(["", ...fmtTripLines("今日", todayTrips), ...fmtTripLines("明日", tomorrowTrips)].join("\n"));
  }

  // 天氣預報（有今日給今日、有明日給明日）
  const fcParts = [forecast.today, forecast.tomorrow].filter((x): x is string => x !== null);
  if (fcParts.length > 0) {
    blocks.push(["", ...fcParts].join("\n"));
  }

  // 綜合海況一句話提到前面（先給結論，明細在最後）
  if (marineBlock) {
    const overall =
      marineBlock.light === "🔴" ? "⚠️ 部分海域不建議下水"
        : marineBlock.light === "🟡" ? "尚可，部分海域請留意"
          : "良好，適合下水 🔱";
    blocks.push(["", `—— 綜合海況：${marineBlock.light} ${overall}`].join("\n"));
  }

  if (content.wind || content.temp) {
    const seaLines: string[] = ["", "【海況】"];
    if (content.wind) seaLines.push(`今日風速：${windStatus}`);
    if (content.wind || content.temp) {
      seaLines.push("測站讀數：", stationLines || "  （無資料）");
    }
    blocks.push(seaLines.join("\n"));
  }

  // 海象三區明細放最後（v411）
  if (marineBlock) {
    blocks.push(["", marineBlock.text].join("\n"));
  }

  blocks.push("", "—", `此訊息由系統${opts?.dryRun ? "（測試模式）" : "每日自動"}發送`);

  const textReport = blocks.join("\n");
  // v856：Flex / Email 用 —— 標題已由 logo 頁首呈現，內文不再重複標題行
  const bodyReport = blocks.slice(1).join("\n").replace(/^\n+/, "");

  // v1031：Email 表格用結構化資料（文字版 textReport 給 LINE/站內，維持不變）
  const fmtNum = (n: number | null, unit: string, digits = 1) => (n === null ? "—" : `${n.toFixed(digits)} ${unit}`);
  const reportData: ReportData = {
    trips: content.sessions ? [...tripRows("今日", todayTrips), ...tripRows("明日", tomorrowTrips)] : [],
    forecast: fcParts,
    overall: marineBlock
      ? `綜合海況：${marineBlock.light} ${
          marineBlock.light === "🔴" ? "部分海域不建議下水"
            : marineBlock.light === "🟡" ? "尚可，部分海域請留意"
              : "良好，適合下水"
        }`
      : null,
    windStatus: content.wind ? windStatus : "",
    stations: (content.wind || content.temp)
      ? stationReadings.map((s) => ({
          name: s.name,
          wind: content.wind ? (s.wind != null ? `${s.wind.toFixed(1)} m/s` : "—") : "—",
          temp: content.temp ? (s.temp != null ? `${s.temp.toFixed(1)} °C` : "—") : "—",
        }))
      : [],
    marine: (marineBlock?.rows ?? []).map((r) => {
      const wj = judgeWave(r.waveHeight);
      const cj = judgeCurrent(r.currentKnots);
      return {
        label: r.label,
        wave: fmtNum(r.waveHeight, "m"),
        waveJudge: wj ? `${wj.light} ${wj.text}` : "",
        waveDir: r.waveDirDesc ? `波向 ${r.waveDirDesc}` : "",
        period: r.wavePeriod != null ? `週期 ${r.wavePeriod.toFixed(1)} 秒` : "",
        seaTemp: fmtNum(r.seaTemp, "°C"),
        wetsuit: recommendWetsuit(r.seaTemp) ?? "",
        current: r.currentKnots != null
          ? `${r.currentKnots.toFixed(1)} 節${r.currentDirDesc ? `・流向 ${r.currentDirDesc}` : ""}`
          : "—",
        currentJudge: cj ? `${cj.light} ${cj.text}` : "",
        tide: r.tideHeight != null ? `${r.tideHeight.toFixed(2)} m${r.tideLevel ? `（${r.tideLevel}）` : ""}` : "—",
      };
    }),
    footNote: `此訊息由系統${opts?.dryRun ? "（測試模式）" : "每日自動"}發送`,
  };

  // Email 主旨只能純文字（放不了圖）→ 用 🔱（logo 的三叉戟）取代 🌊
  const subject = `🔱 海王子日報 ${dateStr}（風速 ${maxWind?.toFixed(1) ?? "-"} m/s）`;

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
          messages: [buildReportMessage(dateStr, bodyReport, textReport)],
        });
        results.push({ to: r, ok: true });
      } else if (r.startsWith("email:")) {
        const to = r.slice(6);
        const html = emailHtml(dateStr, reportData); // v1031：表格版
        const er = await sendEmail({ to, subject, text: textReport, html });
        results.push({ to: r, ok: er.ok, error: er.error });
      } else if (r.startsWith("inapp:")) {
        // v850：站內通知 —— 寫入後台通知中心（不需 LINE / Email）。userId = lineUserId。
        const userId = r.slice(6);
        await prisma.notification.create({
          data: {
            userId,
            templateKey: "daily_ops_report",
            title: `每日營運報告 ${dateStr}`,
            body: textReport,
            // v860：報告全文已在 body，無需再導頁 → 不放連結（通知只顯示「已閱讀，關閉」）
            linkUrl: null,
            icon: BUSINESS.logo, // v856：站內用 logo 圖（webview 支援 WebP）
          },
        });
        results.push({ to: r, ok: true });
      } else {
        results.push({ to: r, ok: false, error: "unrecognized recipient prefix (use line:, inapp: or email:)" });
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
