// v302：把 payment_proofs 與 bookings.signatureImageKey 內嵌的 base64 圖片
// 一次性遷移到 R2，把 DB 變輕。
//   - 支援 ?dryRun=1 預覽
//   - 支援 ?limit=N（預設 100，避免單次 timeout）
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { authFromRequest, requireRole } from "@/lib/auth";
import { putBuffer, r2Configured } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 把 data:image/jpeg;base64,/9j/... 解析成 { contentType, buffer } */
function parseDataUrl(dataUrl: string): { contentType: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:([^;,]+)(?:;base64)?,(.+)$/);
  if (!m) return null;
  const contentType = m[1] || "application/octet-stream";
  const base64Part = m[2];
  try {
    const buffer = Buffer.from(base64Part, "base64");
    return { contentType, buffer };
  } catch {
    return null;
  }
}

function extFor(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("gif")) return "gif";
  return "jpg";
}

export async function POST(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth.ok)
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  const role = requireRole(auth.user, ["admin", "boss"]);
  if (!role.ok)
    return NextResponse.json({ error: role.message }, { status: role.status });

  if (!r2Configured()) {
    return NextResponse.json(
      { error: "R2 尚未設定環境變數，請先到「系統設定」確認 R2_* 環境變數" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  // ── PaymentProof base64 → R2 ──────────────────
  const proofsToMigrate = await prisma.paymentProof.findMany({
    where: { imageKey: { startsWith: "data:" } },
    select: { id: true, imageKey: true, uploadedAt: true },
    take: limit,
    orderBy: { uploadedAt: "asc" },
  });

  // ── Booking signatures base64 → R2 ────────────
  const sigsToMigrate = await prisma.booking.findMany({
    where: { signatureImageKey: { startsWith: "data:" } },
    select: { id: true, signatureImageKey: true, createdAt: true },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  if (dryRun) {
    const sampleProof = proofsToMigrate[0]?.imageKey?.slice(0, 60);
    const sampleSig = sigsToMigrate[0]?.signatureImageKey?.slice(0, 60);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      paymentProofs: { count: proofsToMigrate.length, sample: sampleProof },
      signatures: { count: sigsToMigrate.length, sample: sampleSig },
      note: `若 count >= ${limit}，可能還有更多，跑完一次後再跑一次直到 count = 0`,
    });
  }

  let proofsOk = 0;
  let proofsFail = 0;
  let proofsBytesFreed = 0;
  const proofErrors: string[] = [];
  for (const p of proofsToMigrate) {
    if (!p.imageKey) continue;
    const parsed = parseDataUrl(p.imageKey);
    if (!parsed) {
      proofsFail++;
      proofErrors.push(`${p.id}: 無法解析 data URL`);
      continue;
    }
    try {
      const key = `payments/${p.id}-${crypto.randomBytes(4).toString("hex")}.${extFor(parsed.contentType)}`;
      await putBuffer("payments", key, parsed.buffer, parsed.contentType);
      await prisma.paymentProof.update({
        where: { id: p.id },
        data: { imageKey: key },
      });
      proofsOk++;
      proofsBytesFreed += p.imageKey.length;
    } catch (e) {
      proofsFail++;
      proofErrors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let sigsOk = 0;
  let sigsFail = 0;
  let sigsBytesFreed = 0;
  const sigErrors: string[] = [];
  for (const b of sigsToMigrate) {
    if (!b.signatureImageKey) continue;
    const parsed = parseDataUrl(b.signatureImageKey);
    if (!parsed) {
      sigsFail++;
      sigErrors.push(`${b.id}: 無法解析 data URL`);
      continue;
    }
    try {
      const key = `signatures/${b.id}-${crypto.randomBytes(4).toString("hex")}.${extFor(parsed.contentType)}`;
      await putBuffer("signatures", key, parsed.buffer, parsed.contentType);
      await prisma.booking.update({
        where: { id: b.id },
        data: { signatureImageKey: key },
      });
      sigsOk++;
      sigsBytesFreed += b.signatureImageKey.length;
    } catch (e) {
      sigsFail++;
      sigErrors.push(`${b.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    paymentProofs: {
      scanned: proofsToMigrate.length,
      migrated: proofsOk,
      failed: proofsFail,
      errors: proofErrors.slice(0, 10),
      bytesFreed: proofsBytesFreed,
      kbFreed: Math.round(proofsBytesFreed / 1024),
    },
    signatures: {
      scanned: sigsToMigrate.length,
      migrated: sigsOk,
      failed: sigsFail,
      errors: sigErrors.slice(0, 10),
      bytesFreed: sigsBytesFreed,
      kbFreed: Math.round(sigsBytesFreed / 1024),
    },
    hint: proofsToMigrate.length === limit || sigsToMigrate.length === limit
      ? `已達單次上限 ${limit}，可能還有更多，再跑一次 POST /api/admin/backfill-base64-to-r2`
      : "✅ 所有 base64 已遷移完畢",
  });
}
