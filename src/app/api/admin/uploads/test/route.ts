/**
 * v230：檔案上傳設定診斷
 *
 * GET  /api/admin/uploads/test — 回傳 R2 設定狀態（讀環境變數，不執行上傳）
 * POST /api/admin/uploads/test — 嘗試實際上傳一個 1 KB 測試檔到 R2 並驗證
 *   - 成功：回傳上傳 URL + 下載 presigned URL
 *   - 失敗：回傳具體錯誤訊息（缺哪個 env / network / permission 等）
 */
import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, requireRole } from "@/lib/auth";
import {
  r2Configured,
  presignPutUrl,
  presignGetUrl,
  makeKey,
  R2_PUBLIC_BUCKET,
  R2_PRIVATE_BUCKET,
} from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  return NextResponse.json({
    configured: r2Configured(),
    accountId: process.env.R2_ACCOUNT_ID ? "✓ 已設" : "✗ 未設",
    accessKeyId: process.env.R2_ACCESS_KEY_ID
      ? `✓ 已設（${process.env.R2_ACCESS_KEY_ID.slice(0, 6)}...）`
      : "✗ 未設",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ? "✓ 已設" : "✗ 未設",
    endpoint: process.env.R2_ENDPOINT ?? null,
    publicBucket: R2_PUBLIC_BUCKET,
    privateBucket: R2_PRIVATE_BUCKET,
    publicUrl: process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_BASE ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });

  if (!r2Configured()) {
    return NextResponse.json(
      {
        ok: false,
        step: "config",
        error: "R2 未設定，請先在 Zeabur 設定 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY",
      },
      { status: 503 },
    );
  }

  const testKey = makeKey("payments", "_test.txt", "admin-test");
  const testContent = `R2 connectivity test\nadmin: ${auth.user.lineUserId.slice(0, 10)}\nat: ${new Date().toISOString()}\n`;

  // Step 1：產生 presigned PUT URL
  let putUrl: string;
  try {
    putUrl = await presignPutUrl("payments", testKey, "text/plain", 60);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        step: "presign",
        error: e instanceof Error ? e.message : String(e),
        hint: "presign 失敗 — 通常是 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY 錯誤",
      },
      { status: 500 },
    );
  }

  // Step 2：實際 PUT 一個 1 KB 測試檔
  try {
    const putRes = await fetch(putUrl, {
      method: "PUT",
      body: testContent,
      headers: { "Content-Type": "text/plain" },
    });
    if (!putRes.ok) {
      const body = await putRes.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          step: "upload",
          error: `R2 拒絕上傳：HTTP ${putRes.status}`,
          detail: body.slice(0, 300),
          hint: "通常是 bucket 不存在、API token 沒寫入權限、或 endpoint 錯誤",
        },
        { status: 500 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        step: "upload",
        error: e instanceof Error ? e.message : String(e),
        hint: "網路無法連到 R2 endpoint，請檢查 R2_ENDPOINT 或 R2_ACCOUNT_ID",
      },
      { status: 500 },
    );
  }

  // Step 3：產生下載 URL 驗證
  let getUrl: string;
  try {
    getUrl = await presignGetUrl("payments", testKey, 60);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        step: "presign-get",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "R2 上傳測試通過 ✓",
    step: "complete",
    testKey,
    bucket: R2_PRIVATE_BUCKET,
    downloadUrl: getUrl,
    size: testContent.length,
    note: "下載 URL 60 秒內有效；R2 設定正常運作中",
  });
}
