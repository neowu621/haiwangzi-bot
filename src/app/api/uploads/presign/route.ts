import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authFromRequest } from "@/lib/auth";
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

const BodySchema = z.object({
  prefix: z.enum(["payments", "sites", "avatars", "richmenu"]),
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

  // 簡單的 contentType 白名單
  if (!/^(image|application\/pdf)/.test(data.contentType)) {
    return NextResponse.json(
      { error: "unsupported contentType (僅允許 image/* 或 PDF)" },
      { status: 400 },
    );
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
