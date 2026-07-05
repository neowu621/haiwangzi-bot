// v798：付款證明圖片 —— base64 dataURL → R2（payments/ 私密 bucket）。
//   背景：公開付款連結 /api/pay 原本把整包 base64 存進 paymentProof.imageKey（DB），
//   iPhone 截圖可達數 MB → 老闆核對頁把它整包回傳 → LINE WebView 當機。
//   本模組：①新上傳一律先上 R2、DB 只存 key ②舊的 base64 資料在被讀到時「懶修復」搬上 R2。
import { prisma } from "@/lib/prisma";

const DATA_URL_RE = /^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** dataURL → 上傳 R2，回 R2 key；R2 沒設定/格式不對/上傳失敗 → null（呼叫端自行 fallback）。 */
export async function uploadProofImageToR2(
  dataUrl: string,
  bookingId: string,
): Promise<string | null> {
  try {
    const m = DATA_URL_RE.exec(dataUrl);
    if (!m) return null;
    const { r2Configured, putBuffer, makeKey } = await import("@/lib/r2");
    if (!r2Configured()) return null;
    const contentType = m[1].toLowerCase();
    const ext = contentType.includes("png") ? ".png" : contentType.includes("webp") ? ".webp" : ".jpg";
    const buf = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
    if (buf.length === 0) return null;
    const key = makeKey("payments", `paylink${ext}`, bookingId);
    await putBuffer("payments", key, buf, contentType);
    return key;
  } catch (e) {
    console.error("[uploadProofImageToR2]", e);
    return null;
  }
}

/**
 * 懶修復：若 proof.imageKey 是 base64 dataURL → 搬上 R2 並更新 DB，回新 R2 key。
 * 搬失敗回 null（呼叫端決定要不要直接回 base64 / 截斷）。
 */
export async function repairBase64ProofImage(proof: {
  id: string;
  bookingId: string;
  imageKey: string | null;
}): Promise<string | null> {
  if (!proof.imageKey?.startsWith("data:")) return null;
  const key = await uploadProofImageToR2(proof.imageKey, proof.bookingId);
  if (!key) return null;
  await prisma.paymentProof
    .update({ where: { id: proof.id }, data: { imageKey: key } })
    .catch(() => {});
  return key;
}
