import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, requireRole } from "@/lib/auth";
import { presignGetUrl, r2Configured, type R2Prefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/uploads/preview?key=payments/xxx/xxx.jpg
// 給教練/admin 用：產 600 秒的 presigned GET URL 預覽 private bucket 內容
export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["coach", "admin"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  if (!r2Configured()) {
    return NextResponse.json({ error: "R2 not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!key)
    return NextResponse.json({ error: "missing key" }, { status: 400 });

  // 從 key 第一段推 prefix
  const prefix = key.split("/")[0] as R2Prefix;
  if (!["payments", "sites", "avatars", "richmenu"].includes(prefix)) {
    return NextResponse.json({ error: "invalid key prefix" }, { status: 400 });
  }

  const signed = await presignGetUrl(prefix, key, 600);
  return NextResponse.json({ url: signed, expiresInSec: 600 });
}
