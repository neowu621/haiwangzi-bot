// v949：後台圖片「伺服器端上傳」—— 瀏覽器把(已最佳化的)圖傳到這裡，由伺服器 putBuffer 寫入 R2。
//   避開瀏覽器直接 PUT R2 的 CORS 問題；限 admin/boss；目前只開放 media(公開桶)。
import { NextRequest, NextResponse } from "next/server";
import { authFromRequest, requireRole } from "@/lib/auth";
import { makeKey, putBuffer, publicUrl, r2Configured, type R2Prefix } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: R2Prefix[] = ["media"];

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok) return NextResponse.json({ error: role.message }, { status: role.status });
  if (!r2Configured()) return NextResponse.json({ error: "R2 未設定（缺 R2_ACCOUNT_ID/KEY）" }, { status: 503 });

  const url = new URL(req.url);
  const prefix = (url.searchParams.get("prefix") ?? "media") as R2Prefix;
  if (!ALLOWED.includes(prefix)) return NextResponse.json({ error: "prefix 不允許" }, { status: 400 });
  const filename = (url.searchParams.get("filename") ?? "cover.webp").replace(/[^\w.\-]/g, "_").slice(0, 120) || "cover.webp";
  const contentType = req.headers.get("content-type") || "image/webp";
  if (!contentType.startsWith("image/")) return NextResponse.json({ error: "只接受圖片" }, { status: 400 });

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) return NextResponse.json({ error: "空檔案" }, { status: 400 });
  if (buf.length > 5_000_000) return NextResponse.json({ error: "檔案過大（>5MB）" }, { status: 413 });

  const key = makeKey(prefix, filename);
  try {
    await putBuffer(prefix, key, buf, contentType);
  } catch (e) {
    return NextResponse.json({ error: "R2 寫入失敗：" + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, key, publicUrl: publicUrl(key), bytes: buf.length });
}
