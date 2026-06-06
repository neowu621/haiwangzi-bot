import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  makeKey,
  presignPutUrl,
  publicUrl,
  r2Configured,
  isPrivate,
  bucketFor,
  type R2Prefix,
} from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v356：採 Codex 建議 —— 收緊上傳白名單
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const BodySchema = z.object({
  prefix: z.enum([
    "payments",
    "sites",
    "avatars",
    "richmenu",
    "media",
    "trips",
    "tours",
  ]),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(64),
  scope: z.string().optional(),
});

// POST /api/uploads/presign
// 回傳一張 R2 PUT presigned URL，client 直接 PUT binary 上去
export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });

  if (!r2Configured()) {
    return NextResponse.json(
      {
        error: "R2 not configured",
        hint: "請在 .env 設定 R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY",
      },
      { status: 503 },
    );
  }

  const data = BodySchema.parse(await req.json());

  // v356：嚴格 contentType 白名單（jpeg/png/webp/pdf）—— 擋掉 SVG 等可帶 script 的格式
  if (!ALLOWED_CONTENT_TYPES.has(data.contentType)) {
    return NextResponse.json(
      { error: "unsupported contentType (僅允許 jpeg / png / webp / pdf)" },
      { status: 400 },
    );
  }

  // v356：大小上限 8MB
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "request too large" }, { status: 413 });
  }

  // v356：只有 payments / avatars 開給一般登入會員上傳；其餘 prefix 需 coach/admin
  if (!["payments", "avatars"].includes(data.prefix)) {
    const role = requireRole(auth.user, ["coach", "admin"]);
    if (!role.ok) {
      return NextResponse.json({ error: role.message }, { status: role.status });
    }
  }

  // payments prefix 強制 scope = userId，避免互相覆蓋
  const scope =
    data.prefix === "payments"
      ? auth.lineUserId.slice(0, 8)
      : data.prefix === "avatars"
      ? auth.lineUserId.slice(0, 8)
      : data.scope;

  const prefix = data.prefix as R2Prefix;
  const key = makeKey(prefix, data.filename, scope);
  const url = await presignPutUrl(prefix, key, data.contentType, 300);
  const priv = isPrivate(prefix);

  return NextResponse.json({
    url,
    key,
    prefix,
    bucket: bucketFor(prefix),
    private: priv,
    // private bucket 不會有公開 URL；client 之後要看圖時呼叫 /api/uploads/preview?key=...
    publicUrl: priv ? null : publicUrl(key),
    expiresInSec: 300,
  });
}
