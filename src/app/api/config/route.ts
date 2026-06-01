import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentInfo {
  bank?: { name?: string; branch?: string; account?: string; holder?: string };
  linepay?: { qrUrl?: string; liteId?: string };
}

const DEFAULT_CANCELLATION_POLICY = `📌 客戶自行取消（依距離出發日）：
• 場次前 7 天以上：可退 100% 現金，或轉抵用金 100%
• 場次前 3-7 天：可退 50% 現金，或轉抵用金 80%
• 場次前 3 天內：訂金不退（保留場次成本）

☔ 因天氣強制取消（店家責任）：
• 退現金 100%：全額退回原付款帳戶
• 轉抵用金 110%（推薦）：多 10% 優惠，下次預約折抵

⚠️ 客戶未到場（no-show）：
• 原則上：不退款（保留違約金）
• 特殊情況可申請：退現 100% 或轉抵用金 80%（依老闆判斷）
• 若家人急事、健康因素等，請主動聯繫客服說明

※ 所有退款處理需 1-3 個工作天；轉抵用金即時生效，下次預約立即可用。
※ 已使用的抵用金折抵額度將原額轉回抵用金餘額（不會被沒收）。`;

// 公開 runtime config,給 client 端 fetch.
// 這樣不用依賴 NEXT_PUBLIC_* env (Zeabur Dockerfile 沒 ARG 注入問題)
export async function GET() {
  let externalLinks: Record<string, string> = {};
  let paymentInfo: PaymentInfo = {};
  let cancellationPolicy = DEFAULT_CANCELLATION_POLICY;
  try {
    const cfg = await prisma.siteConfig.findUnique({ where: { id: "default" } });
    if (cfg?.externalLinks) {
      externalLinks = cfg.externalLinks as Record<string, string>;
    }
    if (cfg?.paymentInfo) {
      paymentInfo = cfg.paymentInfo as PaymentInfo;
    }
    if (cfg?.cancellationPolicy) {
      cancellationPolicy = cfg.cancellationPolicy;
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
    cancellationPolicy,
  });
}
