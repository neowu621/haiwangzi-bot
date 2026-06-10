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
  // v386：非 LINE 環境（桌機/手機瀏覽器）→ 導到乾淨入口頁 /line，
  //   避免直接丟進 liff.line.me → access.line.me 網頁登入亂繞。LINE 內 → 開 LIFF。
  const isLine = /Line\//i.test(req.headers.get("user-agent") ?? "");
  // v387：用相對 Location 轉址（避免 new URL(req.url) 取到容器內部 host 導致瀏覽器連不到）
  if (!isLine) return new NextResponse(null, { status: 302, headers: { Location: "/line" } });

  const to = req.nextUrl.searchParams.get("to");
  const next = to && /^\/liff\/[A-Za-z0-9/_-]+$/.test(to) ? to : "/liff/calendar";
  const liffPath = next.replace(/^\/liff/, "") || "/"; // /liff/calendar → /calendar
  const liffBase =
    process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  return NextResponse.redirect(`${liffBase}${liffPath}`, 302);
}
