// v377：超短報名連結。haiwangzi.xyz/d → 302 轉到 LIFF 報名流程
//   （主頁先登入 → 自動轉日潛頁）。給 LINE 訊息貼短連結用，取代又長又雜的 liff.line.me/...?next=...
//   /d 本身只做 302、不渲染任何 LIFF 頁，故不會有登入迴圈；最終落點是正規 LIFF URL。
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /d            → 日潛報名（預設）
// /d?to=/liff/tour/<id> → 指定潛旅團報名（v378）
// 只接受站內 /liff/ 路徑（防開放轉址）；其餘一律退回日潛頁。
//
// v385：直接深連結到目標頁（不再經 welcome 中轉）→ 少一跳、少閃一次。
//   目標頁本身已強制登入（LiffShell），所以不需 welcome 先登入。
//   LIFF endpoint 設在 /liff，故深連結路徑要去掉 /liff 前綴：
//     /liff/calendar → liff.line.me/{id}/calendar
//     /liff/tour/123 → liff.line.me/{id}/tour/123
export function GET(req: NextRequest) {
  const ua = req.headers.get("user-agent") ?? "";
  const isLine = /Line\//i.test(ua);
  const isMobile = /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua);
  const to = req.nextUrl.searchParams.get("to");
  const validTo = to && /^\/liff\/[A-Za-z0-9/_-]+$/.test(to) ? to : null;

  // v885：帶 ?to=/liff/xxx（特定深連結，例：某潛旅團）→ 維持「LINE 內直接開 LIFF」。
  if (isLine && validTo) {
    const liffPath = validTo.replace(/^\/liff/, "") || "/";
    const liffBase = process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
    return NextResponse.redirect(`${liffBase}${liffPath}`, 302);
  }

  // v885：一般 /d（無 to）——
  //   手機（LINE 內或手機瀏覽器）→ /line 轉折頁（Apple 質感 hub：潛水預約/費用/優惠/詢問/FAQ）；
  //   桌機（非行動裝置）→ /pclogin「請用手機預約」引導頁（含 QR）。
  // v387：用相對 Location（避免 new URL(req.url) 取到容器內部 host 導致瀏覽器連不到）。
  const dest = isLine || isMobile ? "/line" : "/pclogin";
  return new NextResponse(null, { status: 302, headers: { Location: dest } });
}
