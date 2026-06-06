// v386：潛水團短連結。/t → 潛水團列表
//   非 LINE → /line 入口頁；LINE 內 → liff.line.me/{id}/tour
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const isLine = /Line\//i.test(req.headers.get("user-agent") ?? "");
  if (!isLine) return NextResponse.redirect(new URL("/line", req.url), 302);
  const liffBase =
    process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  return NextResponse.redirect(`${liffBase}/tour`, 302);
}
