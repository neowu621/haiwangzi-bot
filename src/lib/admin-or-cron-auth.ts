// v306：給「一次性 admin 補正端點」用的 auth helper
// 接受兩種 auth：
//   1. admin/boss 的 LIFF/JWT token（透過 authFromRequest）
//   2. Bearer <CRON_SECRET>（給 server 端 / curl 觸發用）
import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, requireRole } from "./auth";
import { safeEqual } from "./safe-compare";

export async function authAdminOrCron(
  req: NextRequest,
): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  // 先檢查 Bearer CRON_SECRET
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && safeEqual(token, cronSecret)) {
      return { ok: true };
    }
  }
  // 再走正常 admin auth
  const auth = await authFromRequest(req);
  if (!auth.ok) {
    return { ok: false, res: NextResponse.json({ error: auth.message }, { status: auth.status }) };
  }
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) {
    return { ok: false, res: NextResponse.json({ error: role.message }, { status: role.status }) };
  }
  return { ok: true };
}
