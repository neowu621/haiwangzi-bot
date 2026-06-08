/**
 * v411：海象資料（CWA O-B0075-001 — 48小時浮標站與潮位站海況監測）
 *
 * 抓指定浮標站（浪高/波向/週期/海溫/海流）＋潮位站（潮位），取最新有效值，
 * 附潛水適合度自動判斷（浪高/海流燈號 + 海溫防寒衣建議），組成每日天氣回報用的文字段落。
 *
 * 資料來源同一支 API，靠 StationID 切換浮標 / 潮位站。用既有 CWA_API_KEY。
 */

const CWA_BASE = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-B0075-001";

/** 一個「回報點」= 一個浮標站 + 一個潮位站，對應一個潛水區 */
export interface MarinePoint {
  label: string;   // 顯示名稱，如「龍洞區」
  buoyId: string;  // 浮標站 StationID，如 46694A
  tideId: string;  // 潮位站 StationID，如 C4A02
}

/** 預設兩個回報點：龍洞區（龍洞、萊萊）/ 基隆區（潮境、望海巷、基隆嶼、深澳、象鼻岩） */
export const DEFAULT_MARINE_POINTS: MarinePoint[] = [
  { label: "龍洞區", buoyId: "46694A", tideId: "C4A02" },
  // 基隆區：鼻頭角浮標(OAC003)目前停測，改用彭佳嶼(C6B01,基隆外海)代表湧浪 + 基隆潮位
  { label: "基隆區", buoyId: "C6B01", tideId: "C4B01" },
];

/** 要顯示哪些欄位 */
export interface MarineFields {
  waveHeight: boolean;
  waveDir: boolean;
  wavePeriod: boolean;
  seaTemp: boolean;
  current: boolean;
  tide: boolean;
}
export const DEFAULT_MARINE_FIELDS: MarineFields = {
  waveHeight: true, waveDir: true, wavePeriod: true,
  seaTemp: true, current: true, tide: true,
};

export interface MarineReading {
  label: string;
  buoyId: string;
  tideId: string;
  obsTime: string | null;     // 浮標最新觀測時間
  waveHeight: number | null;  // m
  waveDirDesc: string | null; // EN 縮寫，如 ENE
  wavePeriod: number | null;  // s
  seaTemp: number | null;     // °C（取浮標；缺則取潮位站）
  currentSpeed: number | null;     // m/s
  currentKnots: number | null;     // 節
  currentDirDesc: string | null;   // EN 縮寫
  tideHeight: number | null;  // m
  tideLevel: string | null;   // 漲潮/退潮/滿潮/乾潮
}

