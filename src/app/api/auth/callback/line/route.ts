import type { NextRequest } from "next/server";
import { handleLineLoginCallback } from "@/lib/line-login-callback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v812：LINE Login callback 主路徑。LINE Developers Console channel 2010219428
//   白名單登記的即此路徑（https://haiwangzi.xyz/api/auth/callback/line）；
//   callbackUrl() 預設送這個。實際邏輯見 @/lib/line-login-callback。
export async function GET(req: NextRequest) {
  return handleLineLoginCallback(req);
}
