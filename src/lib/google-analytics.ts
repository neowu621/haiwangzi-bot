// v580：GA4 Data API（OAuth refresh token 版，繞過「禁建服務帳戶金鑰」組織政策）。
//   需 env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET（與後台 Google 登入共用同一組）。
//   redirect URI（要在 Google Console 加）：<BASE_URL>/api/admin/ga/callback
//   scope：analytics.readonly（敏感範圍；未驗證 App 老闆本人可點「進階→繼續」通過）。
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_API = "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_API = "https://analyticsadmin.googleapis.com/v1beta";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export function gaConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function gaRedirectUri(origin: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? origin).replace(/\/$/, "");
  return `${base}/api/admin/ga/callback`;
}

export function buildGaAuthorizeUrl(opts: { origin: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: gaRedirectUri(opts.origin),
    response_type: "code",
    scope: GA_SCOPE,
    state: opts.state,
    access_type: "offline", // 要 refresh_token
    prompt: "consent", // 強制每次都發 refresh_token（避免第二次授權拿不到）
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

// 授權碼 → tokens（取 refresh_token + access_token）
export async function exchangeGaCode(opts: { code: string; origin: string }):
  Promise<{ ok: true; refreshToken: string; accessToken: string } | { ok: false; message: string }> {
  try {
    const body = new URLSearchParams({
      code: opts.code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: gaRedirectUri(opts.origin),
      grant_type: "authorization_code",
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
    if (!r.ok || !j.access_token) return { ok: false, message: j.error_description ?? j.error ?? `token HTTP ${r.status}` };
    if (!j.refresh_token) return { ok: false, message: "Google 沒回 refresh_token（請在授權頁重新同意，或先到帳戶移除本 App 授權再試）" };
    return { ok: true, refreshToken: j.refresh_token, accessToken: j.access_token };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

// refresh_token → access_token
export async function accessTokenFromRefresh(refreshToken: string): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json()) as { access_token?: string };
    return j.access_token ?? null;
  } catch {
    return null;
  }
}

// 用 Admin API 自動找出 GA4 資源 ID（第一個）。需專案有啟用 Admin API；失敗回 null。
export async function discoverPropertyId(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${ADMIN_API}/accountSummaries`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      accountSummaries?: Array<{ propertySummaries?: Array<{ property?: string }> }>;
    };
    for (const a of j.accountSummaries ?? []) {
      for (const ps of a.propertySummaries ?? []) {
        const m = /properties\/(\d+)/.exec(ps.property ?? "");
        if (m) return m[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface GaRow { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }
interface RunReportBody {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  orderBys?: unknown[];
  limit?: number;
}

async function runReport(accessToken: string, propertyId: string, body: RunReportBody): Promise<GaRow[]> {
  const r = await fetch(`${DATA_API}/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`GA runReport HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = (await r.json()) as { rows?: GaRow[] };
  return j.rows ?? [];
}

export interface GaInsights {
  trend: Array<{ date: string; users: number; views: number }>;
  topPages: Array<{ label: string; views: number }>;
  sources: Array<{ label: string; users: number }>;
  devices: Array<{ label: string; users: number }>;
  range: string;
}

// 30 分鐘記憶體快取（省 GA 配額 + 秒開）。每個 propertyId 各一份。
const cache = new Map<string, { at: number; data: GaInsights }>();
const TTL = 30 * 60 * 1000;

export async function getGaInsights(refreshToken: string, propertyId: string, opts?: { force?: boolean }): Promise<GaInsights> {
  const hit = cache.get(propertyId);
  if (!opts?.force && hit && Date.now() - hit.at < TTL) return hit.data;

  const accessToken = await accessTokenFromRefresh(refreshToken);
  if (!accessToken) throw new Error("無法取得 access token（refresh token 可能已失效，請重新連接）");

  const range = { startDate: "29daysAgo", endDate: "today" };
  const [trendRows, pageRows, srcRows, devRows] = await Promise.all([
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      dimensions: [{ name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 8,
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      limit: 6,
    }),
    runReport(accessToken, propertyId, {
      dateRanges: [range],
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "activeUsers" }],
      orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
    }),
  ]);

  const num = (s?: string) => Number(s ?? 0) || 0;
  const fmtDate = (d?: string) => (d && d.length === 8 ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : d ?? "");
  const data: GaInsights = {
    trend: trendRows.map((r) => ({
      date: fmtDate(r.dimensionValues?.[0]?.value),
      users: num(r.metricValues?.[0]?.value),
      views: num(r.metricValues?.[1]?.value),
    })),
    topPages: pageRows.map((r) => ({ label: r.dimensionValues?.[0]?.value || "(無標題)", views: num(r.metricValues?.[0]?.value) })),
    sources: srcRows.map((r) => ({ label: r.dimensionValues?.[0]?.value || "(其他)", users: num(r.metricValues?.[0]?.value) })),
    devices: devRows.map((r) => ({ label: r.dimensionValues?.[0]?.value || "(其他)", users: num(r.metricValues?.[0]?.value) })),
    range: "近 30 天",
  };
  cache.set(propertyId, { at: Date.now(), data });
  return data;
}

export function clearGaCache(propertyId?: string) {
  if (propertyId) cache.delete(propertyId);
  else cache.clear();
}
