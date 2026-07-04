// v793：LINE LIFF → 後台 session 橋接。
//   老闆/IT/教練/助教在 LIFF(個人中心)已用 LINE 登入 → 這裡用其 LINE idToken 換發
//   admin-web JWT(免再輸入帳密)，前端存入 localStorage 後導向 /admin/m 手機簡易後台。
//   安全：沿用 authFromRequest 驗 LINE idToken + 後台角色白名單(與密碼登入同一道門)。
import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, createAdminWebJwt, getUserRoles } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_LOGIN_ROLES = ["admin", "boss", "it", "coach", "assistant"];

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  const roles = getUserRoles(auth.user);
  if (!roles.some((r) => BACKEND_LOGIN_ROLES.includes(r))) {
    return NextResponse.json(
      { error: "此帳號沒有後台權限", code: "NO_BACKEND_ROLE" },
      { status: 403 },
    );
  }

  const token = await createAdminWebJwt(auth.user.lineUserId);
  await logAudit({
    actorId: auth.user.lineUserId,
    actorName: auth.user.realName ?? auth.user.displayName ?? undefined,
    action: "auth.login.liff_bridge", // v793：LIFF LINE 登入直通後台
    targetType: "user",
    targetId: auth.user.lineUserId,
    targetLabel: auth.user.realName ?? auth.user.displayName ?? auth.user.lineUserId,
    metadata: { channel: "liff_bridge" },
  });

  return NextResponse.json({
    token,
    user: {
      lineUserId: auth.user.lineUserId,
      displayName: auth.user.displayName,
      realName: auth.user.realName,
      role: auth.user.role,
      roles: auth.user.roles,
      effectiveRoles: roles,
    },
  });
}
