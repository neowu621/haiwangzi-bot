// v612：簽名 DB-buffer 補傳 R2。
//
// 下單時把簽名 base64 先存進 booking.signaturePending（快、永久不掉）→ 立刻回應。
// 本檔負責把暫存的簽名上傳到 R2：成功 → 設 signatureImageKey + 清空 pending；失敗 → 保留等重試。
//   - 下單後立即 fire-and-forget 呼叫 flushPendingSignature（最佳路徑）。
//   - cron /api/cron/flush-signatures 定期掃描補傳（崩潰/重啟/R2 暫時故障的保險）。
import { prisma } from "./prisma";
import { uploadSignatureFromDataUrl } from "./signature";

/** 補傳單筆 booking 的暫存簽名。回傳是否成功上傳。 */
export async function flushPendingSignature(bookingId: string): Promise<boolean> {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, signaturePending: true },
  });
  const pending = (b as unknown as { signaturePending?: string | null } | null)?.signaturePending;
  if (!pending) return false;

  const up = await uploadSignatureFromDataUrl(pending, bookingId);
  if (up.ok && up.key) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        signatureImageKey: up.key,
        signaturePending: null,
        signaturePendingAt: null,
      } as never,
    });
    return true;
  }
  // R2 未設定（dev）→ 清掉 pending 避免 cron 無止盡重試；其餘失敗保留 pending 等下次重試。
  if (up.skipped) {
    await prisma.booking
      .update({ where: { id: bookingId }, data: { signaturePending: null, signaturePendingAt: null } as never })
      .catch(() => {});
  }
  return false;
}

/** 掃描所有「有暫存簽名」的 booking 補傳（cron 用）。回傳嘗試/成功數。 */
export async function flushAllPendingSignatures(limit = 50): Promise<{ tried: number; ok: number }> {
  const rows = await prisma.booking.findMany({
    where: { signaturePending: { not: null } } as never,
    select: { id: true },
    take: limit,
    orderBy: { signaturePendingAt: "asc" } as never,
  });
  let ok = 0;
  for (const r of rows) {
    try {
      if (await flushPendingSignature(r.id)) ok += 1;
    } catch (e) {
      console.error("[flushAllPendingSignatures]", r.id, e);
    }
  }
  return { tried: rows.length, ok };
}
