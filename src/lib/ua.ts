// v507：User-Agent 判斷（proxy.ts 與首頁共用）。
// 手機 → 平板（iPad / Android 平板）排除、視為桌機。
export function isMobileUA(ua: string): boolean {
  if (!ua) return false;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) && !/mobile/.test(s)) return false;
  return /iphone|ipod|windows phone|iemobile|blackberry|bb10|opera mini|(android.*mobile)|mobile.*firefox/.test(s);
}

// 搜尋引擎 / 連結預覽爬蟲 —— 這些「不」做 UA 轉址（避免 Googlebot 被導到 noindex 的 /mobile）。
// 注意：刻意不含通用 "line"，因為 LINE 站內瀏覽器是「真人」而非爬蟲。
export function isBotUA(ua: string): boolean {
  if (!ua) return false;
  return /googlebot|google-inspectiontool|bingbot|bingpreview|duckduckbot|baiduspider|yandex|applebot|slurp|crawler|spider|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|discordbot|pinterest|embedly|\bbot\b|lighthouse|pagespeed|gtmetrix/i.test(ua);
}
