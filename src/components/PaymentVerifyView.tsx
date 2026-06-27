"use client";
// v619：獨立付款核對畫面（手機 LIFF + 瀏覽器後台共用）。
//   只負責呈現 + 呼叫 verify/reject；fetchJson 由各端注入（LIFF=liff.fetchWithAuth / 後台=adminFetch）。
//   核對 API 走 /api/admin/payment-proofs/[id]/*（authFromRequest 統一驗證，admin/boss）。
import { useCallback, useEffect, useState } from "react";
import { PriceBreakdown, type PriceBreakdownData } from "@/components/admin/PriceBreakdown";

type Fetcher = <T = unknown>(url: string, init?: RequestInit) => Promise<T>;

interface GearItem { itemType?: string; label?: string; price: number; qty?: number }

interface ProofData {
  proof: {
    id: string; type: string; amount: number; last5: string | null;
    uploadedAt: string; verifiedAt: string | null; rejectedAt: string | null;
    imageUrl: string | null; hasImage: boolean;
  };
  booking: {
    id: string; code: string; type: string; status: string; customer: string;
    participants: number; activity: string; activityDate: string; activitySite: string;
    tripBooked: number | null; tripCapacity: number | null;
    notes: string | null; adminNotes: string | null;
    totalAmount: number; depositAmount: number; paidAmount: number;
    priceBreakdown?: PriceBreakdownData | null;
    creditUsed?: number; rentalGear?: GearItem[] | null; tankCount?: number | null;
    tripExtraTank?: number; tripBaseTrip?: number; tripIsBoat?: boolean;
  };
}

const TYPE_LABEL: Record<string, string> = { deposit: "訂金", final: "尾款", refund: "退款" };
const ntd = (n: number) => `NT$ ${n.toLocaleString()}`;

