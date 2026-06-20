/**
 * v260：簽名圖上傳到 R2
 *
 * 客戶端送 data URL (`data:image/png;base64,xxx`) 過來，後端解 base64 → 上 R2 private bucket。
 *
 * 法律證據相關設計：
 *  - 一律存 PNG（無失真）
 *  - 檔名含 bookingId + 時間戳，方便回溯
 *  - 不會被 30 天自動清除規則砍（不在 expire-trip-photos / expire-payment-proofs 範圍）
 *  - 用 private bucket，admin 查訂單時透過 presigned URL 看
 */
import { putBuffer, r2Configured } from "./r2";

export interface UploadSignatureResult {
  ok: boolean;
  key?: string;
  skipped?: boolean;
  reason?: string;
}

/**
 * 解碼 data URL 並上傳到 R2 private bucket
 * @returns { ok, key }，失敗時 ok=false。R2 未設定時 skipped=true（不阻擋下單流程）
 */
export async function uploadSignatureFromDataUrl(
  dataUrl: string,
  bookingId: string,
): Promise<UploadSignatureResult> {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return { ok: false, reason: "invalid data url" };
  }
  if (!r2Configured()) {
    // R2 未設定（dev / 環境變數缺）→ 不阻擋下單，但回 skipped
    console.warn("[signature upload] R2 not configured, skipping");
    return { ok: false, skipped: true, reason: "R2 not configured" };
  }

  // data:image/png;base64,iVBORw0KGgoAAAA...
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return { ok: false, reason: "malformed data url" };
  const meta = dataUrl.slice(5, commaIdx); // "image/png;base64"
  const base64 = dataUrl.slice(commaIdx + 1);
  const contentType = meta.split(";")[0] || "image/png";

  try {
    const buf = Buffer.from(base64, "base64");
    // 簡單 sanity check：不要存超過 2MB 的圖（防呆，800x300 PNG 一般 < 100KB）
    if (buf.byteLength > 2 * 1024 * 1024) {
      return { ok: false, reason: "signature too large (>2MB)" };
    }
    const ts = Date.now();
    // v614：副檔名依實際格式（簽名已改 JPEG 上傳）；content-type 仍以實際為準。
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const key = `signatures/${bookingId}-${ts}.${ext}`;
    await putBuffer("signatures", key, buf, contentType);
    return { ok: true, key };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[signature upload] failed", { bookingId, error: msg });
    return { ok: false, reason: msg };
  }
}
