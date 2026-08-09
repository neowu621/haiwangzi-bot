// v507：User-Agent 判斷（proxy.ts 與首頁共用）。
// 手機 → 平板（iPad / Android 平板）排除、視為桌機。
export function isMobileUA(ua: string): boolean {
  if (!ua) return false;
  const s = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(s) && !/mobile/.test(s)) return false;
  return /iphone|ipod|windows phone|iemobile|blackberry|bb10|opera mini|(android.*mobile)|mobile.*firefox/.test(s);
}

// v1049：把 User-Agent 拆成後台「裝置」欄要顯示的東西。
//   資料源是 audit_log.actor_user_agent（v334 起每筆都有存），不需要新增追蹤。
//   注意 UA 可以偽造，且 iPadOS 的 Safari 預設偽裝成 Mac → iPad 有機會被歸到 desktop。
//   這是瀏覽器層面的已知行為，沒有可靠解法；當趨勢參考即可。
export type DeviceKind = "ios" | "ipad" | "android" | "desktop" | "unknown";

export interface DeviceInfo {
  kind: DeviceKind;
  label: string;       // 晶片文字：iPhone / iPad / Android / 電腦
  detail: string;      // 第二行：iOS 17.5 · LINE 14.10
  inLine: boolean;     // 是否從 LINE 內建瀏覽器進來（LINE WebView 較慢，效能優化要先看這個）
}

const UNKNOWN: DeviceInfo = { kind: "unknown", label: "—", detail: "", inLine: false };

export function parseDevice(ua: string | null | undefined): DeviceInfo {
  if (!ua) return UNKNOWN;

  // LINE 內建瀏覽器的 UA 會多一段 Line/14.10.0
  const lineM = ua.match(/\bLine\/([\d.]+)/i);
  const inLine = !!lineM;

  // 瀏覽器：順序有意義 —— Edge/Samsung 的 UA 也含 Chrome，Chrome 的也含 Safari
  const browser = (() => {
    if (inLine) return `LINE ${(lineM![1] ?? "").split(".").slice(0, 2).join(".")}`.trim();
    let m: RegExpMatchArray | null;
    if ((m = ua.match(/\bEdg(?:iOS|A)?\/(\d+)/))) return `Edge ${m[1]}`;
    if ((m = ua.match(/\bSamsungBrowser\/(\d+)/))) return `Samsung ${m[1]}`;
    if ((m = ua.match(/\bFxiOS\/(\d+)|\bFirefox\/(\d+)/))) return `Firefox ${m[1] ?? m[2]}`;
    if ((m = ua.match(/\bCriOS\/(\d+)|\bChrome\/(\d+)/))) return `Chrome ${m[1] ?? m[2]}`;
    if (/\bSafari\//.test(ua)) return "Safari";
    return "";
  })();

  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  // iOS / iPadOS：版本寫成 "OS 17_5_1"
  if (/\b(iPhone|iPod|iPad)\b/.test(ua)) {
    const v = ua.match(/OS (\d+)[._](\d+)/);
    const os = v ? `iOS ${v[1]}.${v[2]}` : "iOS";
    const isPad = /\biPad\b/.test(ua);
    return { kind: isPad ? "ipad" : "ios", label: isPad ? "iPad" : "iPhone", detail: join(os, browser), inLine };
  }

  if (/\bAndroid\b/.test(ua)) {
    const v = ua.match(/Android (\d+(?:\.\d+)?)/);
    return { kind: "android", label: "Android", detail: join(v ? `Android ${v[1]}` : "Android", browser), inLine };
  }

  const desktopOs =
    /\bWindows NT 10/.test(ua) ? "Windows" :
    /\bWindows/.test(ua) ? "Windows" :
    /\bMac OS X|\bMacintosh/.test(ua) ? "macOS" :
    /\bCrOS\b/.test(ua) ? "ChromeOS" :
    /\bLinux\b/.test(ua) ? "Linux" : "";
  if (desktopOs || browser) {
    return { kind: "desktop", label: "電腦", detail: join(desktopOs, browser), inLine };
  }
  return UNKNOWN;
}

// 搜尋引擎 / 連結預覽爬蟲 —— 這些「不」做 UA 轉址（避免 Googlebot 被導到 noindex 的 /mobile）。
// 注意：刻意不含通用 "line"，因為 LINE 站內瀏覽器是「真人」而非爬蟲。
export function isBotUA(ua: string): boolean {
  if (!ua) return false;
  return /googlebot|google-inspectiontool|bingbot|bingpreview|duckduckbot|baiduspider|yandex|applebot|slurp|crawler|spider|facebookexternalhit|twitterbot|slackbot|telegrambot|whatsapp|discordbot|pinterest|embedly|\bbot\b|lighthouse|pagespeed|gtmetrix/i.test(ua);
}
