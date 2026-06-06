// v377：超短報名連結。haiwangzi.zeabur.app/d → 302 轉到 LIFF 報名流程
//   （主頁先登入 → 自動轉日潛頁）。給 LINE 訊息貼短連結用，取代又長又雜的 liff.line.me/...?next=...
//   /d 本身只做 302、不渲染任何 LIFF 頁，故不會有登入迴圈；最終落點是正規 LIFF URL。
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const liffBase =
    process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  return NextResponse.redirect(`${liffBase}/welcome?next=/liff/calendar`, 302);
}