export function PaymentVerifyView({
  proofId,
  fetchJson,
  onDone,
}: {
  proofId: string;
  fetchJson: Fetcher;
  onDone?: () => void;
}) {
  const [data, setData] = useState<ProofData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetchJson<ProofData>(`/api/admin/payment-proofs/${proofId}`);
      setData(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [proofId, fetchJson]);

  useEffect(() => { void load(); }, [load]);

  async function approve() {
    if (!data || busy) return;
    if (!confirm(`確認「${TYPE_LABEL[data.proof.type] ?? ""} ${ntd(data.proof.amount)}」入帳？\n會計入已付款並更新訂單狀態。`)) return;
    setBusy("approve");
    try {
      await fetchJson(`/api/admin/payment-proofs/${proofId}/verify`, { method: "POST" });
      setDone("approved");
    } catch (e) {
      alert("核可失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!data || busy) return;
    const reason = prompt("退回原因（會通知客戶重新提供正確資訊）：", "金額或後5碼與實際入帳不符，請重新確認後再上傳。");
    if (reason === null) return;
    if (!reason.trim()) { alert("請填寫退回原因"); return; }
    setBusy("reject");
    try {
      await fetchJson(`/api/admin/payment-proofs/${proofId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setDone("rejected");
    } catch (e) {
      alert("退回失敗：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">載入核對資料中…</div>;
  if (err) {
    if (/role|forbidden|403/i.test(err)) {
      return (
        <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
          <div className="text-2xl">🔒</div>
          <div className="mt-1 font-semibold text-[var(--color-ocean-deep)]">此功能僅限 管理者 / 老闆 / IT</div>
          <div className="mt-1 text-[12px]">收款核對是老闆職責，教練 / 助教不經手款項。</div>
        </div>
      );
    }
    return <div className="px-4 py-12 text-center text-sm text-[var(--color-coral)]">讀取失敗：{err}</div>;
  }
  if (!data) return null;

  const { proof, booking } = data;
  const alreadyDone = done || (proof.verifiedAt ? "approved" : proof.rejectedAt ? "rejected" : null);

  return (
    <div className="mx-auto max-w-md px-4 py-4">
      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "var(--border)" }}>
        {/* 標題 */}
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <span className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--color-ocean-deep)]">💳 付款核對</span>
          {alreadyDone === "approved" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ 已入帳</span>
          ) : alreadyDone === "rejected" ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">↩ 已退回</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">待核對</span>
          )}
        </div>

        {/* 資訊 */}
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-3 text-[13px]">
          <span className="text-[var(--muted-foreground)]">訂單</span>
          <span className="font-medium">{booking.code} ・ {booking.customer}（{booking.participants} 位）</span>
          {(booking.activityDate || booking.activitySite) && (<>
            <span className="text-[var(--muted-foreground)]">出團</span>
            <span>{booking.activityDate}{booking.activitySite ? `　${booking.activitySite}` : ""}</span>
          </>)}
          {booking.tripBooked != null && (<>
            <span className="text-[var(--muted-foreground)]">目前已參加</span>
            <span className="font-medium">{booking.tripBooked}{booking.tripCapacity != null ? ` / ${booking.tripCapacity}` : ""} 位</span>
          </>)}
          <span className="text-[var(--muted-foreground)]">類型</span>
          <span>{TYPE_LABEL[proof.type] ?? proof.type}</span>
          <span className="text-[var(--muted-foreground)]">金額</span>
          <span className="font-semibold text-[var(--color-ocean-deep)]">{ntd(proof.amount)}</span>
          <span className="text-[var(--muted-foreground)]">帳號後 5 碼</span>
          <span className="font-mono font-semibold">{proof.last5 ?? "—（客戶未填）"}</span>
          <span className="text-[var(--muted-foreground)]">已付 / 總額</span>
          <span>{ntd(booking.paidAmount)} / {ntd(booking.totalAmount)}</span>
        </div>

        {/* v717：款項明細(組成) — 讓老闆核對金額是否正確 */}
        <div className="mx-4 mb-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "#F7FAFC" }}>
          <p className="mb-1 text-[11px] font-semibold text-[var(--color-ocean-deep)]">📋 款項明細</p>
          <PriceBreakdown
            pb={booking.priceBreakdown ?? null}
            fallback={{
              type: booking.type as "daily" | "tour" | undefined,
              totalAmount: booking.totalAmount,
              creditUsed: booking.creditUsed,
              rentalGear: booking.rentalGear ?? undefined,
              tankCount: booking.tankCount,
              participants: booking.participants,
              extraTank: booking.tripExtraTank,
              baseTrip: booking.tripBaseTrip,
              isBoat: booking.tripIsBoat,
            }}
          />
        </div>

        {/* 客戶備註 / 管理備註 */}
        {(booking.notes || booking.adminNotes) && (
          <div className="mx-4 mb-1 space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[12px]">
            {booking.notes && (
              <div className="flex gap-1.5 text-amber-900"><span className="shrink-0 font-semibold">📝 客戶備註</span><span>{booking.notes}</span></div>
            )}
            {booking.adminNotes && (
              <div className="flex gap-1.5 text-slate-700"><span className="shrink-0 font-semibold">🔒 管理備註</span><span>{booking.adminNotes}</span></div>
            )}
          </div>
        )}

        {/* 截圖 */}
        <div className="px-4 pb-1">
          <p className="mb-1.5 text-[11px] text-[var(--muted-foreground)]">客戶上傳的付款截圖（點可放大）</p>
          {proof.imageUrl ? (
            <a href={proof.imageUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img src={proof.imageUrl} alt="付款截圖" className="max-h-72 w-full rounded-lg border object-contain" style={{ borderColor: "var(--border)" }} />
            </a>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-[var(--muted-foreground)]" style={{ borderColor: "var(--border)" }}>
              <span className="text-2xl opacity-50">🖼️</span>
              {proof.hasImage ? "（圖片已清理 / 載入失敗）" : "無圖片（客戶僅填後 5 碼）"}
            </div>
          )}
        </div>

        {/* 按鈕 / 結果 */}
        <div className="px-4 pb-4 pt-3">
          {alreadyDone ? (
            <div className="rounded-lg bg-[var(--muted)] px-3 py-3 text-center text-sm text-[var(--muted-foreground)]">
              {alreadyDone === "approved" ? "✓ 此筆已確認入帳，無需再處理。" : "↩ 此筆已退回，已通知客戶重新提供。"}
              {onDone && (
                <button onClick={onDone} className="mt-2 block w-full rounded-md border px-3 py-1.5 text-sm" style={{ borderColor: "var(--border)" }}>返回</button>
              )}
            </div>
          ) : (
            <>
              <div className="flex gap-2.5">
                <button onClick={approve} disabled={!!busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--color-phosphor)" }}>
                  {busy === "approve" ? "處理中…" : "✓ 確認入帳"}
                </button>
                <button onClick={reject} disabled={!!busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold text-[var(--color-coral)] disabled:opacity-50"
                  style={{ borderColor: "var(--color-coral)" }}>
                  {busy === "reject" ? "處理中…" : "↩ 退回（資訊不符）"}
                </button>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                ℹ️「確認入帳」才會計入已付款；「退回」會通知客戶重新提供正確資訊。請看完截圖再決定。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
