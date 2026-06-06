// v386：指定潛水團短連結。/t/<packageId> → 該團詳情
//   非 LINE → /line 入口頁；LINE 內 → liff.line.me/{id}/tour/<packageId>
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const isLine = /Line\//i.test(req.headers.get("user-agent") ?? "");
  if (!isLine) return NextResponse.redirect(new URL("/line", req.url), 302);
  // 只允許安全字元的 id（防注入到 URL）
  const safe = /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
  const liffBase =
    process.env.NEXT_PUBLIC_LIFF_URL ?? "https://liff.line.me/2010219428-E5frY7tm";
  return NextResponse.redirect(`${liffBase}/tour${safe ? `/${safe}` : ""}`, 302);
}
