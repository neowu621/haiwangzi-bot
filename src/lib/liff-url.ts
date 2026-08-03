// v992：站內頁面深連結一律用「App 本身的 LIFF ID」(LINE_LIFF_ID / NEXT_PUBLIC_LIFF_ID)，
//   與 rich menu 同一顆 LIFF；避免誤用只供 LINE Login 的 channel(2010219428) 造成 LINE「發生不明錯誤」。
const APP_LIFF_ID = process.env.LINE_LIFF_ID || process.env.NEXT_PUBLIC_LIFF_ID || "2010006458-fyokMnVv";

/** 產生開啟 App 內某頁的 LIFF 深連結。path 例："/messages"。 */
export function liffAppUrl(path = ""): string {
  const base = `https://liff.line.me/${APP_LIFF_ID}`;
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
