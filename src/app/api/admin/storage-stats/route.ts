// v302：儲存統計 — payment_proofs / signatures 等的 R2 vs base64 比例
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  // payment_proofs 統計
  const proofs = await prisma.$queryRaw<
    Array<{ storage: string; cnt: bigint; total_bytes: bigint }>
  >`
    SELECT
      CASE
        WHEN image_key LIKE 'data:%'      THEN 'base64'
        WHEN image_key LIKE 'payments/%'  THEN 'r2'
        WHEN image_key IS NULL            THEN 'no_image'
        ELSE 'other'
      END AS storage,
      COUNT(*)::bigint AS cnt,
      COALESCE(SUM(LENGTH(image_key)), 0)::bigint AS total_bytes
    FROM payment_proofs
    GROUP BY storage
    ORDER BY cnt DESC;
  `;

  // signatures（user.signatureImageKey 之類；schema 在 booking）
  const sigs = await prisma.$queryRaw<
    Array<{ storage: string; cnt: bigint; total_bytes: bigint }>
  >`
    SELECT
      CASE
        WHEN signature_image_key LIKE 'data:%'        THEN 'base64'
        WHEN signature_image_key LIKE 'signatures/%'  THEN 'r2'
        WHEN signature_image_key IS NULL              THEN 'no_image'
        ELSE 'other'
      END AS storage,
      COUNT(*)::bigint AS cnt,
      COALESCE(SUM(LENGTH(signature_image_key)), 0)::bigint AS total_bytes
    FROM bookings
    GROUP BY storage
    ORDER BY cnt DESC;
  `;

  // 整理成方便讀的格式
  const toRows = (rows: typeof proofs) =>
    rows.map((r) => ({
      storage: r.storage,
      count: Number(r.cnt),
      bytes: Number(r.total_bytes),
      kb: Math.round(Number(r.total_bytes) / 1024),
      mb: +(Number(r.total_bytes) / 1024 / 1024).toFixed(2),
    }));

  return NextResponse.json({
    paymentProofs: toRows(proofs),
    signatures: toRows(sigs),
    hints: {
      r2_normal: "✅ R2 雲端，DB 只存 key",
      base64: "⚠ DB 內嵌（fallback）— 可考慮跑 backfill 遷到 R2",
      no_image: "客戶只填後 5 碼沒附圖（OK）",
    },
  });
}
