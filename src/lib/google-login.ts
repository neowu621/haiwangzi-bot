// v572：Google OAuth(後台登入用)。需 env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET。
//   redirect URI(要在 Google Console 設):<BASE_URL>/api/auth/google/callback
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleLoginConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri(origin: string): string {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? origin).replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
}

export function buildGoogleAuthorizeUrl(opts: { origin: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(opts.origin),
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function exchangeGoogleCode(opts: { code: string; origin: string }):
  Promise<{ ok: true; email: string; emailVerified: boolean; name?: string } | { ok: false; message: string }> {
  try {
    const body = new URLSearchParams({
      code: opts.code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(opts.origin),
      grant_type: "authorization_code",
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await r.json()) as { id_token?: string; error?: string; error_description?: string };
    if (!r.ok || !j.id_token) return { ok: false, message: j.error_description ?? j.error ?? `token exchange HTTP ${r.status}` };
    // id_token 由 Google token endpoint 直接 server-to-server 回傳(非經瀏覽器)→ 可信,直接 decode payload
    const seg = j.id_token.split(".")[1] ?? "";
    const payload = JSON.parse(Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { email?: string; email_verified?: boolean | string; name?: string };
    if (!payload.email) return { ok: false, message: "no email in id_token" };
    return {
      ok: true,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true || payload.email_verified === "true",
      name: payload.name,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
