import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  r2Client,
  r2Configured,
  bucketFor,
  publicUrl,
  presignGetUrl,
  deleteObject,
  R2_PUBLIC_BUCKET,
  R2_PRIVATE_BUCKET,
  R2_PUBLIC_URL,
} from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/cron/test-r2
//   驗證 R2 設定（public + private 兩個 bucket 都測）
//   流程：
//     1. 上傳一張 1x1 透明 PNG 到 public bucket (key: test/<timestamp>.png)
//     2. 上傳同樣檔到 private bucket
//     3. fetch public URL 看是否 200（驗 R2_PUBLIC_URL + NEXT_PUBLIC_R2_PUBLIC_BASE）
//     4. 產生 private bucket presigned GET，fetch 看是否 200
//     5. 都成功 → 清理測試檔
//     6. 任何步驟失敗 → 回報哪裡卡住
//
// curl -X POST https://haiwangzi.zeabur.app/api/cron/test-r2 \
//   -H "Authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "server_misconfigured: CRON_SECRET not set" },
      { status: 500 },
    );
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!r2Configured()) {
    return NextResponse.json(
      {
        error: "r2_not_configured",
        hint: "請在 Zeabur 設 R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY",
        envState: {
          R2_ACCOUNT_ID: !!process.env.R2_ACCOUNT_ID,
          R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
          R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
          R2_PUBLIC_URL: !!process.env.R2_PUBLIC_URL,
          R2_PUBLIC_BUCKET,
          R2_PRIVATE_BUCKET,
        },
      },
      { status: 503 },
    );
  }

  // 1x1 透明 PNG
  const tinyPng = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
      "1f15c4890000000d49444154789c63000100000005000146cfe2d80000" +
      "000049454e44ae426082",
    "hex",
  );

  const ts = Date.now();
  const publicKey = `test/r2-test-${ts}.png`;
  const privateKey = `test/r2-test-${ts}.png`;

  const result: Record<string, unknown> = {
    publicBucket: R2_PUBLIC_BUCKET,
    privateBucket: R2_PRIVATE_BUCKET,
    publicBaseUrl: R2_PUBLIC_URL || null,
  };

  // ── 1. PUT to public bucket ─────────────────────────────────
  try {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: bucketFor("sites"), // public
        Key: publicKey,
        Body: tinyPng,
        ContentType: "image/png",
      }),
    );
    result.publicPut = { ok: true, key: publicKey };
  } catch (e) {
    result.publicPut = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    return NextResponse.json(
      { ...result, failed: "public_put" },
      { status: 500 },
    );
  }

  // ── 2. PUT to private bucket ────────────────────────────────
  try {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: bucketFor("payments"), // private
        Key: privateKey,
        Body: tinyPng,
        ContentType: "image/png",
      }),
    );
    result.privatePut = { ok: true, key: privateKey };
  } catch (e) {
    result.privatePut = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    return NextResponse.json(
      { ...result, failed: "private_put" },
      { status: 500 },
    );
  }

  // ── 3. Fetch public URL ────────────────────────────────────
  const pubUrl = publicUrl(publicKey);
  result.publicUrl = pubUrl;
  if (!R2_PUBLIC_URL) {
    result.publicFetch = {
      ok: false,
      skipped: true,
      reason:
        "R2_PUBLIC_URL 未設，無法 fetch 公開連結（圖片仍在 R2，只是 client 拼不出 URL）",
    };
  } else {
    try {
      const r = await fetch(pubUrl);
      result.publicFetch = {
        ok: r.ok,
        status: r.status,
        contentType: r.headers.get("content-type"),
        contentLength: r.headers.get("content-length"),
      };
    } catch (e) {
      result.publicFetch = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ── 4. Presigned GET for private + fetch ─────────────────────
  try {
    const signedUrl = await presignGetUrl("payments", privateKey, 60);
    result.privateSignedUrl = signedUrl.slice(0, 80) + "...(truncated)";
    const r = await fetch(signedUrl);
    result.privateFetch = {
      ok: r.ok,
      status: r.status,
      contentType: r.headers.get("content-type"),
      contentLength: r.headers.get("content-length"),
    };
  } catch (e) {
    result.privateFetch = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ── 5. Cleanup ──────────────────────────────────────────────
  const cleanup: Record<string, unknown> = {};
  try {
    await deleteObject("sites", publicKey);
    cleanup.public = "deleted";
  } catch (e) {
    cleanup.public = "delete failed: " + (e instanceof Error ? e.message : "?");
  }
  try {
    await deleteObject("payments", privateKey);
    cleanup.private = "deleted";
  } catch (e) {
    cleanup.private = "delete failed: " + (e instanceof Error ? e.message : "?");
  }
  result.cleanup = cleanup;

  // 總結
  const allOk =
    (result.publicPut as { ok: boolean }).ok &&
    (result.privatePut as { ok: boolean }).ok &&
    ((result.publicFetch as { ok: boolean })?.ok ?? false) &&
    ((result.privateFetch as { ok: boolean })?.ok ?? false);

  return NextResponse.json({
    summary: allOk
      ? "✓ R2 public + private 都正常，圖片上傳功能完整可用"
      : "⚠ 有部分步驟失敗，看 detail",
    allOk,
    ...result,
  });
}
