/**
 * v456：潛點區域「天氣預報」（CWA F-D0047 鄉鎮 3 天逐 3 小時預報）
 *
 * 龍洞/萊萊 → 新北市貢寮區（F-D0047-069）；潮境/基隆 → 基隆市中正區（F-D0047-049）。
 * 取「下一個潛水時段（06–12 時）」的天氣現象 / 降雨機率 / 氣溫 / 風速，
 * 一區一行，接在每日營運報告的海象之後。
 *
 * ⚠ CWA 大小寫陷阱同 marine.ts：records / Records 兩種都要接。
 */

const FC_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

export interface ForecastPoint {
  label: string;   // 顯示名稱
  dataset: string; // F-D0047-069 等
  town: string;    // 鄉鎮名（LocationName）
}

export const FORECAST_POINTS: ForecastPoint[] = [
  { label: "龍洞・萊萊（貢寮區）", dataset: "F-D0047-069", town: "貢寮區" },
  { label: "潮境・基隆（中正區）", dataset: "F-D0047-049", town: "中正區" },
];

interface FcTime {
  DataTime?: string;
  StartTime?: string;
  EndTime?: string;
  ElementValue?: Array<Record<string, unknown>>;
}
interface FcElement { ElementName?: string; Time?: FcTime[] }
type FcRecords = {
  Locations?: Array<{ Location?: Array<{ LocationName?: string; WeatherElement?: FcElement[] }> }>;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 解析 ISO 時間字串的「日期字串 + 小時」（CWA 給 +08:00 本地時間，直接拆字串即可，不經時區換算） */
function dayHour(iso: string | undefined): { day: string; hour: number } | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})/.exec(iso);
  return m ? { day: m[1], hour: Number(m[2]) } : null;
}

async function fetchTownElements(apiKey: string, p: ForecastPoint): Promise<Map<string, FcTime[]> | null> {
  const url = `${FC_BASE}/${p.dataset}?Authorization=${apiKey}&format=JSON&LocationName=${encodeURIComponent(p.town)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CWA ${p.dataset} HTTP ${res.status}`);
  const data = (await res.json()) as { records?: FcRecords; Records?: FcRecords };
  const recs = data.records ?? data.Records;
  const loc = recs?.Locations?.[0]?.Location?.[0];
  if (!loc?.WeatherElement) return null;
  const map = new Map<string, FcTime[]>();
  for (const el of loc.WeatherElement) {
    if (el.ElementName) map.set(el.ElementName, el.Time ?? []);
  }
  return map;
}

