import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isMobileUA, isBotUA } from "@/lib/ua";

// v499：網域正規化 — 把 www / zeabur.app 用 301 永久轉向到正規網址 haiwangzi.xyz，
//   讓 Google 把所有排名訊號合併到單一網址（程式層處理，不依賴平台後台設定）。
const CANONICAL_HOST = "haiwangzi.xyz";
const REDIRECT_HOSTS = new Set(["www.haiwangzi.xyz", "haiwangzi.zeabur.app"]);

export function proxy(req: NextRequest) {
  // Zeabur 是反向代理：真正的對外網域在 x-forwarded-host（fallback host）
  const raw = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  const hostname = raw.split(":")[0];

  if (REDIRECT_HOSTS.has(hostname)) {
    const url = req.nextUrl.clone();
    url.protocol = "https:";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 301); // 301 永久轉向，保留路徑與 query
  }

  // v507：手機「真人」開首頁 / → 302 導到 /mobile；桌機 / 平板維持 /。
  //   排除搜尋引擎 / 預覽爬蟲（Googlebot 等留在 / 由首頁依 UA 渲染，避免被導到 noindex 的 /mobile）。
  if (req.nextUrl.pathname === "/") {
    const ua = req.headers.get("user-agent") ?? "";
    if (isMobileUA(ua) && !isBotUA(ua)) {
      const url = req.nextUrl.clone();
      url.pathname = "/mobile";
      return NextResponse.redirect(url, 302); // 302 暫時轉向（依裝置而定，不要被當永久）
    }
  }

  // 其餘（正規網域、平台內部 health check host、localhost）一律放行
  return NextResponse.next();
}

export const config = {
  // 跳過靜態資源以減少觸發次數（頁面 / API 仍會經過）
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
