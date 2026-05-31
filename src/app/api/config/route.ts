import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentInfo {
  bank?: { name?: string; branch?: string; account?: string; holder?: string };
  linepay?: { qrUrl?: string; liteId?: string };
}

// 公開 runtime config,給 client 端 fetch.
// 這樣不用依賴 NEXT_PUBLIC_* env (Zeabur Dockerfile 沒 ARG 注入問題)
export async function GET() {
  let externalLinks: Record<string, string> = {};
  let paymentInfo: PaymentInfo = {};
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (cfg?.externalLinks) {
      externalLinks = cfg.externalLinks as Record<string, string>;
    }
    if (cfg?.paymentInfo) {
      paymentInfo = cfg.paymentInfo as PaymentInfo;
    }
  } catch {
    // DB 失敗就用空物件（避免 LIFF 整個壞掉）
  }

  // 銀行：DB 為主，env vars 為 fallback
  const bank = {
    name: paymentInfo.bank?.name ?? process.env.BANK_NAME ?? "",
    branch: paymentInfo.bank?.branch ?? process.env.BANK_BRANCH ?? "",
    account: paymentInfo.bank?.account ?? process.env.BANK_ACCOUNT ?? "",
    holder: paymentInfo.bank?.holder ?? process.env.BANK_HOLDER ?? "",
  };

  // LINE Pay：只有 DB（env vars 沒有對應）
  const linepay = {
    qrUrl: paymentInfo.linepay?.qrUrl ?? "",
    liteId: paymentInfo.linepay?.liteId ?? "",
  };

  return NextResponse.json({
    liffId: process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "",
    bank,
    linepay,
    externalLinks,
  });
}
