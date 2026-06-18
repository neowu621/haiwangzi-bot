// v580：GET /api/admin/ga/callback — Google 授權後導回（瀏覽器導向，無 Bearer）。
//   靠 state cookie 驗證來源 → 換 refresh_token → 存 DB → 自動探測 GA4 資源 ID → 導回 /admin/analytics。
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exchangeGaCode, discoverPropertyId } from "@/lib/google-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, "");
  const back = (q: string) => {
    const r = NextResponse.redirect(`${base}/admin/analytics?ga=${q}`);
    r.cookies.set("hwz_ga_state", "", { path: "/", maxAge: 0 });
    return r;
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const saved = req.cookies.get("hwz_ga_state")?.value;
  const oauthErr = url.searchParams.get("error");
  if (oauthErr) return back(`err_${encodeURIComponent(oauthErr)}`);
  if (!code || !state || !saved || state !== saved) return back("err_state");

  const ex = await exchangeGaCode({ code, origin: url.origin });
  if (!ex.ok) return back(`err_${encodeURIComponent(ex.message.slice(0, 60))}`);

  // 自動探測資源 ID（Admin API 未啟用時回 null，之後讓老闆手動填）
  const propertyId = await discoverPropertyId(ex.accessToken);

  try {
    await prisma.googleOAuth.upsert({
      where: { provider: "ga" },
      create: { provider: "ga", refreshToken: ex.refreshToken, propertyId: propertyId ?? undefined },
      update: { refreshToken: ex.refreshToken, ...(propertyId ? { propertyId } : {}) },
    });
  } catch (e) {
    console.error("[ga/callback] save failed", e);
    return back("err_save");
  }
  return back(propertyId ? "ok" : "need_property");
}
