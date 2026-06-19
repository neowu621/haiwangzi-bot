/**
 * v481：LINE Login（瀏覽器 web OAuth）設定 helper
 *
 * 與 LIFF（手機）共用同一個 Provider → 拿到的 userId 是同一串 = 同一會員。
 * 需在 LINE Developers Console 建立一個「LINE Login」channel（同 Provider），
 * 並把以下兩個值設成環境變數：
 *   LINE_LOGIN_CHANNEL_ID      （Login channel 的 Channel ID）
 *   LINE_LOGIN_CHANNEL_SECRET  （Login channel 的 Channel Secret）
 * Callback URL 需在 Console 的 LINE Login 分頁加白名單（見 callbackUrl()）。
 */

export function lineLoginConfigured(): boolean {
  return !!(process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET);
}

export function lineLoginChannelId(): string {
  return process.env.LINE_LOGIN_CHANNEL_ID ?? "";
}

export function lineLoginChannelSecret(): string {
  return process.env.LINE_LOGIN_CHANNEL_SECRET ?? "";
}

/** Callback URL — 必須與 LINE Console 白名單「完全一致」。優先用 env，否則由 request origin 推導 */
export function callbackUrl(origin: string): string {
  if (process.env.LINE_LOGIN_CALLBACK_URL) return process.env.LINE_LOGIN_CALLBACK_URL;
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? origin;
  return `${base.replace(/\/$/, "")}/api/auth/line/callback`;
}

const AUTHORIZE_URL = "https://access.line.me/oauth2/v2.1/authorize";
const TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";

/** 組授權頁 URL（導使用者去 LINE 同意） */
export function buildAuthorizeUrl(opts: {
  origin: string;
  state: string;
  nonce: string;
  redirectAfter?: string; // 登入完成後回哪一頁（會放進 state 對應 cookie，不放這裡）
}): string {
  // email scope 需在 Console 申請開通且通過審核；若請求未開通的 email scope，LINE 會直接擋掉授權。
  // 預設只要 openid+profile（登入即通，不必等 email 權限審核）；
  // 待 email 權限核准後，把 LINE_LOGIN_EMAIL_SCOPE=1 設上去即可自動帶 email。
  // 在那之前，會員 email 由 /pclogin 的「Email 驗證」流程收集（更可靠：是我們自己驗證過的）。
  const emailScope = ["1", "true", "yes"].includes((process.env.LINE_LOGIN_EMAIL_SCOPE ?? "").toLowerCase());
  const params = new URLSearchParams({
    response_type: "code",
    client_id: lineLoginChannelId(),
    redirect_uri: callbackUrl(opts.origin),
    state: opts.state,
    scope: emailScope ? "openid profile email" : "openid profile",
    nonce: opts.nonce,
    // v485：讓 LINE 授權頁盡量以繁體中文顯示（實際語言 LINE 仍會參考使用者帳號語言）
    ui_locales: "zh-TW",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** 用 authorization code 換 token（含 id_token） */
export async function exchangeCodeForToken(opts: {
  code: string;
  origin: string;
}): Promise<
  | { ok: true; idToken: string; accessToken: string }
  | { ok: false; message: string }
> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: callbackUrl(opts.origin),
    client_id: lineLoginChannelId(),
    client_secret: lineLoginChannelSecret(),
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as {
      id_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.id_token) {
      return {
        ok: false,
        message: json.error_description ?? json.error ?? `token exchange failed (${res.status})`,
      };
    }
    return { ok: true, idToken: json.id_token, accessToken: json.access_token ?? "" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