const isBad = (v: unknown) => v === null || v === undefined || v === "-" || v === "" || v === "None" || v === "NaN";
function num(v: unknown): number | null {
  if (isBad(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface ObsTime {
  DateTime?: string;
  WeatherElements?: {
    WaveHeight?: unknown; WaveDirectionDescription?: unknown; WavePeriod?: unknown;
    SeaTemperature?: unknown; TideHeight?: unknown; TideLevel?: unknown;
    SeaCurrents?: { Layer?: Array<{ CurrentSpeed?: unknown; CurrentSpeedInKnots?: unknown; CurrentDirectionDescription?: unknown }> };
  };
}

async function fetchStation(stationId: string, apiKey: string): Promise<ObsTime[]> {
  const url = `${CWA_BASE}?Authorization=${apiKey}&StationID=${encodeURIComponent(stationId)}&format=JSON`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CWA O-B0075-001 HTTP ${res.status}`);
  const data = (await res.json()) as {
    Records?: { SeaSurfaceObs?: { Location?: Array<{ StationObsTimes?: { StationObsTime?: ObsTime[] } }> } };
  };
  return data.Records?.SeaSurfaceObs?.Location?.[0]?.StationObsTimes?.StationObsTime ?? [];
}

/** 在 48hr 序列裡，由新到舊找某欄位第一個有效值 */
function latestValid<T>(times: ObsTime[], pick: (we: NonNullable<ObsTime["WeatherElements"]>) => T | null): T | null {
  for (let i = times.length - 1; i >= 0; i--) {
    const we = times[i].WeatherElements;
    if (!we) continue;
    const v = pick(we);
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** 抓單一回報點（浮標 + 潮位），取最新有效值。任何失敗回 null。 */
export async function fetchMarinePoint(p: MarinePoint, apiKey: string): Promise<MarineReading | null> {
  try {
    const [buoy, tide] = await Promise.all([
      fetchStation(p.buoyId, apiKey).catch(() => [] as ObsTime[]),
      p.tideId ? fetchStation(p.tideId, apiKey).catch(() => [] as ObsTime[]) : Promise.resolve([] as ObsTime[]),
    ]);
    if (buoy.length === 0 && tide.length === 0) return null;

    const obsTime = (() => {
      for (let i = buoy.length - 1; i >= 0; i--) {
        if (!isBad(buoy[i].WeatherElements?.WaveHeight)) return buoy[i].DateTime ?? null;
      }
      return buoy[buoy.length - 1]?.DateTime ?? null;
    })();

    const cur = latestValid(buoy, (we) => {
      const layer = we.SeaCurrents?.Layer?.[0];
      if (!layer || isBad(layer.CurrentSpeed)) return null;
      return {
        speed: num(layer.CurrentSpeed),
        knots: num(layer.CurrentSpeedInKnots),
        dir: isBad(layer.CurrentDirectionDescription) ? null : String(layer.CurrentDirectionDescription),
      };
    });

    return {
      label: p.label, buoyId: p.buoyId, tideId: p.tideId, obsTime,
      waveHeight: latestValid(buoy, (we) => num(we.WaveHeight)),
      waveDirDesc: latestValid(buoy, (we) => (isBad(we.WaveDirectionDescription) ? null : String(we.WaveDirectionDescription))),
      wavePeriod: latestValid(buoy, (we) => num(we.WavePeriod)),
      seaTemp: latestValid(buoy, (we) => num(we.SeaTemperature)) ?? latestValid(tide, (we) => num(we.SeaTemperature)),
      currentSpeed: cur?.speed ?? null,
      currentKnots: cur?.knots ?? null,
      currentDirDesc: cur?.dir ?? null,
      tideHeight: latestValid(tide, (we) => num(we.TideHeight)),
      tideLevel: latestValid(tide, (we) => (isBad(we.TideLevel) ? null : String(we.TideLevel))),
    };
  } catch (e) {
    console.error("[marine] fetchMarinePoint failed", p.label, e);
    return null;
  }
}

/* ── 自動判斷（門檻已與老闆確認，2026-06） ── */
type Light = "🟢" | "🟡" | "🔴";
export function judgeWave(m: number | null): { light: Light; text: string } | null {
  if (m === null) return null;
  if (m < 1.0) return { light: "🟢", text: "適合下水" };
  if (m <= 1.5) return { light: "🟡", text: "留意（新手不建議）" };
  return { light: "🔴", text: "不建議下水" };
}
export function judgeCurrent(knots: number | null): { light: Light; text: string } | null {
  if (knots === null) return null;
  if (knots <= 1) return { light: "🟢", text: "和緩" };
  if (knots <= 2) return { light: "🟡", text: "中等留意" };
  return { light: "🔴", text: "強流·不建議" };
}
export function recommendWetsuit(tempC: number | null): string | null {
  if (tempC === null) return null;
  if (tempC >= 27) return "3mm 濕式";
  if (tempC >= 25) return "5mm 濕式";
  if (tempC >= 23) return "5mm + 頭套/手套";
  if (tempC >= 20) return "5mm 加厚 / 半乾式 + 頭套/手套";
  return "建議乾式";
}

const EN2ZH: Record<string, string> = {
  N: "北", NNE: "北北東", NE: "東北", ENE: "東北東", E: "東", ESE: "東南東",
  SE: "東南", SSE: "南南東", S: "南", SSW: "南南西", SW: "西南", WSW: "西南西",
  W: "西", WNW: "西北西", NW: "西北", NNW: "北北西",
};
const dirZh = (en: string | null) => (en && EN2ZH[en] ? EN2ZH[en] : en ?? "");

const worst = (lights: (Light | null)[]): Light => {
  if (lights.includes("🔴")) return "🔴";
  if (lights.includes("🟡")) return "🟡";
  return "🟢";
};

/** 把一個回報點組成文字（依欄位開關）；回 null 表示完全無資料 */
export function formatMarinePoint(r: MarineReading, f: MarineFields): { text: string; light: Light } | null {
  const lines: string[] = [];
  const wj = judgeWave(r.waveHeight);
  const cj = judgeCurrent(r.currentKnots);

  if (f.waveHeight && r.waveHeight !== null) lines.push(`🌊 浪高　${r.waveHeight.toFixed(1)} m${wj ? `　${wj.light} ${wj.text}` : ""}`);
  if ((f.waveDir && r.waveDirDesc) || (f.wavePeriod && r.wavePeriod !== null)) {
    const seg: string[] = [];
    if (f.waveDir && r.waveDirDesc) seg.push(`🧭 波向 ${dirZh(r.waveDirDesc)}`);
    if (f.wavePeriod && r.wavePeriod !== null) seg.push(`⏱ 週期 ${r.wavePeriod.toFixed(1)} 秒`);
    lines.push(seg.join("　"));
  }
  if (f.seaTemp && r.seaTemp !== null) {
    const ws = recommendWetsuit(r.seaTemp);
    lines.push(`🌡 海溫　${r.seaTemp.toFixed(1)}°C${ws ? `　→ ${ws}` : ""}`);
  }
  if (f.current && r.currentSpeed !== null) {
    const kn = r.currentKnots !== null ? `（${r.currentKnots.toFixed(1)} 節）` : "";
    const dir = r.currentDirDesc ? ` 流向${dirZh(r.currentDirDesc)}` : "";
    lines.push(`🌀 海流　${r.currentSpeed.toFixed(2)} m/s${kn}${dir}${cj ? `　${cj.light} ${cj.text}` : ""}`);
  }
  if (f.tide && r.tideHeight !== null) {
    lines.push(`📏 潮位　${r.tideHeight.toFixed(2)} m${r.tideLevel ? `（${r.tideLevel}）` : ""}`);
  }
  if (lines.length === 0) return null;

  const light = worst([wj?.light ?? null, cj?.light ?? null]);
  return { text: [`【🌊 海象 · ${r.label}】`, ...lines].join("\n"), light };
}

/** 抓多個回報點並組成完整海象區塊 + 綜合燈號 */
export async function buildMarineSection(
  points: MarinePoint[],
  fields: MarineFields,
  apiKey: string | undefined,
): Promise<{ text: string; light: Light } | null> {
  if (!apiKey || points.length === 0) return null;
  const readings = await Promise.all(points.map((p) => fetchMarinePoint(p, apiKey)));
  const formatted = readings
    .map((r) => (r ? formatMarinePoint(r, fields) : null))
    .filter((x): x is { text: string; light: Light } => x !== null);
  if (formatted.length === 0) return null;
  const light = worst(formatted.map((x) => x.light));
  return { text: formatted.map((x) => x.text).join("\n\n"), light };
}
