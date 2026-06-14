// v470：ZSend（Zeabur 託管的 SES 寄信服務）— Email 備用發送路徑。
//
// 必要 env（皆在 Zeabur dashboard 設，金鑰不進 repo）：
//   ZSEND_API_KEY        ZSend API 金鑰（Bearer）
//   ZSEND_FROM           寄件人（必須是 ZSend 已驗證網域，例：海王子客服 <service@haiwangzi.xyz>）
//   ZSEND_API_ENDPOINT   (optional) 預設 https://api.zeabur.com/api/v1/zsend/emails
//
// ⚠ 寄件網域必須先在 ZSend / SES 完成 DNS 驗證（TXT/DKIM），否則 API 回 400「domain not verified」。

const ZSEND_API_KEY = process.env.ZSEND_API_KEY ?? "";
const ZSEND_FROM = process.env.ZSEND_FROM ?? "";
const ZSEND_ENDPOINT = process.env.ZSEND_API_ENDPOINT ?? "https://api.zeabur.com/api/v1/zsend/emails";

export function zsendConfigured(): boolean {
  return Boolean(ZSEND_API_KEY && ZSEND_FROM);
}

export interface ZsendParams {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  /** v521：自訂 RFC 標頭（客服信箱 console threading 用：Message-ID / In-Reply-To / References） */
  headers?: Record<string, string>;
}

export interface ZsendResult {
  ok: boolean;
  messageId?: string;
  /** v521：ZSend 回傳的 provider id（= 回應 body 的 id），用來對應寄送狀態 webhook 的 email.id */
  providerId?: string;
  error?: string;
}

/** 透過 ZSend API 寄一封信。逾時 20 秒自動中止，不卡住 worker。 */
export async function sendViaZsend(p: ZsendParams): Promise<ZsendResult> {
  if (!zsendConfigured()) {
    return { ok: false, error: "ZSend 未設定（缺 ZSEND_API_KEY / ZSEND_FROM）" };
  }
  if (!p.html && !p.text) {
    return { ok: false, error: "ZSend 需要 html 或 text 其中之一" };
  }
  const payload: Record<string, unknown> = {
    from: ZSEND_FROM,
    to: [p.to],
    subject: p.subject,
  };
  if (p.html) payload.html = p.html;
  if (p.text) payload.text = p.text;
  if (p.replyTo) payload.reply_to = p.replyTo;
  if (p.headers && Object.keys(p.headers).length) payload.headers = p.headers; // v521

  try {
    const res = await fetch(ZSEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ZSEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) {
      // 嘗試取 ZSend 回傳的 error 訊息
      let detail = text;
      try { detail = (JSON.parse(text) as { error?: string }).error ?? text; } catch { /* keep raw */ }
      return { ok: false, error: `ZSend HTTP ${res.status}: ${detail}` };
    }
    let providerId: string | undefined;
    try {
      const j = JSON.parse(text) as { id?: string; message_id?: string; messageId?: string };
      providerId = j.id ?? j.message_id ?? j.messageId;
    } catch { /* ignore */ }
    return { ok: true, messageId: providerId, providerId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
