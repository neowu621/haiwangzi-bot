import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公開 runtime config,給 client 端 fetch.
// 這樣不用依賴 NEXT_PUBLIC_* env (Zeabur Dockerfile 沒 ARG 注入問題)
export async function GET() {
  // 從 SiteConfig 讀外部連結（FB/IG/YT 等）
  let externalLinks: Record<string, string> = {};
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (cfg?.externalLinks) {
      externalLinks = cfg.externalLinks as Record<string, string>;
    }
  } catch {
    // DB 失敗就用空物件（避免 LIFF 整個壞掉）
  }

  return NextResponse.json({
    liffId: process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "",
    bank: {
      name: process.env.BANK_NAME ?? "",
      branch: process.env.BANK_BRANCH ?? "",
      account: process.env.BANK_ACCOUNT ?? "",
      holder: process.env.BANK_HOLDER ?? "",
    },
    externalLinks,
  });
}