/** 從單一鄉鎮的預報元素，組出目標日 06–12 時的一行摘要 */
function summarizeWindow(els: Map<string, FcTime[]>, targetDay: string): string | null {
  // 天氣現象：取 09–12 區段，缺則 06–09
  const wxTimes = els.get("天氣現象") ?? [];
  let wx: string | null = null;
  for (const wantH of [9, 6]) {
    const t = wxTimes.find((x) => { const dh = dayHour(x.StartTime); return dh?.day === targetDay && dh.hour === wantH; });
    const w = t?.ElementValue?.[0]?.["Weather"];
    if (typeof w === "string" && w) { wx = w; break; }
  }

  // 降雨機率：06–12 重疊區段取最大
  let pop: number | null = null;
  for (const t of els.get("3小時降雨機率") ?? []) {
    const dh = dayHour(t.StartTime);
    if (dh?.day !== targetDay || dh.hour < 6 || dh.hour >= 12) continue;
    const v = num(t.ElementValue?.[0]?.["ProbabilityOfPrecipitation"]);
    if (v !== null && (pop === null || v > pop)) pop = v;
  }

  // 氣溫：06–12 的 min–max
  let tMin: number | null = null, tMax: number | null = null;
  for (const t of els.get("溫度") ?? []) {
    const dh = dayHour(t.DataTime);
    if (dh?.day !== targetDay || dh.hour < 6 || dh.hour > 12) continue;
    const v = num(t.ElementValue?.[0]?.["Temperature"]);
    if (v === null) continue;
    if (tMin === null || v < tMin) tMin = v;
    if (tMax === null || v > tMax) tMax = v;
  }

  // 風速（m/s）：06–12 取最大；風向取 06 或 09
  let wMax: number | null = null;
  for (const t of els.get("風速") ?? []) {
    const dh = dayHour(t.DataTime);
    if (dh?.day !== targetDay || dh.hour < 6 || dh.hour > 12) continue;
    const v = num(t.ElementValue?.[0]?.["WindSpeed"]);
    if (v !== null && (wMax === null || v > wMax)) wMax = v;
  }
  let wDir: string | null = null;
  const dirTimes = els.get("風向") ?? [];
  for (const wantH of [6, 9]) {
    const t = dirTimes.find((x) => { const dh = dayHour(x.DataTime); return dh?.day === targetDay && dh.hour === wantH; });
    const d = t?.ElementValue?.[0]?.["WindDirection"];
    if (typeof d === "string" && d) { wDir = d; break; }
  }

  const segs: string[] = [];
  if (wx) segs.push(wx);
  if (pop !== null) segs.push(`☔ ${pop}%`);
  if (tMin !== null && tMax !== null) segs.push(tMin === tMax ? `${tMin}°C` : `${tMin}–${tMax}°C`);
  if (wMax !== null) segs.push(`風 ${wMax} m/s${wDir ? ` ${wDir}` : ""}`);
  return segs.length > 0 ? segs.join("　") : null;
}

/**
 * 組「天氣預報」區塊。
 * 目標日：台灣時間 09:00 前（05:00 當日寄送）→ 今日；之後（22:00 前一晚寄送/白天手動測試）→ 明日。
 * （CWA 只給未來區段；過了上午，今日 06–12 已從 feed 消失，必須看明日）
 */
export interface ForecastDays {
  /** 今日 06–12 時預報（過了台灣時間 09:00 即 null，CWA 不留過去區段） */
  today: string | null;
  /** 明日 06–12 時預報 */
  tomorrow: string | null;
}

/**
 * 組「今日 / 明日」兩天的潛水時段（06–12 時）預報，分開回傳，
 * 讓日報能把預報直接接在各日場次摘要後面。
 * 一個鄉鎮只抓一次（3 天 feed 同時涵蓋今明兩日）；循序抓避免 CWA 併發限流。
 */
export async function buildForecastDays(apiKey: string | undefined): Promise<ForecastDays> {
  if (!apiKey) return { today: null, tomorrow: null };
  const tw = new Date(Date.now() + 8 * 3600_000); // 以 UTC getter 讀台灣時間
  const dayStr = (offset: number) => {
    const t = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate() + offset));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  };
  const includeToday = tw.getUTCHours() < 9; // 過了上午，今日 06–12 已成過去 → 只給明日

  const per: Array<{ label: string; els: Map<string, FcTime[]> }> = [];
  for (const p of FORECAST_POINTS) {
    try {
      const els = await fetchTownElements(apiKey, p);
      if (els) per.push({ label: p.label, els });
    } catch (e) {
      console.error("[forecast] fetch failed", p.town, e);
    }
  }
  if (per.length === 0) return { today: null, tomorrow: null };

  const render = (targetDay: string, dayLabel: string): string | null => {
    const lines = per
      .map(({ label, els }) => {
        const s = summarizeWindow(els, targetDay);
        return s ? `${label}：${s}` : null;
      })
      .filter((x): x is string => x !== null);
    return lines.length > 0 ? [`【⛅ 天氣預報（${dayLabel} 06–12 時）】`, ...lines].join("\n") : null;
  };

  return {
    today: includeToday ? render(dayStr(0), "今日") : null,
    tomorrow: render(dayStr(1), "明日"),
  };
}
