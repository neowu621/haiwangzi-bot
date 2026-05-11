import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 公開 runtime config,給 client 端 fetch.
// 這樣不用依賴 NEXT_PUBLIC_* env (Zeabur Dockerfile 沒 ARG 注入問題)
export async function GET() {
  return NextResponse.json({
    liffId: process.env.LINE_LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? "",
    bank: {
      name: process.env.BANK_NAME ?? "",
      branch: process.env.BANK_BRANCH ?? "",
      account: process.env.BANK_ACCOUNT ?? "",
      holder: process.env.BANK_HOLDER ?? "",
    },
  });
}
